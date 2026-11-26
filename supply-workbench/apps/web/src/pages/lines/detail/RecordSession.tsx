import { useEffect, useId, useRef, useState } from 'react';
import { Button, Drawer, Flex } from 'antd';
import type { OrderLineDetail } from '@sw/contracts';
import { ApiError } from '../../../shared/api/client.js';
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

type SaveError = { readonly message: string; readonly canRetry: boolean };

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
  const { serverError, setServerError, isPending, onSubmit, onClose } = useRecordSave(props);
  const formId = useId();
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
  return (
    <Drawer placement="right" size={drawerWidth} open onClose={onClose} title={draftTitle(draft)} footer={
      <Flex className="record-form-footer" justify="flex-end" gap="small">
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" htmlType="submit" form={formId} loading={isPending} disabled={isPending || serverError?.canRetry === false}>确认</Button>
      </Flex>
    }>
      <RecordForm id={formId} draft={draft} error={serverError?.message ?? ''} warehouses={warehouses}
        onSubmit={() => onSubmit(draft, isFirstBatch)} onChange={(next) => { setServerError(null); setDraft(next); }} />
    </Drawer>
  );
}

function useRecordSave(props: { readonly onClose: () => void; readonly onReload: () => void }) {
  const [serverError, setServerError] = useState<SaveError | null>(null);
  const [isPending, setPending] = useState(false);
  const isSaving = useRef(false);
  const isCurrent = useRef(true);
  useEffect(() => {
    isCurrent.current = true;
    return () => { isCurrent.current = false; };
  }, []);
  const onClose = () => {
    isCurrent.current = false;
    props.onClose();
  };
  const onSubmit = (draft: RecordDraft, firstBatchOnly: boolean) => {
    if (isSaving.current || serverError?.canRetry === false) return;
    isSaving.current = true;
    setServerError(null);
    setPending(true);
    void submit({ draft, firstBatchOnly, setServerError, onClose: () => {
      if (isCurrent.current) onClose();
    }, onReload: props.onReload }).finally(() => {
      isSaving.current = false;
      if (isCurrent.current) setPending(false);
    });
  };
  return { serverError, setServerError, isPending, onClose, onSubmit };
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
  setServerError: (error: SaveError) => void,
) {
  try {
    setWarehouses(await loadBatchReceivers());
  } catch {
    setWarehouses([]);
    setServerError({ message: '收货方没有读出来。请关闭表单并重新打开。', canRetry: false });
  }
}

async function submit(input: {
  readonly draft: RecordDraft;
  readonly firstBatchOnly: boolean;
  readonly setServerError: (error: SaveError) => void;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  try {
    await postDraft(input.draft, input.firstBatchOnly);
    input.onClose();
    input.onReload();
  } catch (error) {
    if (isFirstBatchConflict(error)) {
      input.setServerError({ message: '首批次已存在。请关闭表单并核对现有批次。', canRetry: false });
      input.onReload();
      return;
    }
    input.setServerError(saveErrorOf(error));
  }
}

function saveErrorOf(error: unknown): SaveError {
  if (error instanceof ApiError && error.code !== 'INTERNAL') {
    return { message: `${error.message}。请核对并修改后再确认。`, canRetry: false };
  }
  const message = error instanceof ApiError
    ? `${error.message}。已保留填写内容，可以重新确认。`
    : '暂未收到保存结果。请先核对现有记录，再重新确认。';
  return { message, canRetry: true };
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
