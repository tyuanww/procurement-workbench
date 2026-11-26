import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { focusForRows, handleKey, rowsSettled, type KeyActions } from '../../apps/web/src/pages/today/today-keys.js';
import { ScheduleView } from '../../apps/web/src/pages/today/ScheduleView.js';
import type { PlanLoad, PlanRow } from '../../apps/web/src/features/today/index.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

const FIRST = 'task:work-a';
const SECOND = 'task:work-b';
const ROWS = [{ id: FIRST }, { id: SECOND }];

describe('排期键盘只操作当前视图', () => {
  it('j 移动到当前排期行，d 不打开行动表单', () => {
    let focus: string | null = null;
    let opened = '';
    const actions = keyActions({
      setFocus: (id) => { focus = id; },
      open: (kind) => { opened = kind; },
    });
    handleKey({ event: key('j'), rows: ROWS, focus, hasDraft: false, isPlanMode: true, actions });
    handleKey({ event: key('d'), rows: ROWS, focus, hasDraft: false, isPlanMode: true, actions });
    expect({ focus, opened }).toEqual({ focus: FIRST, opened: '' });
  });

  it('Enter 不打开已经离开当前视图的焦点', () => {
    let isOpened = false;
    handleKey({
      event: key('Enter'),
      rows: ROWS,
      focus: 'todo-missing',
      hasDraft: false,
      isPlanMode: true,
      actions: keyActions({ openDrawer: () => { isOpened = true; } }),
    });
    expect(isOpened).toBe(false);
  });

  it('行上的 Enter 已经收下按键时，页面焦点不再抢抽屉', () => {
    const event = key('Enter');
    event.preventDefault();
    let opened = '';
    handleKey({
      event,
      rows: ROWS,
      focus: FIRST,
      hasDraft: false,
      isPlanMode: true,
      actions: keyActions({ openDrawer: () => { opened = FIRST; } }),
    });
    expect(opened).toBe('');
  });

  it('离开行动板后，落定的排期把焦点收成第一行', () => {
    expect(focusForRows({ focus: 'todo-missing', rows: ROWS, isSettled: true })).toBe(FIRST);
    expect(focusForRows({ focus: null, rows: ROWS, isSettled: true })).toBeNull();
    expect(focusForRows({ focus: SECOND, rows: ROWS, isSettled: true })).toBe(SECOND);
    expect(focusForRows({ focus: 'todo-missing', rows: [], isSettled: false })).toBe('todo-missing');
    expect(rowsSettled({ isReady: true, isSchedule: true, plan: 'loading' })).toBe(false);
    expect(rowsSettled({ isReady: true, isSchedule: true, plan: 'ready' })).toBe(true);
  });

  it('键盘焦点画在当前排期行上', () => {
    const html = render(ScheduleView, {
      group: 'schedule',
      load: readyPlan([FIRST, SECOND]),
      focus: SECOND,
      onGroup: () => undefined,
      onOpen: () => undefined,
      onRetry: () => undefined,
    });
    const rows = html.split('today-task-row');
    expect(rows[1] ?? '').not.toContain('#805D9D');
    expect(rows[2] ?? '').toContain('#805D9D');
  });
});

it('加载行动板或离开原行后，业务快捷键不打开旧批次', () => {
  const opened: string[] = [];
  const actions = keyActions({ open: (kind) => { opened.push(kind); } });
  for (const value of ['d', 's', 'r', 'n', 'e']) {
    handleKey({ event: key(value), rows: [], focus: 'old-row', hasDraft: false, actions });
    handleKey({ event: key(value), rows: [{ id: 'new-row' }], focus: 'old-row', hasDraft: false, actions });
  }
  expect(opened).toEqual([]);
  handleKey({ event: key('s'), rows: [{ id: 'new-row' }], focus: 'new-row', hasDraft: false, actions });
  expect(opened).toEqual(['ship']);
});

function key(value: string): { key: string; target: null; defaultPrevented: boolean; preventDefault: () => void } {
  const event = {
    key: value,
    target: null,
    defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true; },
  };
  return event;
}

function readyPlan(rowIds: readonly string[]): PlanLoad {
  const rows = rowIds.map((id): PlanRow => ({ id, workItemId: id, title: id, meta: '', tags: [], status: 'planned', timing: 'today', isHighPriority: false }));
  return {
    kind: 'ready',
    board: { kind: 'groups', groups: [{ key: 'due-today', name: '今天到期', counts: [], note: null, isUnassigned: false, rows }], rows },
  };
}

function render(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => string } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function keyActions(override: Partial<KeyActions>): KeyActions {
  return {
    setFocus: () => undefined,
    toggleHelp: () => undefined,
    closeDraft: () => undefined,
    closeDrawer: () => undefined,
    openDrawer: () => undefined,
    open: () => undefined,
    ...override,
  };
}
