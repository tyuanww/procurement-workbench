import { workItemStatusLabel, type WorkItemStatus } from '../../today/index.js';

export type StatusStep = {
  readonly from: WorkItemStatus;
  readonly to: WorkItemStatus;
};

export type StatusFlow =
  | { readonly kind: 'idle'; readonly success: StatusStep | null }
  | { readonly kind: 'confirming'; readonly from: WorkItemStatus; readonly to: WorkItemStatus }
  | { readonly kind: 'submitting'; readonly from: WorkItemStatus; readonly to: WorkItemStatus; readonly request: number }
  | { readonly kind: 'refreshing'; readonly from: WorkItemStatus; readonly to: WorkItemStatus }
  | { readonly kind: 'failed'; readonly from: WorkItemStatus; readonly to: WorkItemStatus; readonly message: string };

export const idleStatusFlow: StatusFlow = { kind: 'idle', success: null };

export type StatusPost = {
  readonly request: number;
  readonly to: WorkItemStatus;
};

export type StatusMachine = {
  flow(): StatusFlow;
  request(from: WorkItemStatus, to: WorkItemStatus): void;
  cancel(): void;
  commit(): StatusPost | null;
  succeed(request: number): void;
  fail(request: number, message: string): void;
  shown(status: WorkItemStatus): void;
};

export function createStatusMachine(): StatusMachine {
  let flow: StatusFlow = idleStatusFlow;
  let seq = 0;
  return {
    flow: () => flow,
    request(from, to) {
      if (flow.kind !== 'idle' && flow.kind !== 'failed') return;
      if (from === to) return;
      flow = { kind: 'confirming', from, to };
    },
    cancel() {
      if (flow.kind !== 'confirming') return;
      flow = idleStatusFlow;
    },
    commit() {
      if (flow.kind !== 'confirming') return null;
      seq += 1;
      const request = seq;
      flow = { kind: 'submitting', from: flow.from, to: flow.to, request };
      return { request, to: flow.to };
    },
    succeed(request) {
      if (flow.kind !== 'submitting' || flow.request !== request) return;
      flow = { kind: 'refreshing', from: flow.from, to: flow.to };
    },
    fail(request, message) {
      if (flow.kind !== 'submitting' || flow.request !== request) return;
      flow = { kind: 'failed', from: flow.from, to: flow.to, message };
    },
    shown(status) {
      if (flow.kind !== 'refreshing' || status !== flow.to) return;
      flow = { kind: 'idle', success: { from: flow.from, to: flow.to } };
    },
  };
}

export function isStatusLocked(flow: StatusFlow): boolean {
  return flow.kind === 'confirming' || flow.kind === 'submitting' || flow.kind === 'refreshing';
}

export function statusFeedback(flow: StatusFlow): { readonly tone: 'success' | 'error'; readonly text: string } | null {
  if (flow.kind === 'refreshing' || (flow.kind === 'idle' && flow.success !== null)) {
    const step = flow.kind === 'refreshing' ? flow : flow.success;
    if (step === null) return null;
    return { tone: 'success', text: changedText(step) };
  }
  if (flow.kind === 'failed') return { tone: 'error', text: flow.message };
  return null;
}

export function confirmText(step: StatusStep): string {
  return `确认把状态从 ${workItemStatusLabel(step.from)} 改为 ${workItemStatusLabel(step.to)}？`;
}

function changedText(step: StatusStep): string {
  return `状态已从 ${workItemStatusLabel(step.from)} 改为 ${workItemStatusLabel(step.to)}。`;
}
