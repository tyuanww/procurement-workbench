// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { matchesMetric, type MetricScope, type PersonalTask } from '../../apps/web/src/pages/personal-workspace/workspace-model.js';
import { loadEntries, saveEntry } from '../../apps/web/src/pages/personal-workspace/workspace-store.js';
import { legacyPersonalPath } from '../../apps/web/src/features/today/index.js';
import { lineDetailBack } from '../../apps/web/src/pages/lines/detail/desk-navigation.js';

const today = '2026-11-30';
const task: PersonalTask = { id: 'follow', title: '确认发货', description: '', due: today, priority: 'high', status: 'doing' };
function matches(scope: MetricScope, changes: Partial<PersonalTask>) {
  return matchesMetric({ ...task, ...changes }, { today, scope });
}

beforeEach(() => localStorage.clear());

it('原个人入口和旧跟进链接打开同一工作台，保留日期、抽屉和批次焦点', () => {
  expect(legacyPersonalPath('', today)).toBe('/today');
  const old = 'scope=scheduled&view=calendar&date=2026-12-01&drawer=batch%3Asample&focus=batch%3Asample';
  const result = new URL(legacyPersonalPath(old, today), 'http://localhost');
  expect(result.pathname).toBe('/today');
  expect(Object.fromEntries(result.searchParams)).toEqual({
    inbox: 'scheduled', view: 'calendar', date: '2026-12-01', drawer: 'batch:sample', focusId: 'batch:sample',
  });
  expect(lineDetailBack({ progress: null, state: { personalTodaySearch: old }, lineId: 'line-1' }))
    .toEqual({ label: '返回个人工作台', to: result.pathname + result.search });
});

it('旧全量日历的未来日期落在已约跟进，今天默认打开工作清单', () => {
  expect(legacyPersonalPath('scope=all&view=calendar&date=2026-12-01', today)).toContain('inbox=scheduled');
  expect(legacyPersonalPath('scope=pending&focus=batch%3A1', today)).toBe('/today?focusId=batch%3A1');
});

it('从今日排期的批次记录返回同一排期抽屉', () => {
  const today = '?group=schedule&drawer=batch%3Asample';
  expect(lineDetailBack({ progress: null, state: null, today, focusBatch: 'sample', lineId: 'line-1' }))
    .toMatchObject({ label: '返回今日排期', to: '/today' + today });
});

it('今日和三日到期使用截止日，逾期和已完成不计入待办', () => {
  expect(matches('due', { due: '2026-11-29' })).toBe(false);
  expect(matches('due', {})).toBe(true);
  expect(matches('due', { status: 'done' })).toBe(false);
  expect(matches('soon', {})).toBe(false);
  expect(matches('soon', { due: '2026-12-03' })).toBe(true);
  expect(matches('soon', { due: '2026-12-04' })).toBe(false);
  expect(matches('soon', { due: '2026-12-01', status: 'done' })).toBe(false);
});

it('本周完成以周一至周日的截止日和当前状态计算', () => {
  expect(matches('done', { status: 'done', due: '2026-11-29' })).toBe(false);
  expect(matches('done', { status: 'done' })).toBe(true);
  expect(matches('done', { status: 'done', due: '2026-12-06' })).toBe(true);
  expect(matches('done', { status: 'done', due: '2026-12-07' })).toBe(false);
  expect(matches('done', {})).toBe(false);
});

it('次日打开保留初始排期，编辑覆盖原对象，历史任务仅由当前账号回读', () => {
  const buyer = { userId: 'buyer:a', today };
  const first = loadEntries(buyer);
  expect(loadEntries({ ...buyer, today: '2026-12-01' })).toEqual(first);
  const original = first.find((entry) => entry.kind === 'task');
  if (original === undefined) throw new Error('缺采购任务样例');
  const changed = { ...original, item: { ...original.item, title: '已向工厂确认' } };
  saveEntry(buyer.userId, changed);
  saveEntry(buyer.userId, { kind: 'task', item: task });
  expect(loadEntries(buyer)).toHaveLength(first.length + 1);
  expect(loadEntries(buyer)).toContainEqual(changed);
  expect(loadEntries({ ...buyer, userId: 'buyer' })).toEqual(first);
});

it('移除笔记入口后，旧笔记留在浏览器，任务和日程仍可回读', () => {
  const buyer = { userId: 'buyer', today };
  const key = 'sw.personal-preview.v1.buyer:entry:memo';
  const note = JSON.stringify({ kind: 'note', item: { id: 'memo', title: '回单', tag: '收货', content: '明早复查' } });
  const first = loadEntries(buyer);
  localStorage.setItem(key, note);
  expect(loadEntries(buyer)).toEqual(first);
  expect(localStorage.getItem(key)).toBe(note);
});
