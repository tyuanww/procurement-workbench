// @vitest-environment happy-dom
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ActionForm, openDraft, type OpenForm, type Target } from '../../apps/web/src/features/today/TodayForms.js';
import { readTodaySession, validTodaySession, writeTodaySession, type TodaySession } from '../../apps/web/src/pages/today/today-session.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

const requireWeb = createRequire(resolve('apps/web/package.json'));

describe('今日抽屉状态写进 URL', () => {
  it('排期视图的批次深链打开原批次抽屉，仍能看到该批次的品名', async () => {
    const batch = batchTodo(1);
    if (batch.line === null) throw new Error('缺少样例订单行');
    const item = { ...batch, line: { ...batch.line, nameRaw: '缺日期产品' } };
    const params = new URLSearchParams({ group: 'schedule', drawer: item.id });
    emptyReads();
    installMatchMedia();
    installFetch();
    const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?' + params));
    try {
      await act(async () => {
        fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
        fulfill({ urlPart: 'focusId=' + encodeURIComponent(item.id), status: 200, body: { ...pageBody(1), items: [item] } });
      });
      const drawer = '.today-action-drawer [role="dialog"]';
      await waitFor(() => document.querySelector(drawer) !== null);
      const titleId = document.querySelector(drawer)?.getAttribute('aria-labelledby');
      expect(document.getElementById(titleId ?? '')?.textContent).toBe('缺日期产品');
      expect(textOf('[role="tab"][aria-selected="true"]')).toBe('今日排期');
      expect(textOf('output')).toBe(params.toString());
    } finally {
      act(() => { root.unmount(); });
      resetDom();
      emptyReads();
    }
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
    const html = render(ActionForm, { id: "today-date", draft, hadDate: true, lane: 'finished', onChange: () => undefined, onSubmit: () => undefined });
    expect(html).toMatch(/<label[^>]+for=[^>]+><span[^>]+>确认日<\/span><\/label>/);
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
