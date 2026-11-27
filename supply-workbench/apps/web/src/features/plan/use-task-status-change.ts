import { useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from 'react';
import { apiErrorMessage } from '../../shared/api/client.js';
import type { WorkItemStatus } from '../today/index.js';
import { changeWorkItemStatus } from './api.js';
import { createStatusMachine, idleStatusFlow, type StatusFlow, type StatusMachine, type StatusPost } from './model/task-status-flow.js';

type TaskStatusPost = StatusPost & { readonly id: string };

export function gateStatusPost(machine: StatusMachine, id: string | null): TaskStatusPost | null {
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

type StatusInput = {
  readonly status: WorkItemStatus | null;
  readonly workItemId: string | null;
  readonly onReload: () => void;
  readonly onChanged: () => void;
};

export function useTaskStatusChange(input: StatusInput): TaskStatusChange {
  const machines = useRef(new Map<string, StatusMachine>()).current;
  const latest = useRef(input);
  useLayoutEffect(() => { latest.current = input; }, [input]);
  const [, publish] = useReducer((revision: number) => revision + 1, 0);
  const { workItemId, status } = input;
  const selected = workItemId === null ? undefined : machines.get(workItemId);
  useEffect(() => () => {
    if (workItemId !== null && machines.get(workItemId)?.flow().kind !== 'submitting') machines.delete(workItemId);
  }, [machines, workItemId]);
  useEffect(() => {
    if (selected === undefined || status === null) return;
    const previous = selected.flow();
    selected.shown(status);
    if (selected.flow() !== previous) publish();
  }, [selected, status]);
  return {
    flow: selected?.flow() ?? idleStatusFlow,
    request(to) {
      if (workItemId === null || status === null) return;
      const machine = machines.get(workItemId) ?? createStatusMachine();
      machines.set(workItemId, machine);
      machine.request(status, to);
      publish();
    },
    cancel() { selected?.cancel(); publish(); },
    commit() {
      if (selected === undefined || status === null) return;
      const post = gateStatusPost(selected, workItemId);
      if (post === null) return;
      publish();
      void saveStatus({ machines, machine: selected, post, latest, publish });
    },
  };
}

async function saveStatus({ machines, machine, post, latest, publish }: {
  readonly machines: Map<string, StatusMachine>;
  readonly machine: StatusMachine;
  readonly post: TaskStatusPost;
  readonly latest: RefObject<StatusInput>;
  readonly publish: () => void;
}): Promise<void> {
  try {
    await changeWorkItemStatus({ id: post.id, status: post.to });
  } catch (error: unknown) {
    if (latest.current.workItemId === post.id) {
      machine.fail(post.request, statusErrorText(error));
      publish();
    } else machines.delete(post.id);
    return;
  }
  const current = latest.current;
  if (current.workItemId === post.id) {
    machine.succeed(post.request);
    if (current.status !== null) machine.shown(current.status);
    publish();
  } else machines.delete(post.id);
  current.onReload();
  current.onChanged();
}
