import { useEffect, useState } from 'react';
import { Button, Drawer, Flex } from 'antd';
import type { OrderLineDetail } from '@sw/contracts';
import { ApiError, apiErrorMessage } from '../../../shared/api/client.js';
import {
  businessToday,
  canAddBatch,
  createDraft,
  draftTitle,
  postManualBatch,
  postReceipt,
  postShipment,
  openBatchActions,
  receiptDraft,
  recordError,
  RecordForm,
  shipDraft,
  showsRecordEdits,
  type RecordDraft,
} from '../../../features/follow-up/index.js';
import { loadBatchReceivers } from '../../../features/master-data/index.js';
import { drawerWidth } from '../../../theme/tokens.js';
import { writeUrlState } from '../../../shared/hooks/url-state.js';
import { useLineDetailSearchParams } from './desk-navigation.js';

export function LineRecordDrawer(props: {
  readonly detail: OrderLineDetail;
  readonly onReload: () => void;
}) {
  const { params, setParams } = useLineDetailSearchParams();
  const drawer = params.get('drawer');
  const batchId = params.get('batchId') ?? '';
  const reportId = params.get('reportId') ?? '';
  if (drawer !== 'ship' && drawer !== 'receipt' && drawer !== 'create') return null;
  return (
    <RecordSession
      key={`${drawer}:${batchId}:${reportId}`}
      detail={props.detail}
      drawer={drawer}
      batchId={batchId}
      reportId={reportId}
      onReload={props.onReload}
      onClose={() => setParams(new URLSearchParams(writeUrlState(params.toString(), { drawer: null, batchId: null, reportId: null })))}
    />
  );
}

export function openRecord(input: {
  readonly search: string;
  readonly setParams: (next: URLSearchParams) => void;
  readonly drawer: 'ship' | 'receipt' | 'create';
  readonly batchId: string;
  readonly reportId?: string;
}) {
  const batchId = input.drawer === 'create' ? null : input.batchId;
  input.setParams(new URLSearchParams(writeUrlState(input.search, { drawer: input.drawer, batchId, reportId: input.reportId ?? null })));
}

function RecordSession(props: {
  readonly detail: OrderLineDetail;
  readonly drawer: 'ship' | 'receipt' | 'create';
  readonly batchId: string;
  readonly reportId: string;
  readonly onReload: () => void;
  readonly onClose: () => void;
}) {
  const [warehouses, setWarehouses] = useState<readonly { readonly id: string; readonly name: string }[]>([]);
  const [draft, setDraft] = useState<RecordDraft | null>(() => draftFromQuery({ ...props, warehouses: [] }));
  const [isFirstBatch] = useState(() => props.drawer === 'create' && props.detail.batches.length === 0);
  const [serverError, setServerError] = useState('');
  const [isPending, setPending] = useState(false);
  useEffect(() => { if (props.drawer === 'create') void readWarehouses(setWarehouses, setServerError); }, [props.drawer]);
  useEffect(() => {
    if (draft?.kind !== 'create' || draft.receiverPartyId !== '') return;
    const next = createDraft({
      lineId: props.detail.line.id,
      qtyOrdered: props.detail.line.qtyOrdered,
      receiverPartyId: props.detail.line.receiver?.id ?? null,
      warehouses,
    });
    if (next.receiverPartyId === '') return;
    setDraft({ ...draft, receiverPartyId: next.receiverPartyId });
  }, [draft, props.detail.line.id, props.detail.line.qtyOrdered, props.detail.line.receiver, warehouses]);
  if (draft === null) return null;
  const clientError = recordError(draft, businessToday());
  const error = serverError !== '' ? serverError : clientError;
  return (
    <Drawer placement="right" size={drawerWidth} open onClose={props.onClose} title={draftTitle(draft)} footer={
      <Flex justify="flex-end">
        <Button type="primary" loading={isPending} disabled={isPending || error !== ''} onClick={() => { void submit({ draft, firstBatchOnly: isFirstBatch, setServerError, setPending, onClose: props.onClose, onReload: props.onReload }); }}>确认</Button>
      </Flex>
    }>
      <RecordForm draft={draft} error={error} warehouses={warehouses} onChange={(next) => { setServerError(''); setDraft(next); }} />
    </Drawer>
  );
}

function draftFromQuery(input: {
  readonly detail: OrderLineDetail;
  readonly drawer: 'ship' | 'receipt' | 'create';
  readonly batchId: string;
  readonly reportId: string;
  readonly warehouses: readonly { readonly id: string }[];
}): RecordDraft | null {
  if (input.drawer === 'create') {
    if (!canAddBatch(input.detail.line)) return null;
    return createDraft({
      lineId: input.detail.line.id,
      qtyOrdered: input.detail.line.qtyOrdered,
      receiverPartyId: input.detail.line.receiver?.id ?? null,
      warehouses: input.warehouses,
    });
  }
  const batch = input.detail.batches.find((row) => row.id === input.batchId);
  if (batch === undefined) return null;
  if (!canOpenRecord({ status: batch.status, drawer: input.drawer, reportId: input.reportId })) return null;
  if (input.drawer === 'ship') return shipmentDraft(batch, input.reportId);
  const draft = receiptDraft({ batchId: batch.id, plannedQty: batch.plannedQty, receivedQty: batch.receivedQty, lane: input.detail.line.lane, today: businessToday() });
  return {
    ...draft,
    qty: 0,
    fulfillment: { kind: 'received', unit: batch.fulfillment?.unit ?? null, evidence: '', disposition: 'normal' },
  };
}

function canOpenRecord(input: {
  readonly status: OrderLineDetail['batches'][number]['status'];
  readonly drawer: 'ship' | 'receipt';
  readonly reportId: string;
}): boolean {
  if (input.drawer === 'ship' && input.reportId !== '') return showsRecordEdits(input.status);
  return openBatchActions(input.status).some((action) => action.kind === input.drawer);
}

function shipmentDraft(batch: OrderLineDetail['batches'][number], reportId: string): RecordDraft {
  const draft = shipDraft({ batchId: batch.id, plannedQty: batch.plannedQty, shippedQty: batch.shippedQty, today: businessToday() });
  const report = batch.shipments.find((row) => row.id === reportId && row.voidedAt === null && row.fulfillment?.kind === 'reported');
  if (report === undefined) return {
    ...draft,
    qty: 0,
    fulfillment: { kind: 'verified', unit: batch.fulfillment?.unit ?? null, evidence: '' },
  };
  return {
    ...draft,
    qty: report.qty,
    fulfillment: { kind: 'verified', unit: report.fulfillment?.unit ?? null, evidence: '', reportId: report.id },
  };
}

async function readWarehouses(
  setWarehouses: (rows: readonly { readonly id: string; readonly name: string }[]) => void,
  setServerError: (message: string) => void,
) {
  try {
    setWarehouses(await loadBatchReceivers());
  } catch {
    setWarehouses([]);
    setServerError('收货方没有读出来。');
  }
}

async function submit(input: {
  readonly draft: RecordDraft;
  readonly firstBatchOnly: boolean;
  readonly setServerError: (message: string) => void;
  readonly setPending: (isPending: boolean) => void;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  input.setPending(true);
  try {
    await postDraft(input.draft, input.firstBatchOnly);
    input.onClose();
    input.onReload();
  } catch (error) {
    if (isFirstBatchConflict(error)) {
      input.setServerError('首批次已存在。请关闭表单并核对现有批次。');
      input.onReload();
      return;
    }
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    input.setServerError(message);
  } finally {
    input.setPending(false);
  }
}

function isFirstBatchConflict(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') return false;
  const details = error.details;
  return typeof details === 'object' && details !== null && 'state' in details && details.state === 'first_batch.exists';
}

async function postDraft(draft: RecordDraft, firstBatchOnly: boolean): Promise<void> {
  if (draft.kind === 'ship') {
    if (draft.fulfillment === undefined) return;
    await postShipment(draft);
    return;
  }
  if (draft.kind === 'receipt') {
    if (draft.fulfillment === undefined) return;
    await postReceipt(draft);
    return;
  }
  if (draft.plannedQty === null) return;
  await postManualBatch({ lineId: draft.lineId, plannedQty: draft.plannedQty, receiverPartyId: draft.receiverPartyId, firstBatchOnly });
}
