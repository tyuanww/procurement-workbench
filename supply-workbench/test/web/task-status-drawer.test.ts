import { afterEach, expect, it } from 'vitest';
import { detail, installFetch, mountDrawer, posts, resolveGet, resolvePost, type DrawerHandle } from './task-status-drawer-harness.ts';

let active: DrawerHandle | null = null;

afterEach(async () => {
  await active?.unmount();
  active = null;
});

const doneText = '状态已从 进行中 改为 已完成。';
const cancelText = '状态已从 进行中 改为 已取消。';
const conflict = { error: { code: 'STATE_CONFLICT', message: '当前状态不允许这个操作', details: { state: 'version 3 已被并发修改' } } };

it('A 的成功回调在 B 的详情出现后不留下 A 的成功文案或状态', async () => {
  const drawer = await openTask({ id: 'item-a', title: '甲任务', status: 'in_progress' });
  await drawer.click('标记完成');
  expect(drawer.text()).toContain('确认把状态从 进行中 改为 已完成');
  await drawer.click('确认更改');
  expect(postBodies()).toEqual([{ url: '/api/v1/plan/work-items/item-a/status', method: 'POST', body: { status: 'done' } }]);
  await drawer.set({ workItemId: 'item-b', isOpen: true });
  expect(drawer.text()).toContain('甲任务');
  expect(drawer.text()).not.toContain('乙任务');
  await resolvePost({ act: drawer.react.act, urlPart: '/status', body: { workItemId: 'item-a', version: 4 } });
  expect(drawer.text()).toContain('甲任务');
  expect(drawer.text()).toContain(doneText);
  expect(drawer.selected()).toBe('进行中');
  await resolveGet({ act: drawer.react.act, urlPart: '/work-items/item-b', body: detail({ id: 'item-b', title: '乙任务', status: 'planned' }) });
  expect(drawer.text()).toContain('乙任务');
  expect(drawer.text()).not.toContain('甲任务');
  expect(drawer.text()).not.toContain(doneText);
  expect(drawer.selected()).toBe('计划中');
  expect(drawer.tag()).toBe('计划中');
  expect(posts().map((item) => item.url)).toEqual(['/api/v1/plan/work-items/item-a/status']);
  await drawer.unmount();
});

it('先换上 B 再收到 A 的成功，B 不显示 A 的成功文案', async () => {
  const drawer = await openTask({ id: 'item-a', title: '甲任务', status: 'in_progress' });
  await drawer.click('取消任务');
  await drawer.click('确认更改');
  await drawer.set({ workItemId: 'item-b', isOpen: true });
  await resolveGet({ act: drawer.react.act, urlPart: '/work-items/item-b', body: detail({ id: 'item-b', title: '乙任务', status: 'blocked' }) });
  await resolvePost({ act: drawer.react.act, urlPart: '/status', body: { workItemId: 'item-a', version: 4 } });
  expect(drawer.text()).toContain('乙任务');
  expect(drawer.text()).not.toContain(cancelText);
  expect(drawer.text()).not.toContain('当前状态不允许这个操作');
  expect(drawer.selected()).toBe('阻塞');
  expect(postBodies()).toEqual([{ url: '/api/v1/plan/work-items/item-a/status', method: 'POST', body: { status: 'cancelled' } }]);
  expect(drawer.tag()).toBe('阻塞');
  await drawer.unmount();
});

it('关闭再打开同一任务，进行中的提交仍然锁住', async () => {
  const drawer = await openTask({ id: 'item-a', title: '甲任务', status: 'in_progress' });
  await drawer.click('标记完成');
  await drawer.click('确认更改');
  await drawer.set({ workItemId: 'item-a', isOpen: false });
  await drawer.set({ workItemId: 'item-a', isOpen: true });
  expect(drawer.isDisabled('标记完成')).toBe(true);
  expect(drawer.isDisabled('取消任务')).toBe(true);
  expect(posts()).toHaveLength(1);
  await resolvePost({ act: drawer.react.act, urlPart: '/status', body: { workItemId: 'item-a', version: 4 } });
  expect(drawer.text()).toContain(doneText);
  expect(drawer.selected()).toBe('进行中');
  expect(drawer.isDisabled('取消任务')).toBe(true);
  await resolveGet({ act: drawer.react.act, urlPart: '/work-items/item-a', body: detail({ id: 'item-a', title: '甲任务', status: 'done' }) });
  expect(drawer.selected()).toBe('已完成');
  expect(drawer.tag()).toBe('已完成');
  expect(drawer.text()).toContain(doneText);
  await drawer.unmount();
});

it('标记完成失败保持原状态，成功后才换成已完成', async () => {
  const drawer = await openTask({ id: 'item-done', title: '完成任务', status: 'in_progress' });
  await submit({ drawer, label: '标记完成', target: '已完成' });
  await resolvePost({ act: drawer.react.act, urlPart: '/status', body: conflict, status: 409 });
  expect(drawer.text()).toContain('当前状态不允许这个操作');
  expect(drawer.text()).not.toContain(doneText);
  expect(drawer.selected()).toBe('进行中');
  expect(drawer.isDisabled('标记完成')).toBe(false);
  await submit({ drawer, label: '标记完成', target: '已完成' });
  await resolvePost({ act: drawer.react.act, urlPart: '/status', body: { workItemId: 'item-done', version: 5 } });
  expect(drawer.text()).toContain(doneText);
  expect(drawer.selected()).toBe('进行中');
  await resolveGet({ act: drawer.react.act, urlPart: '/work-items/item-done', body: detail({ id: 'item-done', title: '完成任务', status: 'done' }) });
  expect(drawer.tag()).toBe('已完成');
  expect(posts().map((item) => item.body)).toEqual([{ status: 'done' }, { status: 'done' }]);
  await drawer.unmount();
});

it('取消任务失败保持原状态，成功后才换成已取消', async () => {
  const drawer = await openTask({ id: 'item-cancel', title: '取消任务样本', status: 'in_progress' });
  await submit({ drawer, label: '取消任务', target: '已取消' });
  await resolvePost({ act: drawer.react.act, urlPart: '/status', body: conflict, status: 409 });
  expect(drawer.text()).toContain('当前状态不允许这个操作');
  expect(drawer.text()).not.toContain(cancelText);
  expect(drawer.selected()).toBe('进行中');
  expect(drawer.isDisabled('取消任务')).toBe(false);
  await submit({ drawer, label: '取消任务', target: '已取消' });
  await resolvePost({ act: drawer.react.act, urlPart: '/status', body: { workItemId: 'item-cancel', version: 5 } });
  expect(drawer.text()).toContain(cancelText);
  expect(drawer.selected()).toBe('进行中');
  await resolveGet({ act: drawer.react.act, urlPart: '/work-items/item-cancel', body: detail({ id: 'item-cancel', title: '取消任务样本', status: 'cancelled' }) });
  expect(drawer.tag()).toBe('已取消');
  expect(drawer.selected()).toBe(null);
  expect(drawer.isDisabled('取消任务')).toBe(null);
  expect(posts().map((item) => item.body)).toEqual([{ status: 'cancelled' }, { status: 'cancelled' }]);
  await drawer.unmount();
});

function postBodies(): readonly { readonly url: string; readonly method: string; readonly body: unknown }[] {
  return posts().map((item) => ({ url: item.url, method: item.method, body: item.body }));
}

it('任务详情提示已开工任务的前置阻塞，仍显示记录的进行中状态', async () => {
  const id = 'procurement-schedule:production:line-1';
  const predecessorId = 'procurement-schedule:materials:line-1';
  const drawer = await openTask({ id, title: '生产', status: 'in_progress', dependenciesIn: [{
    id: 'dep-1', fromItemId: predecessorId, toItemId: id, kind: 'finish_to_start', createdAt: '2026-11-17T00:00:00Z',
    predecessor: { id: predecessorId, title: '齐料', plannedEnd: '2026-11-16', status: 'blocked' },
  }] });
  expect(drawer.text()).toContain('依赖冲突');
  expect(drawer.text()).toContain('本任务计划开始 2026-11-17');
  expect(drawer.text()).toContain('齐料（计划完成 2026-11-16）仍阻塞');
  expect(drawer.tag()).toBe('进行中');
  expect(drawer.isDisabled('标记完成')).toBe(false);
});

async function openTask(input: Parameters<typeof detail>[0]): Promise<DrawerHandle> {
  installFetch();
  const drawer = await mountDrawer();
  active = drawer;
  await drawer.set({ workItemId: input.id, isOpen: true });
  await resolveGet({ act: drawer.react.act, urlPart: `/work-items/${encodeURIComponent(input.id)}`, body: detail(input) });
  return drawer;
}

async function submit(input: { readonly drawer: DrawerHandle; readonly label: string; readonly target: string }): Promise<void> {
  await input.drawer.click(input.label);
  expect(input.drawer.text()).toContain(`确认把状态从 进行中 改为 ${input.target}`);
  await input.drawer.click('确认更改');
}
