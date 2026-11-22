import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { WorkItemEventHistory } from '../../apps/web/src/features/plan/event-history.js';
import type { WorkItemEvent } from '../../apps/web/src/features/today/model/task.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('历史列表渲染操作人、当时负责人和未知，只显示前 10 条', () => {
  const html = markup([
    historyEvent({ id: 'e1', kind: 'created', actor: { presence: 'named', userId: 'buyer-1', name: '采购甲' }, ownerAtEvent: { presence: 'named', userId: 'buyer-1', name: '采购甲' } }),
    historyEvent({ id: 'e2', kind: 'status_changed', oldValue: 'planned', newValue: 'in_progress', ownerAtEvent: { presence: 'unassigned' } }),
    historyEvent({ id: 'e3', kind: 'status_changed', actor: { presence: 'deleted', userId: 'gone' }, ownerAtEvent: { presence: 'unrecorded' } }),
    historyEvent({ id: 'e4', kind: 'owner_changed', ownerAtEvent: { presence: 'named', userId: 'buyer-2', name: '采购乙' }, ownerChange: { before: { presence: 'unassigned' }, after: { presence: 'named', userId: 'buyer-2', name: '采购乙' } } }),
    ...Array.from({ length: 6 }, (_, index) => historyEvent({ id: `keep-${index}`, kind: 'date_changed', oldValue: '2026-11-01', newValue: `KEEP-${index}` })),
    historyEvent({ id: 'drop-11', kind: 'date_changed', oldValue: '2026-11-01', newValue: 'DROP-11' }),
  ]);
  expect(html).toContain('事件历史');
  expect(html).toContain('实际操作人');
  expect(html).toContain('采购甲');
  expect(html).toContain('当时负责人');
  expect(html).toContain('未分配');
  expect(html).toContain('未知');
  expect(html).toContain('已删除');
  expect(html).toContain('负责人从 未分配 改为 采购乙');
  expect(html).toContain('KEEP-5');
  expect(html.includes('DROP-11')).toBe(false);
  expect(html.includes('姓名快照')).toBe(false);
});

it('没有事件时渲染空历史，不写当前负责人', () => {
  const html = markup([]);
  expect(html).toContain('还没有事件。');
  expect(html.includes('当时负责人')).toBe(false);
  expect(html.includes('实际操作人')).toBe(false);
});

function markup(events: readonly WorkItemEvent[]): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(WorkItemEventHistory, { events }));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function historyEvent(overrides: Partial<WorkItemEvent> & Pick<WorkItemEvent, 'id' | 'kind'>): WorkItemEvent {
  return {
    workItemId: 'item-1',
    field: overrides.kind === 'status_changed' ? 'status' : null,
    oldValue: null,
    newValue: null,
    actorUserId: 'buyer-1',
    actor: { presence: 'named', userId: 'buyer-1', name: '采购甲' },
    ownerAtEvent: { presence: 'unrecorded' },
    ownerChange: null,
    note: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    ...overrides,
  };
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
