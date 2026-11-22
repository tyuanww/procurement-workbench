import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { ApiError } from '../../apps/web/src/shared/api/client.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { createStatusMachine, confirmText, statusFeedback } from '../../apps/web/src/features/plan/model/task-status-flow.js';
import { TaskActionBar, TaskStatusEditor } from '../../apps/web/src/features/plan/task-status-controls.js';
import { gateStatusPost, statusErrorText } from '../../apps/web/src/features/plan/use-task-status-change.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('确认前和取消确认都不产生提交', () => {
  const machine = createStatusMachine();
  machine.request('in_progress', 'blocked');
  machine.request('in_progress', 'done');
  machine.request('in_progress', 'cancelled');
  expect(machine.flow()).toEqual({ kind: 'confirming', from: 'in_progress', to: 'blocked' });
  machine.cancel();
  expect(machine.flow()).toEqual({ kind: 'idle', success: null });
  expect(gateStatusPost(machine, 'item-1')).toBeNull();
  machine.request('in_progress', 'in_progress');
  expect(gateStatusPost(machine, 'item-1')).toBeNull();
});

it('分段、完成、取消连点只放行一次提交', () => {
  const machine = createStatusMachine();
  machine.request('in_progress', 'blocked');
  const posts = [
    gateStatusPost(machine, 'item-1'),
    gateStatusPost(machine, 'item-1'),
    gateStatusPost(machine, 'item-1'),
  ].filter((post) => post !== null);
  expect(posts).toEqual([{ id: 'item-1', request: 1, to: 'blocked' }]);
  expect(machine.flow()).toMatchObject({ kind: 'submitting', from: 'in_progress', to: 'blocked', request: 1 });
  machine.request('in_progress', 'done');
  machine.request('in_progress', 'cancelled');
  expect(gateStatusPost(machine, 'item-1')).toBeNull();
});

it('失败留下原目标并可再确认提交', () => {
  const machine = createStatusMachine();
  machine.request('in_progress', 'done');
  const first = gateStatusPost(machine, 'item-1');
  expect(first).not.toBeNull();
  const message = statusErrorText(new ApiError('STATE_CONFLICT', { state: 'version 1 已被并发修改' }));
  machine.fail(first?.request ?? 0, message);
  expect(message).toBe('当前状态不允许这个操作');
  expect(machine.flow()).toMatchObject({ kind: 'failed', from: 'in_progress', to: 'done', message });
  machine.succeed(first?.request ?? 0);
  expect(machine.flow().kind).toBe('failed');
  machine.request('in_progress', 'done');
  const second = gateStatusPost(machine, 'item-1');
  expect(second).toEqual({ id: 'item-1', request: 2, to: 'done' });
});

it('成功先等详情变成目标状态，期间不能再提交', () => {
  const machine = createStatusMachine();
  machine.request('in_progress', 'blocked');
  const post = gateStatusPost(machine, 'item-1');
  machine.succeed(post?.request ?? 0);
  expect(machine.flow()).toMatchObject({ kind: 'refreshing', from: 'in_progress', to: 'blocked' });
  expect(statusFeedback(machine.flow())?.text).toBe('状态已从 进行中 改为 阻塞。');
  machine.shown('in_progress');
  expect(gateStatusPost(machine, 'item-1')).toBeNull();
  machine.shown('blocked');
  expect(machine.flow()).toEqual({ kind: 'idle', success: { from: 'in_progress', to: 'blocked' } });
  expect(statusFeedback(machine.flow())?.tone).toBe('success');
});

it('确认条文案写出原状态和目标状态，提交中禁用全部分段和底部按钮', () => {
  const confirming = markup(TaskStatusEditor, {
    status: 'in_progress',
    flow: { kind: 'confirming', from: 'in_progress', to: 'blocked' },
    onRequest: () => undefined,
    onCancel: () => undefined,
    onCommit: () => undefined,
  });
  expect(confirming).toContain(confirmText({ from: 'in_progress', to: 'blocked' }));
  expect(confirming).toContain('确认更改');
  expect(confirming).toContain('先不改');
  expect(confirming).not.toContain('保存中');

  const saving = markup(TaskStatusEditor, {
    status: 'in_progress',
    flow: { kind: 'submitting', from: 'in_progress', to: 'done', request: 1 },
    onRequest: () => undefined,
    onCancel: () => undefined,
    onCommit: () => undefined,
  });
  expect(saving).toContain('保存中');
  expect(saving).toContain('disabled');
  expect(saving).not.toContain('确认把状态从');

  const idleBar = markup(TaskActionBar, {
    status: 'in_progress',
    isSaving: false,
    onClose: () => undefined,
    onChange: () => undefined,
  });
  expect(idleBar).toContain('标记完成');
  expect(idleBar).toContain('取消任务');

  const lockedBar = markup(TaskActionBar, {
    status: 'in_progress',
    isSaving: true,
    isLocked: true,
    onClose: () => undefined,
    onChange: () => undefined,
  });
  expect(lockedBar).toContain('标记完成');
  expect(lockedBar).toContain('取消任务');
  expect(lockedBar.match(/disabled/g)?.length ?? 0).toBeGreaterThan(1);
});

function markup(type: unknown, props: unknown): string {
  const react = reactOf();
  const server = serverOf();
  const node = react.createElement(ActorRoles, {
    roles: ['buyer'],
    children: react.createElement(type, props),
  });
  const html = server.renderToStaticMarkup(node);
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function reactOf(): { createElement: (type: unknown, props: unknown) => unknown } {
  const value: unknown = requireWeb('react');
  if (!isCreator(value)) throw new Error('web 渲染模块不齐');
  return value;
}

function serverOf(): { renderToStaticMarkup: (node: unknown) => unknown } {
  const value: unknown = requireWeb('react-dom/server');
  if (!isRenderer(value)) throw new Error('web 渲染模块不齐');
  return value;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
