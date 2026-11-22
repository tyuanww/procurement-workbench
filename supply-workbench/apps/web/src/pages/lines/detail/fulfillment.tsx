import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Input, Space, Tag, Typography } from 'antd';
import { ReceiptViewSchema, ShipmentViewSchema, type BatchView, type ReceiptView, type ShipmentView } from '@sw/contracts';
import { countsInRecordedQuantity, isNotProvided, normalizeUnit, type FulfillmentEvidence, type FulfillmentReviewReason } from '@sw/domain';
import { apiErrorMessage, apiSend } from '../../../shared/api/client.js';
import { formatDateTime } from '../../../shared/ui/format.js';

const quantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });
const reviewLabels = {
  unit_missing: '缺数量单位',
  unit_conflict: '单位与计划不同',
  receipt_disposition: '处置待核',
} satisfies Record<FulfillmentReviewReason, string>;

export function FulfillmentSummary({ facts }: { readonly facts: NonNullable<BatchView['fulfillment']> }) {
  return (
    <div>
      <Typography.Text strong>{`未发 ${qtyText(facts.unshippedQty, facts.unit)} · 待收 ${qtyText(facts.inTransitQty, facts.unit)} · 实收 ${qtyText(facts.receivedQty, facts.unit)}`}</Typography.Text>
      <div>
        {facts.unit === null ? <Typography.Text type="warning">计划单位未填 </Typography.Text> : null}
        {facts.reviewCount > 0 ? <Typography.Text type="warning">{facts.reviewCount} 条记录待核 </Typography.Text> : null}
        <Variance label="超发" qty={facts.overShippedQty} unit={facts.unit} />
        <Variance label="超收" qty={facts.overReceivedQty} unit={facts.unit} />
        <Variance label="实收缺交运依据" qty={facts.receiptWithoutShipmentQty} unit={facts.unit} />
      </div>
    </div>
  );
}

function Variance({ label, qty, unit }: { readonly label: string; readonly qty: number; readonly unit: string | null }) {
  return qty > 0 ? <Typography.Text type="warning">{label} {qtyText(qty, unit)} </Typography.Text> : null;
}

function qtyText(qty: number | null, unit: string | null): string {
  return qty === null ? '待核' : `${quantity.format(qty)}${unit === null ? '' : ` ${unit}`}`;
}

export function FulfillmentRecords({ batch, canEdit, canViewArrival, onVerify, onReload }: {
  readonly batch: BatchView;
  readonly canEdit: boolean;
  readonly canViewArrival: boolean;
  readonly onVerify: (id: string) => void;
  readonly onReload: () => void;
}) {
  if (batch.shipments.length + batch.receipts.length === 0) return null;
  const linked = new Map(batch.shipments.flatMap((row) =>
    row.voidedAt === null && row.fulfillment?.kind === 'verified' && row.fulfillment.reportId !== undefined
      ? [[row.fulfillment.reportId, countsInRecordedQuantity(row)] as const] : []));
  return (
    <ul>
      {batch.shipments.map((row) => <li key={row.id}>
        <RecordText row={row} title={shipmentLabel(row, linked)} date={row.shippedOn} />
        {canEdit && row.voidedAt === null && row.fulfillment?.kind === 'reported' && !linked.has(row.id) ? <Button type="link" onClick={() => onVerify(row.id)}>核实报发</Button> : null}
        <VoidForm row={row} resource="shipments" canEdit={canEdit} onReload={onReload} />
      </li>)}
      {batch.receipts.map((row) => <li key={row.id}>
        <RecordText row={row} title={row.fulfillment == null ? '历史收货登记' : row.fulfillment.disposition === 'return' ? '退回记录' : row.fulfillment.disposition === 'rework' ? '返工记录' : '实收登记'} date={row.receivedOn} />
        {row.fulfillment?.arrival === undefined ? <VoidForm row={row} resource="receipts" canEdit={canEdit} onReload={onReload} />
          : canViewArrival ? <> · <Link to={`/lines?arrival=${encodeURIComponent(row.fulfillment.arrival.arrivalId)}`}>查看到仓凭据</Link></> : null}
      </li>)}
    </ul>
  );
}

function shipmentLabel(row: ShipmentView, linked: ReadonlyMap<string, boolean>): string {
  if (row.fulfillment == null) return '历史发货登记';
  if (row.fulfillment.kind === 'verified') return '实发登记';
  return linked.get(row.id) === true ? '工厂报发已核实' : '工厂报发待核';
}

function RecordText({ row, title, date }: { readonly row: ShipmentView | ReceiptView; readonly title: string; readonly date: string }) {
  const facts = row.fulfillment;
  const recorded = formatDateTime(row.recordedAt ?? null);
  return <span>
    <Tag variant="filled">{title}</Tag>{' '}{date} · {qtyText(row.qty, facts?.unit ?? null)}
    {facts == null ? ' · 历史记录待补证' : ` · ${facts.evidence}`}
    {recordWarning(facts)}
    {recorded === null ? '' : ` · 登记于 ${recorded}`}
    {row.voidedAt === null ? '' : ` · 已作废（${row.voidReason ?? ''}）`}
  </span>;
}

function recordWarning(facts: FulfillmentEvidence | null | undefined): string {
  if (facts == null) return '';
  if (normalizeUnit(facts.unit) === null) return ' · 缺数量单位';
  if (isNotProvided(facts.evidence)) return ' · 缺可回查依据';
  if (facts.kind === 'reported') return '';
  return facts.reviewReason === null ? '' : ` · ${reviewLabels[facts.reviewReason]}`;
}

function VoidForm({ row, resource, canEdit, onReload }: { readonly row: ShipmentView | ReceiptView; readonly resource: 'shipments' | 'receipts'; readonly canEdit: boolean; readonly onReload: () => void }) {
  const [isOpen, open] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isPending, setPending] = useState(false);
  if (!canEdit || row.voidedAt !== null) return null;
  const label = resource === 'shipments' ? '作废发货' : '作废收货';
  if (!isOpen) return <Button type="link" onClick={() => open(true)}>{label}</Button>;
  async function submit() {
    setPending(true);
    setError('');
    try {
      const id = encodeURIComponent(row.id);
      const target = resource === 'shipments'
        ? { path: `/api/v1/shipments/${id}/void`, schema: ShipmentViewSchema }
        : { path: `/api/v1/receipts/${id}/void`, schema: ReceiptViewSchema };
      await apiSend<ShipmentView | ReceiptView>({ ...target, method: 'POST', body: { reason } });
      onReload();
    } catch (caught) {
      setError(apiErrorMessage(caught) ?? '记录未作废');
    } finally {
      setPending(false);
    }
  }
  return <Space wrap>
    <Input aria-label="作废原因" placeholder="填写原因" value={reason} onChange={(event) => setReason(event.target.value)} />
    <Button danger loading={isPending} disabled={reason.trim() === ''} onClick={() => { void submit(); }}>确认作废</Button>
    <Button onClick={() => { open(false); setError(''); }}>取消</Button>
    {error === '' ? null : <Typography.Text type="danger">{error}</Typography.Text>}
  </Space>;
}
