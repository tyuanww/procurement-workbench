// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { PlanLoad, PlanRow } from '../../apps/web/src/features/today/index.js';
import { ScheduleView } from '../../apps/web/src/pages/today/ScheduleView.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { antdApp, LocationAndToday, pageBody } from './today-workspace-fixture.js';

it('本人排期按任务状态与到期日独立计数，快捷定位沿用分组顺序且打开原任务', () => {
  installMatchMedia();
  const due: PlanRow = { id: 'task:due', workItemId: 'due', title: '确认交期', meta: '', tags: [], status: 'planned', timing: 'today', isHighPriority: true };
  const delayed: PlanRow = { ...due, id: 'task:delayed', workItemId: 'delayed', title: '核实包材', status: 'blocked', timing: 'overdue', isHighPriority: false };
  const rows = [due, delayed];
  const groups = [{ key: 'owner:a', name: '采购甲', counts: [], isUnassigned: false, note: null, rows }];
  const load: PlanLoad = { kind: 'ready', board: { kind: 'groups', groups, rows } };
  const opened: string[] = [];
  const root = mount(antdApp(element(ScheduleView, { isMine: true, load, group: 'owner', focus: null,
    onOpen: (id: string) => opened.push(id), onGroup: () => undefined, onRetry: () => undefined })));
  try {
    expect(textOf('[aria-label="排期摘要"]').replace(/\s+/gu, '')).toBe('到期未完成2项已逾期1项今日到期1项已阻塞1项');
    expect(textOf('.today-schedule-list h2')).toBe('我的任务清单');
    expect(document.querySelectorAll('.today-task-row')).toHaveLength(2);
    click(button('定位逾期任务'));
    expect(document.activeElement?.id).toBe('today-row-task:delayed');
    click(button('定位高优先任务'));
    expect(document.activeElement?.id).toBe('today-row-task:due');
    click(button('查看受阻任务详情'));
    expect(opened).toEqual(['task:delayed']);
    expect(document.activeElement?.id).toBe('today-row-task:delayed');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
  }
});

it.each([true, false])('恢复本人受阻筛选，摘要、键盘与空结果可回查（本人有受阻任务 %s）', async (hasBlockedTask) => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?group=owner&mine=1&planFilter=blocked'));
  const day = '2026-11-21';
  const due = { id: 'due', subjectType: 'standalone', subjectId: null, kind: 'task', title: '今日核对库存',
    ownerUserId: 'buyer-1', ownerName: '采购甲', counterpartyPartyId: null, counterpartyRole: null, counterpartyName: null,
    plannedStart: day, plannedEnd: day, status: 'planned', priority: 'normal', source: 'manual', parentId: null, version: 1,
    overdueDays: null, orderLine: null, batch: null, supplierPartyId: null, supplierName: null, factoryPartyId: null, factoryName: null };
  const blocked = { ...due, id: 'held', title: '逾期核对回单', status: hasBlockedTask ? 'blocked' : 'in_progress', plannedEnd: '2026-11-20', overdueDays: 1 };
  const other = { ...blocked, id: 'other', title: '另一人的任务', status: 'blocked', ownerUserId: 'buyer-2', ownerName: '采购乙' };
  const byOwner = [{ key: 'buyer-1', label: '采购甲', items: [due, blocked] }, { key: 'buyer-2', label: '采购乙', items: [other] }];
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: '/api/v1/today', status: 200, body: pageBody(0) });
      fulfill({ urlPart: '/api/v1/plan/daily', status: 200, body: { date: day, asOf: day, total: 3, overdueCount: 2,
        items: [due, blocked, other], byOwner, bySupplier: [{ key: 'unassigned', label: null, items: [due, blocked, other] }], byFactory: [] } });
    });
    await waitFor(() => document.querySelector('.today-schedule-list') !== null);
    expect(button('到期未完成2项').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.today-schedule-list .ant-card-head [aria-label="今日排期分组"]')).not.toBeNull();
    if (hasBlockedTask) {
      expect(document.querySelectorAll('.today-task-row')).toHaveLength(1);
      expect(textOf('.today-task-row')).toContain('逾期核对回单');
      expect(button('已阻塞1项').getAttribute('aria-pressed')).toBe('true');
      act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true })); });
      expect(document.activeElement?.id).toBe('today-row-task:held');
      click(button('到期未完成2项'));
    } else {
      expect(document.querySelectorAll('.today-task-row')).toHaveLength(0);
      expect(textOf('.today-schedule-list')).toContain('当前筛选没有排期任务');
      expect(button('已阻塞0项').getAttribute('aria-pressed')).toBe('true');
      click(button('已阻塞0项'));
    }
    await waitFor(() => document.querySelectorAll('.today-task-row').length === 2);
    expect(new URLSearchParams(textOf('output')).has('planFilter')).toBe(false);
    click(button('今日到期1项'));
    await waitFor(() => document.querySelectorAll('.today-task-row').length === 1);
    expect(new URLSearchParams(textOf('output')).get('planFilter')).toBe('today');
    expect(textOf('.today-task-row')).toContain('今日核对库存');
    expect(textOf('.today-schedule-list')).not.toContain('另一人的任务');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});
