import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ActionForm, openDraft, type OpenForm, type Target } from '../../apps/web/src/pages/today/TodayForms.js';
import { TodayScreen, type TodayScreenProps } from '../../apps/web/src/pages/today/TodayBoard.js';
import type { BoardRow, TodayBoard } from '../../apps/web/src/features/today/index.js';
import { readTodaySession, validTodaySession, writeTodaySession, type TodaySession } from '../../apps/web/src/pages/today/today-session.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

describe('今日抽屉状态写进 URL', () => {
  it('排期视图打开行动抽屉时仍能看到那一行', () => {
    const name = drawerProduct(scheduleDrawerProps());
    expect(name).toBe('缺日期产品');
  });

  it('点开抽屉后 URL 带 drawer 和 draft，原有筛选不丢', () => {
    const opened = writeTodaySession({ search: '?reasons=overdue&group=date', session: { drawerId: 'todo-1', draftKind: 'date' } });
    expect(opened).toBe('reasons=overdue&group=date&drawer=todo-1&draft=date');
    const rowOnly = writeTodaySession({ search: '?reasons=overdue', session: { drawerId: 'todo-1', draftKind: null } });
    expect(rowOnly).toBe('reasons=overdue&drawer=todo-1');
  });

  it('关闭后 drawer 和 draft 从 URL 清除，筛选保留', () => {
    const opened = 'reasons=overdue&drawer=todo-1&draft=date';
    const closed = writeTodaySession({ search: opened, session: { drawerId: null, draftKind: null } });
    expect(closed).toBe('reasons=overdue');
    expect(closed).not.toContain('drawer');
    expect(closed).not.toContain('draft');
  });

  it('刷新时用 URL 恢复同一抽屉和草稿，草稿表单带着原值可见', () => {
    const session = validTodaySession({ session: readTodaySession('?drawer=todo-1&draft=date'), rows: [{ id: 'todo-1' }] });
    expect(session).toEqual({ drawerId: 'todo-1', draftKind: 'date' });
    const draft = draftFor(session);
    expect(draft?.kind).toBe('date');
    if (draft === null) throw new Error('expected draft');
    const html = render(ActionForm, { draft, hadDate: true, lane: 'finished', onChange: () => undefined, onSubmit: () => undefined });
    expect(html).toContain('aria-label="确认日"');
    expect(html).toContain('value="2026-11-10"');
  });

  it('只有抽屉没有草稿时刷新只恢复抽屉，不硬塞表单', () => {
    const session = validTodaySession({ session: readTodaySession('?drawer=todo-1'), rows: [{ id: 'todo-1' }] });
    expect(session.drawerId).toBe('todo-1');
    expect(draftFor(session)).toBeNull();
  });

  it('非法 drawer 退回无抽屉，非法 draft 不崩', () => {
    const ghost = validTodaySession({ session: readTodaySession('?drawer=ghost&draft=date'), rows: [{ id: 'todo-1' }] });
    expect(ghost).toEqual({ drawerId: null, draftKind: null });
    expect(writeTodaySession({ search: '?drawer=ghost&draft=date', session: ghost })).toBe('');
    const bogusDraft = validTodaySession({ session: readTodaySession('?drawer=todo-1&draft=bogus'), rows: [{ id: 'todo-1' }] });
    expect(bogusDraft).toEqual({ drawerId: 'todo-1', draftKind: null });
    expect(readTodaySession('?draft=date').drawerId).toBeNull();
  });

  it('后退回到打开前的 URL 是无抽屉，前进回到打开后的 URL 恢复抽屉', () => {
    const before = validTodaySession({ session: readTodaySession(''), rows: [{ id: 'todo-1' }] });
    const after = validTodaySession({ session: readTodaySession('?drawer=todo-1'), rows: [{ id: 'todo-1' }] });
    expect(before.drawerId).toBeNull();
    expect(after.drawerId).toBe('todo-1');
    expect(writeTodaySession({ search: '?reasons=overdue&drawer=todo-1', session: before })).toBe('reasons=overdue');
    expect(writeTodaySession({ search: '?reasons=overdue', session: after })).toBe('reasons=overdue&drawer=todo-1');
  });
});

function scheduleDrawerProps(): TodayScreenProps {
  const noop = () => undefined;
  const row: BoardRow = { id: 'todo-missing', face: { reason: '缺确认日期', overdue: '—', overdueTone: 'quiet', orderNo: 'PO-todo-missing', productName: '缺日期产品', date: '—' }, actions: [] };
  const actionBoard: TodayBoard = { group: 'waiting', chips: [], body: { kind: 'groups', groups: [], rows: [row] } };
  const board: TodayBoard = { group: 'schedule', chips: [], body: { kind: 'empty', text: '今天没有需要处理的事。下一步：去跟进台看看。' } };
  return {
    board,
    actionBoard,
    insight: { total: 1, urgent: 0, overdue: 0, missingDate: 1 },
    focus: null,
    fading: null,
    drawerId: 'todo-missing',
    draft: null,
    hadDate: false,
    lane: 'finished',
    isSaving: false,
    notice: '',
    saveError: '',
    isHelpOpen: false,
    isReady: true,
    loadError: '',
    onToggleReason: noop,
    onGroup: noop,
    onOpen: noop,
    onQuick: noop,
    onCopy: noop,
    onCloseDrawer: noop,
    onDraft: noop,
    onSubmit: noop,
    onRetry: noop,
    onBack: noop,
  };
}

function drawerProduct(props: TodayScreenProps): string | null {
  let name: string | null = null;
  const report = console.error;
  console.error = () => undefined;
  try {
    walk(TodayScreen(props), (productName) => { name = productName; });
  } finally {
    console.error = report;
  }
  return name;
}

function walk(node: unknown, save: (name: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, save));
    return;
  }
  if (!isElement(node)) return;
  const productName = productOf(node.props);
  if (productName !== null) save(productName);
  if (typeof node.type === 'function') {
    try {
      walk(node.type(node.props), save);
    } catch {
      return;
    }
  }
  walk(node.props.children, save);
}

function productOf(props: unknown): string | null {
  if (!isRecord(props) || props.isOpen !== true || !isRecord(props.row)) return null;
  const face = props.row.face;
  if (!isRecord(face) || typeof face.productName !== 'string') return null;
  return face.productName;
}

function isElement(value: unknown): value is { readonly type: unknown; readonly props: { readonly children?: unknown } } {
  return isRecord(value) && 'type' in value && isRecord(value.props);
}

function draftFor(session: TodaySession): OpenForm | null {
  if (session.drawerId === null || session.draftKind === null) return null;
  const drafts: (OpenForm | null)[] = [];
  openDraft({
    id: session.drawerId,
    kind: session.draftKind,
    targets: { 'todo-1': target() },
    setFocus: () => undefined,
    setDraft: (draft) => { drafts.push(draft); },
  });
  return drafts[0] ?? null;
}

function target(): Target {
  return {
    batchId: 'batch-1',
    lineId: 'line-1',
    plannedQty: 10,
    receivedQty: 0,
    shippedQty: 0,
    lane: 'finished',
    hadDate: true,
    confirmedDate: '2026-11-10',
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

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
