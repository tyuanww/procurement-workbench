import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import { balanceText, ScheduleReports, scheduleLineText } from '../../apps/web/src/pages/lines/detail/schedule-reports.js';
import { scheduleRelinkText } from '../../apps/web/src/pages/master/FactoryLinkTab.js';
import { MeetingSections } from '../../apps/web/src/features/reporting/ui/meeting-sections.js';
import { closedShortMaterial, meeting, meetingMaterial } from '../report-renderers/meeting-fixture.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('打印周会渲染超过一页的采购事项及其来源原话', () => {
  const materials = Array.from({ length: 11 }, (_, index) => ({
    ...meetingMaterial, materialLineId: `material-${index}`, name: `批次采购事项 ${index} 号`,
  }));
  const html = markup(MeetingSections, { meeting: { ...meeting, materials }, print: true });
  expect(html).toContain('批次采购事项 10 号');
  expect(html).toContain('工厂承诺补齐盖子');
});

it('打印周会保留短收批次的实收记录和关闭后的状态', () => {
  const html = markup(MeetingSections, { meeting: { ...meeting, materials: [closedShortMaterial] }, print: true });
  expect(html).toContain('无待处理履约');
  expect(html).not.toContain('实收已覆盖计划');
});

it('排产详情同时显示已关联和待复核，四个量分开，超量只是提醒', () => {
  const linked = row({ id: 'a', day: '2026-10-01', qty: 6, po: 'PO1', status: 'linked', reason: null });
  const review = row({ id: 'b', day: '2026-10-02', qty: 6, po: 'PO2', status: 'linked', reason: 'SCHEDULE_LINK_REVIEW' });
  expect(scheduleLineText(linked)).toBe('2026-10-01 · 6 · PO1 · 已关联');
  expect(scheduleLineText(review)).toBe('2026-10-02 · 6 · PO2 · 已关联 · 仍关联但待复核');
  expect(scheduleLineText(review)).not.toContain('未关联');
  expect(scheduleLineText(review)).not.toContain('人工挂接');
  const html = markup(ScheduleReports, { rows: [linked, review], ordered: 10, shipped: 3, received: 2 });
  expect(html).toContain('总需求 10 · 已排产 12 · 已发货 3 · 已收货 2 · 超量');
  expect(html).toContain('仍关联但待复核');
  expect(balanceText({ ordered: 10, scheduled: 4, shipped: 3, received: 2, over: false })).not.toContain('超量');
  expect(scheduleRelinkText({ scheduleCells: 4, linked: 2, unlinked: 1, ambiguous: 0, manual: 1, review: 1 })).toContain('仍关联但待复核 1');
});

function row(input: { readonly id: string; readonly day: string; readonly qty: number | null; readonly po: string | null; readonly status: 'linked' | 'manual'; readonly reason: string | null }) {
  return {
    id: input.id,
    importBatchId: 'batch-1',
    factoryPartyId: 'factory-1',
    sheetName: '排产计划',
    rowNo: 8,
    fingerprint: input.id,
    linkedOrderLineId: 'line-1',
    linkStatus: input.status,
    linkReason: input.reason,
    kind: 'schedule' as const,
    payload: {
      po: { raw: input.po, value: input.po === null ? null : { poRaw: input.po, poNorm: input.po, poFormat: 'OTHER' as const, relatedPoRaws: [] } },
      itemCodeRaw: { raw: null, value: null },
      nameRaw: { raw: '海葡萄', value: '海葡萄' },
      monthRaw: { raw: null, value: null },
      newOrOldRaw: { raw: null, value: null },
      qtyRequiredTotal: { raw: '100', value: 100 },
      day: localDate(input.day),
      qty: input.qty,
      stepRaw: null,
    },
  };
}

function markup(type: unknown, props: unknown): string {
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
