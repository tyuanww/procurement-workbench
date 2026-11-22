import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import { ScheduleReports, scheduleLineText } from '../../apps/web/src/pages/lines/detail/schedule-reports.js';
import { unlinkedRowText } from '../../apps/web/src/pages/master/unlinked-row-text.js';

type ScheduleRow = Parameters<typeof scheduleLineText>[0];
type UnlinkedRow = Parameters<typeof unlinkedRowText>[0];

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('订单行详情只显示已关联排产格的日期、数量、单号和状态', () => {
  const row = scheduleRow({ day: '2026-10-02', qty: 12, poRaw: 'PO-1', item: 'ITEM-9', status: 'linked' });
  expect(scheduleLineText(row)).toBe('2026-10-02 · 12 · PO-1 · 已关联');
  const empty = scheduleRow({ day: '2026-10-03', qty: null, poRaw: null, item: null, status: 'manual' });
  expect(scheduleLineText(empty)).toBe('2026-10-03 · 数量未填 · 无单号 · 人工挂接');
  const html = markup(ScheduleReports, { rows: [row] });
  expect(html).toContain('排产');
  expect(html).toContain('2026-10-02 · 12 · PO-1 · 已关联');
  expect(markup(ScheduleReports, { rows: [] })).toBe('');
});

it('未关联排产格挂接前能辨认日期、数量、单号和品号，挂接参数不变', () => {
  const row = unlinkedSchedule({ day: '2026-10-04', qty: 3, poRaw: 'PO-2', item: '70001', reason: 'NO_CANDIDATE_LINE' });
  expect(unlinkedRowText(row)).toBe('排产计划 第 8 行 2026-10-04 · 3 · PO-2 · 70001 NO_CANDIDATE_LINE');
  const other: UnlinkedRow = { ...envelope('shipment'), kind: 'shipment', payload: shipmentPayload() };
  expect(unlinkedRowText(other)).toBe('成品出货明细 第 8 行');
});

function scheduleRow(input: { readonly day: string; readonly qty: number | null; readonly poRaw: string | null; readonly item: string | null; readonly status: 'linked' | 'manual' }): ScheduleRow {
  return {
    ...envelope('schedule'),
    kind: 'schedule',
    linkStatus: input.status,
    payload: {
      po: po(input.poRaw),
      itemCodeRaw: text(input.item),
      nameRaw: text('品'),
      monthRaw: text('10月'),
      newOrOldRaw: text('新'),
      qtyRequiredTotal: { raw: null, value: null },
      day: localDate(input.day),
      qty: input.qty,
      stepRaw: null,
    },
  };
}

function unlinkedSchedule(input: { readonly day: string; readonly qty: number | null; readonly poRaw: string | null; readonly item: string | null; readonly reason: string }): UnlinkedRow {
  return {
    ...scheduleRow({ day: input.day, qty: input.qty, poRaw: input.poRaw, item: input.item, status: 'linked' }),
    linkStatus: 'unlinked',
    linkReason: input.reason,
  };
}

function envelope(kind: 'schedule' | 'shipment') {
  return {
    id: `${kind}-1`,
    importBatchId: 'batch-1',
    factoryPartyId: 'factory-1',
    sheetName: kind === 'schedule' ? '排产计划' : '成品出货明细',
    rowNo: 8,
    fingerprint: 'fp',
    linkedOrderLineId: null,
    linkStatus: 'unlinked' as const,
    linkReason: null,
  };
}

function po(poRaw: string | null) {
  return { raw: poRaw, value: poRaw === null ? null : { poRaw, poNorm: poRaw, poFormat: 'OTHER' as const, relatedPoRaws: [] } };
}

function text(value: string | null) {
  return { raw: value, value };
}

function shipmentPayload(): Extract<UnlinkedRow, { readonly kind: 'shipment' }>['payload'] {
  const blank = { raw: null, value: null };
  return {
    po: po(null),
    itemCodeRaw: blank,
    nameRaw: blank,
    lotRaw: blank,
    qty: blank,
    casePackRaw: blank,
    palletsRaw: blank,
    shipmentKindRaw: blank,
    shipOrArriveOn: blank,
    destinationRaw: blank,
    vehicleRaw: blank,
    note2Raw: blank,
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
