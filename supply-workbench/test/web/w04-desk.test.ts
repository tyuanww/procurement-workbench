import { describe, expect, it } from 'vitest';
import type { LineStage, MissingReason } from '../../packages/domain/src/index.js';
import { OrderLineRowSchema } from '../../packages/contracts/src/index.js';
import { lineCell, readDesk, writeDesk } from '../../apps/web/src/features/follow-up/index.js';

const NOW = new Date('2026-11-03T00:00:00+08:00');

const FINISHED_COLUMNS = [
  { key: 'po', title: '采购单号' },
  { key: 'name', title: '品名' },
  { key: 'supplier', title: '供应商' },
  { key: 'factory', title: '工厂' },
  { key: 'qtyOrdered', title: '订单数量' },
  { key: 'received', title: '已收（工作台）' },
  { key: 'factoryDelivered', title: '代工厂已交货' },
  { key: 'stage', title: '阶段' },
  { key: 'nextDue', title: '下一到货' },
  { key: 'daysInStage', title: '卡了几天' },
  { key: 'buyer', title: '负责人' },
  { key: 'status', title: '总表状态' },
];

const MATERIAL_COLUMNS = [
  { key: 'po', title: '物料采购单号' },
  { key: 'name', title: '材料品名' },
  { key: 'supplier', title: '供应商' },
  { key: 'receiver', title: '收货代工厂' },
  { key: 'qtyOrdered', title: '需求量' },
  { key: 'received', title: '已收' },
  { key: 'stage', title: '阶段' },
  { key: 'nextDue', title: '下一到货' },
  { key: 'factoryRequired', title: '代工厂需求日' },
  { key: 'daysInStage', title: '卡了几天' },
  { key: 'buyer', title: '负责人' },
];

describe('跟进台地址和单元格', () => {
  it('表头是中文，缺线别时选中并请求成品线', () => {
    expect(readDesk('').columns).toEqual([...FINISHED_COLUMNS]);
    expect(readDesk('lane=finished').columns).toEqual([...FINISHED_COLUMNS]);
    expect(readDesk('lane=material').columns).toEqual([...MATERIAL_COLUMNS]);
    expect(readDesk('').lane).toBe('finished');
    expect(queryOf('').get('lane')).toBe('finished');
    expect(queryOf('lane=finished').get('lane')).toBe('finished');
  });

  it('显式全部线在改搜索后仍查询全部线别', () => {
    const searched = addressOf('lane=all&q=纸盒&page=2', { kind: 'text', value: '面膜' });
    expect(readDesk(searched.toString()).lane).toBe('all');
    expect(queryOf(searched.toString()).has('lane')).toBe(false);
    expect(queryOf(searched.toString()).get('q')).toBe('面膜');
    expect(queryOf(searched.toString()).get('page')).toBe('1');
  });

  it('改阶段或逾期保留采购员，并回到第一页', () => {
    const search = 'buyer=me&q=宜侬&supplierPartyId=sup-1&factoryPartyId=factory-1&page=2&pageSize=50';
    const staged = addressOf(search, { kind: 'stage', value: 'awaiting_shipment' });
    expect(staged.get('buyer')).toBe('me');
    expect(staged.get('q')).toBe('宜侬');
    expect(staged.get('supplierPartyId')).toBe('sup-1');
    expect(staged.get('factoryPartyId')).toBe('factory-1');
    expect(staged.has('page')).toBe(false);
    expect(staged.get('stage')).toBe('awaiting_shipment');
    expect(staged.has('stages')).toBe(false);
    const request = queryOf(staged.toString());
    expect(request.get('buyer')).toBe('me');
    expect(request.get('factoryPartyId')).toBe('factory-1');
    expect(request.get('stages')).toBe('awaiting_shipment');
    expect(request.get('page')).toBe('1');
    expect(request.get('pageSize')).toBe('50');
    expect(queryOf('buyer=me').get('buyer')).toBe('me');
    expect(queryOf('buyer=buyer-1').get('buyer')).toBe('buyer-1');
    const byId = addressOf('buyer=buyer-1&page=3', { kind: 'overdue', value: true });
    expect(byId.get('buyer')).toBe('buyer-1');
    expect(byId.has('page')).toBe(false);
    expect(byId.get('overdue')).toBe('1');
    expect(queryOf(byId.toString()).get('buyer')).toBe('buyer-1');
    expect(queryOf(byId.toString()).get('page')).toBe('1');
    expect(queryOf(byId.toString()).get('overdueOnly')).toBe('true');
  });

  it('非法阶段丢掉，合法的 stages 优先于 stage', () => {
    expect(queryOf('stage=no_batch').get('stages')).toBe('no_batch');
    expect(queryOf('stage=confirmed').has('stages')).toBe(false);
    expect(queryOf('stage=confirmed').has('stage')).toBe(false);
    expect(queryOf('stages=confirmed&stage=no_batch').get('stages')).toBe('no_batch');
    expect(queryOf('stages=awaiting_date&stage=no_batch').get('stages')).toBe('awaiting_date');
    expect(queryOf('stages=no_batch,awaiting_date').get('stages')).toBe('no_batch,awaiting_date');
    const written = addressOf('stages=no_batch,awaiting_date&stage=done', { kind: 'stage', value: 'cancelled' });
    expect(written.get('stage')).toBe('cancelled');
    expect(written.has('stages')).toBe(false);
    expect(queryOf(written.toString()).get('stages')).toBe('cancelled');
    const cleared = addressOf(written.toString(), { kind: 'stage', value: '' });
    expect(cleared.has('stage')).toBe(false);
    expect(cleared.has('stages')).toBe(false);
    expect(readDesk(cleared.toString()).stage.value).toBe('');
    const kept = addressOf('stage=no_batch', { kind: 'stage', value: 'confirmed' });
    expect(kept.get('stage')).toBe('no_batch');
  });

  it('多个阶段用顿号显示，查询仍是逗号列表', () => {
    const desk = readDesk('stages=no_batch,awaiting_date&stage=done');
    expect(desk.stage.value).toBe('未建要货、待确认日期');
    expect(desk.stage.kind).toBe('many');
    expect(queryOf('stages=no_batch,awaiting_date&stage=done').get('stages')).toBe('no_batch,awaiting_date');
    expect(readDesk('stage=no_batch').stage).toEqual({ kind: 'one', value: 'no_batch' });
    expect(readDesk('').stage).toEqual({ kind: 'all', value: '' });
    expect(readDesk('').stageChoices[0]).toEqual({ value: '', label: '全部阶段' });
    expect(readDesk('').stageChoices.some((choice) => choice.value === 'no_batch' && choice.label === '未建要货')).toBe(true);
  });

  it('逾期只认 overdue=1 和 overdueOnly=true，写回地址是 overdue=1', () => {
    expect(queryOf('overdue=1').get('overdueOnly')).toBe('true');
    expect(queryOf('overdueOnly=true').get('overdueOnly')).toBe('true');
    expect(queryOf('overdue=true').has('overdueOnly')).toBe(false);
    expect(queryOf('overdueOnly=1').has('overdueOnly')).toBe(false);
    expect(readDesk('overdue=1').isOverdue).toBe(true);
    expect(readDesk('overdue=true').isOverdue).toBe(false);
    const written = addressOf('overdueOnly=true&buyer=me&page=2', { kind: 'overdue', value: true });
    expect(written.get('overdue')).toBe('1');
    expect(written.has('overdueOnly')).toBe(false);
    expect(written.get('buyer')).toBe('me');
    expect(written.has('page')).toBe(false);
    const again = writeDesk({ search: written.toString(), change: { kind: 'overdue', value: true } });
    expect(again).toBe(written.toString());
    const cleared = addressOf('buyer=me&overdue=1&page=2', { kind: 'overdue', value: false });
    expect(cleared.has('overdue')).toBe(false);
    expect(cleared.has('overdueOnly')).toBe(false);
    expect(cleared.has('page')).toBe(false);
    expect(queryOf(cleared.toString()).has('overdueOnly')).toBe(false);
  });

  it('页码缺失或非法是 1，每页缺省 50，显式 200 保留，超过上限按 200', () => {
    expect(queryOf('q=宜侬').get('page')).toBe('1');
    expect(queryOf('q=宜侬').get('pageSize')).toBe('50');
    expect(readDesk('').pageSize).toBe(50);
    expect(readDesk('pageSize=50').pageSize).toBe(50);
    expect(queryOf('page=2&pageSize=500').get('page')).toBe('2');
    expect(queryOf('page=2&pageSize=500').get('pageSize')).toBe('200');
    expect(queryOf('page=0&pageSize=0').get('page')).toBe('1');
    expect(queryOf('page=0&pageSize=0').get('pageSize')).toBe('50');
    expect(queryOf('page=abc&pageSize=1.5').get('page')).toBe('1');
    expect(queryOf('page=abc&pageSize=1.5').get('pageSize')).toBe('50');
    expect(queryOf('pageSize=1').get('pageSize')).toBe('1');
    expect(queryOf('pageSize=200').get('pageSize')).toBe('200');
    const kept = addressOf('page=2&pageSize=500&buyer=me', { kind: 'text', value: '面膜' });
    expect(kept.has('page')).toBe(false);
    expect(kept.get('pageSize')).toBe('500');
    expect(queryOf(kept.toString()).get('page')).toBe('1');
    expect(queryOf(kept.toString()).get('pageSize')).toBe('200');
  });

  it('改每页行数写进地址并回到第一页，非法值不动地址', () => {
    const written = writeDesk({ search: 'page=3', change: { kind: 'pageSize', value: 100 } });
    const params = new URLSearchParams(written);
    expect(params.get('pageSize')).toBe('100');
    expect(params.has('page')).toBe(false);
    expect(writeDesk({ search: 'page=3', change: { kind: 'pageSize', value: 0 } })).toBe('page=3');
    expect(writeDesk({ search: 'page=3', change: { kind: 'pageSize', value: 'abc' } })).toBe('page=3');
  });

  it('改线别会清掉页码，陌生键留在地址上且不进查询', () => {
    const written = addressOf('lane=finished&page=3&q=面膜&pageSize=50', { kind: 'lane', value: 'material' });
    expect(written.get('lane')).toBe('material');
    expect(written.has('page')).toBe(false);
    expect(written.get('q')).toBe('面膜');
    expect(written.get('pageSize')).toBe('50');
    expect(queryOf(written.toString()).get('page')).toBe('1');
    expect(queryOf(written.toString()).get('lane')).toBe('material');
    expect(readDesk('lane=bogus').lane).toBe('finished');
    expect(queryOf('lane=bogus').get('lane')).toBe('finished');
    const once = writeDesk({
      search: 'buyer=me&q=宜侬&overdueOnly=true&foo=1&page=4',
      change: { kind: 'stage', value: 'no_batch' },
    });
    const twice = writeDesk({ search: once, change: { kind: 'stage', value: 'no_batch' } });
    expect(twice).toBe(once);
    const params = new URLSearchParams(once);
    expect(params.get('foo')).toBe('1');
    expect(params.get('buyer')).toBe('me');
    expect(params.get('stage')).toBe('no_batch');
    expect(params.get('overdue')).toBe('1');
    expect(params.has('overdueOnly')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(queryOf(once).has('foo')).toBe(false);
    expect(queryOf(once).get('stages')).toBe('no_batch');
  });

  it('空数量是破折号，0 仍是 0，阶段显示未建要货', () => {
    const blank = lineRow({ qtyOrdered: null, receivedQty: null, delivered: null, stage: 'no_batch', poRaw: null, id: 'line-9' });
    expect(lineCell({ column: 'qtyOrdered', row: blank, now: NOW })).toEqual({ kind: 'text', text: '—' });
    expect(lineCell({ column: 'received', row: blank, now: NOW })).toEqual({ kind: 'text', text: '—' });
    expect(lineCell({ column: 'factoryDelivered', row: blank, now: NOW })).toEqual({ kind: 'missing', reason: 'no_matching_record' });
    expect(lineCell({ column: 'stage', row: blank, now: NOW })).toEqual({ kind: 'text', text: '未建要货' });
    expect(lineCell({ column: 'buyer', row: blank, now: NOW })).toEqual({ kind: 'text', text: '未分配' });
    expect(lineCell({ column: 'po', row: blank, now: NOW })).toEqual({ kind: 'link', text: '无单号', href: '/lines/line-9' });
    expect(lineCell({ column: 'nextDue', row: blank, now: NOW })).toEqual({ kind: 'text', text: '—' });
    const zero = lineRow({ qtyOrdered: 0, receivedQty: 0, delivered: 0, daysInStage: 0, poRaw: 'PO14', id: 'line-2' });
    expect(lineCell({ column: 'qtyOrdered', row: zero, now: NOW })).toEqual({ kind: 'text', text: '0' });
    expect(lineCell({ column: 'received', row: zero, now: NOW })).toEqual({ kind: 'text', text: '0' });
    expect(lineCell({ column: 'factoryDelivered', row: zero, now: NOW })).toEqual({ kind: 'text', text: '0' });
    expect(lineCell({ column: 'daysInStage', row: zero, now: NOW })).toEqual({ kind: 'text', text: '0' });
    expect(lineCell({ column: 'po', row: zero, now: NOW })).toEqual({ kind: 'link', text: 'PO14', href: '/lines/line-2' });
    expect(lineCell({ column: 'stage', row: lineRow({ stage: 'awaiting_shipment' }), now: NOW })).toEqual({ kind: 'text', text: '待发货' });
    const raw = lineRow({ delivered: null, raw: '原文', missingReason: 'unparseable' });
    expect(lineCell({ column: 'factoryDelivered', row: raw, now: NOW })).toEqual({ kind: 'missing', reason: 'unparseable', raw: '原文' });
  });

  it('数量带千分位，整数不带小数', () => {
    const big = lineRow({ qtyOrdered: 700000, receivedQty: 1234.5, delivered: 20000 });
    expect(lineCell({ column: 'qtyOrdered', row: big, now: NOW })).toEqual({ kind: 'text', text: '700,000' });
    expect(lineCell({ column: 'received', row: big, now: NOW })).toEqual({ kind: 'text', text: '1,234.5' });
    expect(lineCell({ column: 'factoryDelivered', row: big, now: NOW })).toEqual({ kind: 'text', text: '20,000' });
  });

  it('下一到货用确认日，只有逾期天数大于 0 才加逾期', () => {
    const late = lineRow({ hasNextDue: true, dateBuyerConfirmed: '2026-10-01', overdueDays: 3 });
    expect(lineCell({ column: 'nextDue', row: late, now: NOW })).toEqual({ kind: 'text', text: '10-01 逾期3' });
    expect(lineCell({ column: 'factoryRequired', row: late, now: NOW })).toEqual({ kind: 'missing', reason: 'not_provided' });
    const dated = lineRow({ hasNextDue: true, dateFactoryRequired: '2026-10-18' });
    expect(lineCell({ column: 'factoryRequired', row: dated, now: NOW })).toEqual({ kind: 'text', text: '10-18' });
    expect(lineCell({ column: 'factoryRequired', row: lineRow(), now: NOW })).toEqual({ kind: 'missing', reason: 'not_provided' });
    const quiet = lineRow({ hasNextDue: true, dateBuyerConfirmed: '2026-10-02', overdueDays: null });
    expect(lineCell({ column: 'nextDue', row: quiet, now: NOW })).toEqual({ kind: 'text', text: '10-02' });
    const today = lineRow({ hasNextDue: true, dateBuyerConfirmed: '2026-10-02', overdueDays: 0 });
    expect(lineCell({ column: 'nextDue', row: today, now: NOW })).toEqual({ kind: 'text', text: '10-02' });
    const early = lineRow({ hasNextDue: true, dateBuyerConfirmed: '2026-10-02', overdueDays: -1 });
    expect(lineCell({ column: 'nextDue', row: early, now: NOW })).toEqual({ kind: 'text', text: '10-02' });
    const undated = lineRow({ hasNextDue: true, dateBuyerConfirmed: null, overdueDays: 4 });
    expect(lineCell({ column: 'nextDue', row: undated, now: NOW })).toEqual({ kind: 'text', text: '逾期4' });
    const lastYear = lineRow({ hasNextDue: true, dateBuyerConfirmed: '2025-10-01', overdueDays: null });
    expect(lineCell({ column: 'nextDue', row: lastYear, now: NOW })).toEqual({ kind: 'text', text: '2025-10-01' });
  });
});

type RowPatch = {
  readonly id?: string;
  readonly qtyOrdered?: number | null;
  readonly receivedQty?: number | null;
  readonly delivered?: number | null;
  readonly missingReason?: MissingReason;
  readonly raw?: string;
  readonly stage?: LineStage;
  readonly daysInStage?: number;
  readonly poRaw?: string | null;
  readonly hasNextDue?: boolean;
  readonly dateBuyerConfirmed?: string | null;
  readonly overdueDays?: number | null;
  readonly dateFactoryRequired?: string | null;
};

function queryOf(search: string): URLSearchParams {
  return new URLSearchParams(readDesk(search).requestQuery);
}

function addressOf(search: string, change: Parameters<typeof writeDesk>[0]['change']): URLSearchParams {
  return new URLSearchParams(writeDesk({ search, change }));
}

function lineRow(input: RowPatch = {}) {
  return OrderLineRowSchema.parse({
    id: input.id ?? 'line-1',
    lane: 'finished',
    po: { id: 'po-1', poRaw: input.poRaw === undefined ? 'PO1' : input.poRaw, poFormat: 'NONE' },
    nameRaw: '面膜',
    itemCodeRaw: null,
    barcodeRaw: null,
    supplier: { id: null, displayName: '宜侬', rawName: null },
    receiver: null,
    qtyOrdered: input.qtyOrdered === undefined ? 10 : input.qtyOrdered,
    receivedQty: input.receivedQty === undefined ? 1 : input.receivedQty,
    factoryDeliveredQty: deliveredQty(input),
    stage: input.stage ?? 'awaiting_shipment',
    nextDue: nextDueOf(input),
    daysInStage: input.daysInStage ?? 3,
    buyer: null,
    statusReported: '在途',
    missingInLatestImport: false,
    openExceptionCount: 0,
    origin: 'manual',
  });
}

function deliveredQty(input: RowPatch) {
  const provenance = systemProvenance();
  if (typeof input.delivered === 'number') return { value: input.delivered, provenance };
  const missingReason = input.missingReason ?? 'no_matching_record';
  if (input.raw === undefined) return { value: null, missingReason, provenance };
  return { value: null, missingReason, raw: input.raw, provenance };
}

function systemProvenance(): { readonly kind: 'system'; readonly rule: string; readonly at: string } {
  return { kind: 'system', rule: 'fixture', at: '2026-10-01T00:00:00.000Z' };
}

function nextDueOf(input: RowPatch) {
  if (input.hasNextDue !== true) return null;
  return {
    batchId: 'batch-1',
    dateBuyerConfirmed: input.dateBuyerConfirmed ?? null,
    overdueDays: input.overdueDays ?? null,
    dateFactoryRequired: input.dateFactoryRequired ?? null,
  };
}
