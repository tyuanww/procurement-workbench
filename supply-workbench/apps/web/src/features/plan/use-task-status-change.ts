import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../shared/api/client.js';
import type { WorkItemStatus } from '../today/index.js';
import { changeWorkItemStatus } from './api.js';
import { createStatusMachine, type StatusFlow, type StatusMachine, type StatusPost } from './model/task-status-flow.js';

export function gateStatusPost(machine: StatusMachine, id: string | null): (StatusPost & { readonly id: string }) | null {
  if (id === null) return null;
  const taken = machine.commit();
  if (taken === null) return null;
  return { id, request: taken.request, to: taken.to };
}

export function statusErrorText(error: unknown): string {
  return apiErrorMessage(error) ?? '状态没有改成功。';
}

export type TaskStatusChange = {
  readonly flow: StatusFlow;
  readonly request: (to: WorkItemStatus) => void;
  readonly cancel: () => void;
  readonly commit: () => void;
};

type LiveRefs = {
  readonly status: { current: WorkItemStatus | null };
  readonly id: { current: string | null };
  readonly reload: { current: () => void };
  readonly changed: { current: () => void };
  readonly generation: { current: number };
};

export function useTaskStatusChange(input: {
  readonly status: WorkItemStatus | null;
  readonly detailId: string | null;
  readonly onReload: () => void;
  readonly onChanged: () => void;
}): TaskStatusChange {
  const machineRef = useRef<StatusMachine | null>(null);
  const machine = (): StatusMachine => (machineRef.current ??= createStatusMachine());
  const [flow, setFlow] = useState<StatusFlow>(() => machine().flow());
  const live = useLiveRefs(input);
  const publish = (): void => { setFlow(machine().flow()); };
  const publishRef = useRef(publish);
  publishRef.current = publish;
  useStatusLifetime({ machineRef, publishRef, generation: live.generation, detailId: input.detailId, status: input.status });
  return {
    flow,
    request: (to) => { requestStatus({ machine: machine(), live, to }); publish(); },
    cancel: () => { machine().cancel(); publish(); },
    commit: () => { commitStatus({ machine: machine(), live, publish }); },
  };
}

function useLiveRefs(input: {
  readonly status: WorkItemStatus | null;
  readonly detailId: string | null;
  readonly onReload: () => void;
  readonly onChanged: () => void;
}): LiveRefs {
  const status = useRef(input.status);
  const id = useRef(input.detailId);
  const reload = useRef(input.onReload);
  const changed = useRef(input.onChanged);
  const generation = useRef(0);
  status.current = input.status;
  id.current = input.detailId;
  reload.current = input.onReload;
  changed.current = input.onChanged;
  return { status, id, reload, changed, generation };
}

function useStatusLifetime(input: {
  readonly machineRef: { current: StatusMachine | null };
  readonly publishRef: { current: () => void };
  readonly generation: { current: number };
  readonly detailId: string | null;
  readonly status: WorkItemStatus | null;
}): void {
  useEffect(() => {
    const current = input.machineRef.current ?? createStatusMachine();
    input.machineRef.current = current;
    current.reset();
    input.publishRef.current();
    return () => { input.generation.current += 1; };
  }, [input.machineRef, input.publishRef, input.generation, input.detailId]);
  useEffect(() => {
    if (input.status === null || input.machineRef.current === null) return;
    input.machineRef.current.shown(input.status);
    input.publishRef.current();
  }, [input.machineRef, input.publishRef, input.status]);
}

function requestStatus(input: { readonly machine: StatusMachine; readonly live: LiveRefs; readonly to: WorkItemStatus }): void {
  const from = input.live.status.current;
  if (from === null) return;
  input.machine.request(from, input.to);
}

function commitStatus(input: { readonly machine: StatusMachine; readonly live: LiveRefs; readonly publish: () => void }): void {
  const taken = gateStatusPost(input.machine, input.live.id.current);
  input.publish();
  if (taken === null) return;
  const gen = input.live.generation.current;
  void changeWorkItemStatus({ id: taken.id, status: taken.to })
    .then(() => { acceptStatus({ ...input, request: taken.request, gen }); })
    .catch((error: unknown) => { rejectStatus({ ...input, request: taken.request, gen, error }); });
}

function acceptStatus(input: {
  readonly machine: StatusMachine;
  readonly live: LiveRefs;
  readonly publish: () => void;
  readonly request: number;
  readonly gen: number;
}): void {
  if (input.live.generation.current !== input.gen) {
    input.live.reload.current();
    input.live.changed.current();
    return;
  }
  input.machine.succeed(input.request);
  const shown = input.live.status.current;
  if (shown !== null) input.machine.shown(shown);
  input.publish();
  input.live.reload.current();
  input.live.changed.current();
}

function rejectStatus(input: {
  readonly machine: StatusMachine;
  readonly live: LiveRefs;
  readonly publish: () => void;
  readonly request: number;
  readonly gen: number;
  readonly error: unknown;
}): void {
  if (input.live.generation.current !== input.gen) return;
  input.machine.fail(input.request, statusErrorText(input.error));
  input.publish();
}
