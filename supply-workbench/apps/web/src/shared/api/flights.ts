export class ReadCancelled extends Error {
  constructor() {
    super('已取消');
    this.name = 'ReadCancelled';
  }
}

export type Shared<T> = {
  readonly promise: Promise<T>;
  readonly controller: AbortController;
  readonly generation: number;
  readonly isRetained: boolean;
  waiters: number;
};

const controllers = new Set<AbortController>();
let readLifetime = new AbortController();

export function readLifetimeSignal(): AbortSignal {
  return readLifetime.signal;
}

export function joinFlight<T>(input: {
  readonly table: Map<string, Shared<T>>;
  readonly key: string;
  readonly currentGeneration: () => number;
  readonly isRetained: boolean;
  readonly signal: AbortSignal | undefined;
  readonly load: (signal: AbortSignal) => Promise<T>;
  readonly keep?: (value: T) => void;
}): Promise<T> {
  const current = input.table.get(input.key);
  if (current !== undefined && current.generation === input.currentGeneration() && !current.controller.signal.aborted) {
    return watch(current, input.signal);
  }
  return startFlight(input);
}

export function abortFlights(): void {
  readLifetime.abort(new ReadCancelled());
  readLifetime = new AbortController();
  for (const controller of controllers) controller.abort();
  controllers.clear();
}

function startFlight<T>(input: {
  readonly table: Map<string, Shared<T>>;
  readonly key: string;
  readonly currentGeneration: () => number;
  readonly isRetained: boolean;
  readonly signal: AbortSignal | undefined;
  readonly load: (signal: AbortSignal) => Promise<T>;
  readonly keep?: (value: T) => void;
}): Promise<T> {
  const controller = new AbortController();
  const generation = input.currentGeneration();
  controllers.add(controller);
  const shared: Shared<T> = {
    controller,
    generation,
    isRetained: input.isRetained,
    waiters: 0,
    promise: input.load(controller.signal),
  };
  input.table.set(input.key, shared);
  void shared.promise.then(
    (value) => {
      if (input.currentGeneration() === generation) input.keep?.(value);
      release({ table: input.table, key: input.key, shared });
    },
    () => { release({ table: input.table, key: input.key, shared }); },
  );
  return watch(shared, input.signal);
}

function release<T>(input: { readonly table: Map<string, Shared<T>>; readonly key: string; readonly shared: Shared<T> }): void {
  controllers.delete(input.shared.controller);
  if (input.table.get(input.key) === input.shared) input.table.delete(input.key);
}

function watch<T>(shared: Shared<T>, signal: AbortSignal | undefined): Promise<T> {
  shared.waiters += 1;
  return new Promise((resolve, reject) => {
    let isSettled = false;
    const finish = (run: () => void) => {
      if (isSettled) return;
      isSettled = true;
      run();
    };
    if (signal?.aborted === true) {
      detach(shared);
      finish(() => reject(new ReadCancelled()));
      return;
    }
    const onAbort = () => {
      detach(shared);
      finish(() => reject(new ReadCancelled()));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    shared.promise.then(
      (value) => finish(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      }),
      (error: unknown) => finish(() => {
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      }),
    );
  });
}

function detach<T>(shared: Shared<T>): void {
  shared.waiters -= 1;
  if (shared.waiters === 0 && !shared.isRetained) shared.controller.abort();
}
