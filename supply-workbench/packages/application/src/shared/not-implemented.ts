export class NotImplementedError extends Error {
  readonly card: string;

  constructor(card: string) {
    super(`NotImplemented: ${card}`);
    this.name = 'NotImplementedError';
    this.card = card;
  }
}

export function unimplemented(card: string): never {
  throw new NotImplementedError(card);
}
