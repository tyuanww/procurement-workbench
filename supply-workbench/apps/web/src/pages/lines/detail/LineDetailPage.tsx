import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, Button, Collapse, Input, Result, Select, Skeleton, Space, Typography } from 'antd';
import { BatchViewSchema, ProcurementStoreSchema, ShipmentViewSchema, type OrderLineDetail, type ProcurementStore, type TimelineEvent } from '@sw/contracts';
import { apiErrorMessage, apiSend } from '../../../shared/api/client.js';
import { failureText, read, readFailureOf } from '../../../shared/api/reads.js';
import { adoptShipmentPrefill, batchLineText, canAddBatch, dateChangeNeedsReason, missingDeliveredText, openBatchActions, showsRecordEdits, timelineLineText } from '../../../features/follow-up/index.js';
import { useCanWrite } from '../../../shared/actor.js';
import { PageHeader, surfaceStyle } from '../../../shared/ui/page.js';
import { space } from '../../../theme/tokens.js';
import { MissingValue, presentRaw } from '../../../shared/ui/widgets.js';
import { LineRecordDrawer, openRecord } from './RecordSession.js';
import { BuyerControls } from './buyer-controls.js';
import { BatchUnitCorrection, ProcurementFollowUp, ProcurementSection } from './procurement.js';
import { FulfillmentRecords, FulfillmentSummary } from './fulfillment.js';
import { ProcurementBatchDates, ProcurementDateEvidence } from '../../../features/plan/index.js';
import { ScheduleReports } from './schedule-reports.js';

const MISSING_PO = '无单号';
const detailCard = { ...surfaceStyle(), padding: space[3] };

export function lineTitle(poRaw: string | null): string {
  if (poRaw === null || poRaw === '') return MISSING_PO;
  return poRaw;
}

export function LineDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const store = ProcurementStoreSchema.safeParse(params.get('store')).data;
  const back = params.get('backToProgress');
  return <LineDetailContent key={JSON.stringify([id, store])} lineId={id} store={store} back={back} />;
}

function LineDetailContent({ lineId, store, back }: { readonly lineId: string; readonly store: ProcurementStore | undefined; readonly back: string | null }) {
  const [detail, setDetail] = useState<OrderLineDetail | null>(null);
  const [events, setEvents] = useState<readonly TimelineEvent[]>([]);
  const [message, setMessage] = useState('');
  const [isFailed, setFailed] = useState(false);
  const load = () => { void reload({ lineId, store, setDetail, setEvents, setMessage, setFailed }); };
  useEffect(() => { if (lineId !== '') void reload({ lineId, store, setDetail, setEvents, setMessage, setFailed }); }, [lineId, store]);
  const title = detail === null ? '订单行' : lineTitle(detail.po.poRaw);
  const browserTitle = [title, detail?.line.nameRaw].filter(Boolean).join(' · ');
  return (
    <section style={{ maxWidth: 1440 }}>
      {back === null ? null : <Link to={`/progress?${new URLSearchParams(back).toString()}`}>返回管理店铺</Link>}
      <PageHeader title={title} browserTitle={browserTitle} />
      {detail === null ? null : <LineIdentity line={detail.line} />}
      {detail === null && isFailed ? (
        <Result
          status="error"
          title="订单行没有读出来"
          subTitle={message}
          extra={[
            <Button key="retry" type="primary" onClick={load}>重试</Button>,
            <Button key="back" onClick={() => window.history.back()}>返回</Button>,
          ]}
        />
      ) : (
        <div style={detailCard}>
          {detail === null ? <Skeleton active paragraph={{ rows: 8 }} /> : <LineBody detail={detail} events={events} lineId={lineId} setMessage={setMessage} onReload={load} />}
          {detail === null ? null : <BuyerControls detail={detail} onSaved={(saved) => {
            const { pendingBuyerName: _pendingBuyerName, ...current } = detail;
            void _pendingBuyerName;
            setDetail({ ...current, line: { ...current.line, buyer: saved.line.buyer } });
            load();
          }} />}
          {message === '' ? null : <Alert style={{ marginTop: 12 }} type="info" showIcon title={message} />}
        </div>
      )}
    </section>
  );
}

function LineIdentity({ line }: { readonly line: OrderLineDetail['line'] }) {
  const code = line.itemCodeRaw || line.barcodeRaw;
  return <div style={{ marginBottom: space[3], overflowWrap: 'anywhere' }}>
    <Typography.Text strong>{line.nameRaw || '品名未填写'}</Typography.Text>
    <div><Typography.Text type="secondary">{[code ? `商品编码 ${code}` : '', `订单行 ${line.id}`].filter(Boolean).join(' · ')}</Typography.Text></div>
  </div>;
}

type Reload = {
  readonly lineId: string;
  readonly setMessage: (message: string) => void;
  readonly onReload: () => void;
};

function LineBody({ detail, events, lineId, setMessage, onReload }: { readonly detail: OrderLineDetail; readonly events: readonly TimelineEvent[] } & Reload) {
  const canRecord = useCanWrite('records.write');
  const [params, setParams] = useSearchParams();
  const isComponent = detail.line.origin === 'import_procurement_component';
  return (
    <div>
      {detail.line.missingInLatestImport ? <Alert type="warning" showIcon title="最近一次导入里没有这一行" /> : null}
      {detail.line.latestImportPresence === 'unknown' ? <Alert type="info" showIcon title="本批是部分导入，未判断未出现订单行是否缺失" /> : null}
      <ProcurementSection detail={detail} />
      {detail.procurementSchedule === undefined ? null : <ProcurementScheduleEvidence detail={detail} params={params} />}
      {isComponent ? null : <FactorySummary detail={detail} />}
      <Typography.Title level={2}>批次</Typography.Title>
      {canRecord && canAddBatch(detail.line) ? <Button onClick={() => openRecord({ search: params.toString(), setParams, drawer: 'create', batchId: '' })}>新增批次</Button> : null}
      <ul>{detail.batches.map((batch) => (
        <BatchDetail key={batch.id} batch={batch} focused={params.get('focusBatch') === batch.id} canRecord={canRecord} hasProcurementSchedule={detail.procurementSchedule !== undefined} onOpen={(drawer, reportId) => openRecord({
          search: params.toString(), setParams, drawer, batchId: batch.id, ...(reportId === undefined ? {} : { reportId }),
        })} lineId={lineId} setMessage={setMessage} onReload={onReload} />
      ))}</ul>
      {canRecord ? <LineRecordDrawer detail={detail} onReload={onReload} /> : null}
      <DetailTimeline events={events} lineId={lineId} showFollowUp={isComponent && canRecord} onReload={onReload} />
      {isComponent ? null : <ScheduleReports rows={detail.factoryReports.schedule} ordered={detail.line.qtyOrdered} shipped={detail.line.factoryDeliveredQty.value} received={detail.line.receivedQty} />}
      <Shipments detail={detail} onReload={onReload} setMessage={setMessage} />
    </div>
  );
}

function ProcurementScheduleEvidence({ detail, params }: { readonly detail: OrderLineDetail; readonly params: URLSearchParams }) {
  const schedule = detail.procurementSchedule;
  if (schedule === undefined) return null;
  const href = new URLSearchParams(params.get('backToProgress') ?? '');
  href.set('view', 'schedule');
  href.set('scheduleLine', detail.line.id);
  const store = params.get('store');
  if (store !== null) href.set('store', store);
  return <section aria-label="采购排期日期">
    <Typography.Title level={2}>采购排期日期</Typography.Title>
    <ProcurementDateEvidence schedule={schedule} />
    <Link to={`/progress?${href.toString()}`}>查看总排期</Link>
  </section>;
}

function BatchDetail({ batch, focused, canRecord, hasProcurementSchedule, onOpen, lineId, setMessage, onReload }: Reload & {
  readonly batch: OrderLineDetail['batches'][number];
  readonly focused: boolean;
  readonly canRecord: boolean;
  readonly hasProcurementSchedule: boolean;
  readonly onOpen: (drawer: 'ship' | 'receipt', reportId?: string) => void;
}) {
  const canEdit = canRecord && showsRecordEdits(batch.status);
  const confirmedKey = [batch.id, batch.dateBuyerConfirmed, batch.firstConfirmedDate].join(':');
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!focused || row.current === null) return;
    row.current.focus({ preventScroll: true });
    row.current.scrollIntoView({ block: 'center' });
  }, [focused]);
  return (
    <li ref={row} tabIndex={-1}>
      {batchLineText(batch)}
      {batch.fulfillment === undefined ? null : <FulfillmentSummary facts={batch.fulfillment} />}
      {canEdit && batch.fulfillment?.unit === null ? <BatchUnitCorrection batchId={batch.id} onReload={onReload} /> : null}
      {hasProcurementSchedule ? <ProcurementBatchDates batch={batch} /> : <BatchPromise batch={batch} />}
      {canEdit ? <ProcurementFollowUp lineId={lineId} batchId={batch.id} onReload={onReload} /> : null}
      {canEdit ? <BatchDate key={confirmedKey} batch={batch} onReload={onReload} setMessage={setMessage} /> : null}
      {canRecord ? openBatchActions(batch.status).map((action) => (
        <Button key={action.kind} onClick={() => onOpen(action.kind)}>{action.label}</Button>
      )) : null}
      <FulfillmentRecords batch={batch} canEdit={canEdit} canViewArrival={canRecord} onReload={onReload} onVerify={(reportId) => onOpen('ship', reportId)} />
    </li>
  );
}

function BatchPromise({ batch }: { readonly batch: OrderLineDetail['batches'][number] }) {
  return batch.dateSupplierPromised === null ? null : <div>工厂承诺 {batch.dateSupplierPromised}</div>;
}

function FactorySummary({ detail }: { readonly detail: OrderLineDetail }) {
  const delivered = detail.line.factoryDeliveredQty;
  return (
    <>
      <Collapse
        items={[{ key: 'snapshot', label: '来源事实', children: <p>{detail.snapshot === null ? '没有快照' : detail.snapshot.importBatchId}</p> }]}
        style={{ marginTop: 12 }}
      />
      {delivered.value === null ? <p style={{ marginTop: 12 }}><MissingValue reason={delivered.missingReason ?? 'no_matching_record'} {...presentRaw(delivered.raw)} /> {missingDeliveredText()}</p> : <p style={{ marginTop: 12 }}>代工厂已交 {delivered.value}</p>}
    </>
  );
}

function DetailTimeline({ events, lineId, showFollowUp, onReload }: { readonly events: readonly TimelineEvent[]; readonly lineId: string; readonly showFollowUp: boolean; readonly onReload: () => void }) {
  return (
    <>
      <Typography.Title level={2}>时间线</Typography.Title>
      {showFollowUp ? <ProcurementFollowUp lineId={lineId} onReload={onReload} /> : null}
      <ul>{events.map((event) => (
        <li key={event.id}>
          {timelineLineText(event)}
          {event.kind === 'follow_up' && !event.voided ? <div style={{ whiteSpace: 'pre-wrap' }}>{event.text}</div> : null}
        </li>
      ))}</ul>
    </>
  );
}

function BatchDate(props: { readonly batch: OrderLineDetail['batches'][number]; readonly onReload: () => void; readonly setMessage: (message: string) => void }) {
  const [date, setDate] = useState(props.batch.dateBuyerConfirmed ?? '');
  const [reason, setReason] = useState('');
  const hasConfirmedDate = props.batch.firstConfirmedDate !== null;
  const isReasonRequired = dateChangeNeedsReason({ hadDate: hasConfirmedDate, reason });
  return (
    <Space wrap>
      <Input aria-label="确认日" value={date} onChange={(event) => setDate(event.target.value)} placeholder="YYYY-MM-DD" style={{ width: 160 }} />
      {hasConfirmedDate ? <Input aria-label="确认日原因" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="原因" style={{ width: 160 }} /> : null}
      <Button disabled={isReasonRequired || date === ''} onClick={() => { void saveDate({ batchId: props.batch.id, date, reason: hasConfirmedDate ? reason : undefined, onReload: props.onReload, setMessage: props.setMessage }); }}>保存确认日</Button>
    </Space>
  );
}

function Shipments({ detail, onReload, setMessage }: { readonly detail: OrderLineDetail; readonly onReload: () => void; readonly setMessage: (message: string) => void }) {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  return (
    <div>
      {detail.factoryReports.shipments.map((row) => (
        <AdoptRow key={row.id} rowId={row.id} qty={row.payload.qty.value} shippedOn={row.payload.shipOrArriveOn.value} batches={detail.batches.filter((batch) => showsRecordEdits(batch.status))} onReload={onReload} setMessage={setMessage} />
      ))}
    </div>
  );
}

function AdoptRow(props: { readonly rowId: string; readonly qty: number | null; readonly shippedOn: string | null; readonly batches: OrderLineDetail['batches']; readonly onReload: () => void; readonly setMessage: (message: string) => void }) {
  const prefill = adoptShipmentPrefill({ qty: props.qty, shippedOn: props.shippedOn });
  const [batchId, setBatchId] = useState(props.batches[0]?.id ?? '');
  return (
    <Space wrap>
      <Typography.Text>出货 {prefill.qty ?? ''} {prefill.shippedOn ?? ''}</Typography.Text>
      <Select
        aria-label="采纳到批次"
        style={{ width: 160 }}
        value={batchId}
        options={props.batches.map((batch) => ({ value: batch.id, label: `批次 ${batch.seq}` }))}
        onChange={setBatchId}
      />
      <Button disabled={batchId === ''} onClick={() => { void adopt({ rowId: props.rowId, batchId, prefill, onReload: props.onReload, setMessage: props.setMessage }); }}>采纳待补证</Button>
    </Space>
  );
}

async function reload(input: { readonly lineId: string; readonly store: ProcurementStore | undefined; readonly setDetail: (detail: OrderLineDetail | null) => void; readonly setEvents: (events: readonly TimelineEvent[]) => void; readonly setMessage: (message: string) => void; readonly setFailed: (isFailed: boolean) => void }) { const { lineId, setDetail, setEvents, setMessage, setFailed } = input;
  try {
    const [detail, timeline] = await Promise.all([
      read({ name: 'line', id: lineId, ...(input.store === undefined ? {} : { store: input.store }) }),
      read({ name: 'lineTimeline', id: lineId }),
    ]);
    setDetail(detail);
    setEvents(timeline.events);
    setFailed(false);
  } catch (error: unknown) {
    const failure = readFailureOf(error);
    setMessage(failure === null ? '订单行没有读出来。' : failureText(failure));
    setFailed(true);
  }
}

async function saveDate(input: { readonly batchId: string; readonly date: string; readonly reason: string | undefined; readonly onReload: () => void; readonly setMessage: (message: string) => void }) {
  const isFailed = await sendOrReport(input.setMessage, apiSend({
    path: `/api/v1/batches/${encodeURIComponent(input.batchId)}`,
    method: 'PATCH',
    body: { dateBuyerConfirmed: input.date, ...(input.reason === undefined ? {} : { reason: input.reason }) },
    schema: BatchViewSchema,
  }));
  if (isFailed) return;
  input.setMessage('确认日已保存');
  input.onReload();
}

async function adopt(input: { readonly rowId: string; readonly batchId: string; readonly prefill: { readonly qty: number | null; readonly shippedOn: string | null }; readonly onReload: () => void; readonly setMessage: (message: string) => void }) { const { rowId, batchId, prefill, onReload, setMessage } = input;
  const isFailed = await sendOrReport(setMessage, apiSend({
    path: `/api/v1/factory-reports/shipment-rows/${encodeURIComponent(rowId)}/adopt`,
    method: 'POST',
    body: { batchId, ...(prefill.qty === null ? {} : { qty: prefill.qty }), ...(prefill.shippedOn === null ? {} : { shippedOn: prefill.shippedOn }) },
    schema: ShipmentViewSchema,
  }));
  if (!isFailed) onReload();
}

async function sendOrReport(setMessage: (message: string) => void, pending: Promise<unknown>): Promise<boolean> {
  try {
    await pending;
    return false;
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    setMessage(message);
    return true;
  }
}
