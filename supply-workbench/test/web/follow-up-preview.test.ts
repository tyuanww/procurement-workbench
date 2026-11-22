import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import type { LineTimeline, OrderLineDetail } from '../../packages/application/src/follow-up/views.js';
import { orderLineId } from '../../packages/domain/src/values/ids.js';
import { parseLocalDate } from '../../packages/domain/src/values/index.js';
import { drawerWide } from '../../apps/web/src/theme/tokens.js';
import { readFollowUpPreview, writeFollowUpPreview } from '../../apps/web/src/pages/lines/list/follow-up-preview-url.js';
import { FollowUpPreviewFields } from '../../apps/web/src/pages/lines/list/FollowUpPreviewDrawer.js';
import { apiGetWithSignal } from '../../apps/web/src/shared/api/client.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

const detail: OrderLineDetail = {
  line: {
    id: 'line-1', lane: 'finished', po: { id: 'po-1', poRaw: 'PO-001', poFormat: 'OTHER' }, nameRaw: '海葡萄', itemCodeRaw: null, barcodeRaw: null,
    supplier: { id: 'supplier-1', displayName: '宜侬供应链', rawName: null }, receiver: null, qtyOrdered: 100, receivedQty: 20,
    factoryDeliveredQty: { value: 30, provenance: { kind: 'manual', by: 'test', at: '2026-11-07T02:00:00Z' } }, stage: 'awaiting_receipt', nextDue: { batchId: 'batch-1', dateBuyerConfirmed: localDate('2026-11-10'), overdueDays: 0, dateFactoryRequired: null },
    daysInStage: 2, buyer: { id: 'buyer-1', name: '采购甲' }, statusReported: null, missingInLatestImport: false, openExceptionCount: 0, origin: 'import_po_master', unit: '件', purchaseOrderId: 'po-1', itemId: null, cancelledAt: null, cancelReason: null,
  },
  po: { id: 'po-1', poRaw: 'PO-001', poFormat: 'OTHER', relatedPoRaws: [] }, codes: [], snapshot: null,
  batches: [{ id: 'batch-1', orderLineId: 'line-1', seq: 1, plannedQty: 100, receiverPartyId: 'factory-1', dateFactoryRequired: null, dateSupplierPromised: localDate('2026-11-08'), dateBuyerConfirmed: localDate('2026-11-10'), firstConfirmedDate: localDate('2026-11-10'), confirmedBy: null, confirmedAt: null, status: 'confirmed', statusChangedAt: '2026-11-07T02:00:00Z', origin: 'manual', originRef: null, closedAt: null, closedReason: null, cancelledAt: null, cancelReason: null, shipments: [], receipts: [], deliveryNote: null, shippedQty: 10, receivedQty: 20, qtyVariance: null, noteStatus: 'missing', overdueDays: 0, daysInStage: 2, dateChanges: [] }],
  factoryReports: { inTransit: [], shipments: [], stock: [], schedule: [], demand: [], packagingCombo: [] }, exceptions: [], followUps: [{ id: 'follow-1', orderLineId: 'line-1', kind: 'note', batchId: null, text: '跟进供应商', partyId: null, createdBy: '采购甲' }],
};

const timeline: LineTimeline = { events: [], nextCursor: null };

describe('跟进台预览 URL/session', () => {
  it('只接受 preview 和有效 lineId，打开保留其它 query', () => {
    expect(readFollowUpPreview('?drawer=preview&lineId=line-1&lane=material&page=2')).toEqual({ kind: 'open', lineId: 'line-1', preservedSearch: '?lane=material&page=2' });
    expect(readFollowUpPreview('?drawer=detail&lineId=line-1')).toBeNull();
    expect(readFollowUpPreview('?drawer=preview')).toBeNull();
    expect(readFollowUpPreview('?drawer=preview&lineId=')).toBeNull();
  });

  it('打开与关闭只写 drawer/lineId，保留现有 query', () => {
    const opened = writeFollowUpPreview({ search: '?lane=finished&page=2', session: { kind: 'open', lineId: orderLineId('line-1'), preservedSearch: '?lane=finished&page=2' } });
    expect(opened.toString()).toBe('lane=finished&page=2&drawer=preview&lineId=line-1');
    const closed = writeFollowUpPreview({ search: opened.toString(), session: null });
    expect(closed.toString()).toBe('lane=finished&page=2');
  });
});

describe('跟进台预览只读内容', () => {
  it('使用 720 宽并在失败时保留错误提示和关闭入口', () => {
    expect(drawerWide).toBe(720);
    const html = markup(FollowUpPreviewFields, { detail, timeline, error: '订单行没有读出来' });
    expect(html).toContain('订单行没有读出来');
    expect(html).not.toContain('保存确认日');
    expect(html).not.toContain('录入发货');
    expect(html).not.toContain('录入收货');
    expect(html).not.toContain('ant-input');
  });

  it('读取支持 AbortSignal，抽屉卸载时可取消请求', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const controller = new AbortController();
    const value = await apiGetWithSignal({ path: '/api/v1/lines/line-1', schema: { safeParse: () => ({ success: true as const, data: { ok: true } }) }, signal: controller.signal });
    expect(value).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/v1/lines/line-1', { credentials: 'include', signal: controller.signal });
    fetch.mockRestore();
  });
});

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


function localDate(value: string) {
  const parsed = parseLocalDate(value);
  if (!parsed.ok) throw new Error(value);
  return parsed.value;
}
