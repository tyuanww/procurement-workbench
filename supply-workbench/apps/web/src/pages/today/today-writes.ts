import { BatchViewSchema, ExceptionViewSchema, ReceiptViewSchema } from '@sw/contracts';
import { businessToday, postReceipt, postShipment } from '../../features/follow-up/index.js';
import { confirmedDateBody, formErrors, localFollowUpTime, saveTodayNote, type BoardItem, type NoteRef, type OpenForm, type Target, type Undo } from '../../features/today/index.js';
import { ApiError, apiDelete, apiSend } from '../../shared/api/client.js';
import { applyNextToday, type TodayLoad } from './today-load.js';

type TodayWriteState = Pick<TodayLoad, 'items' | 'targets' | 'noteRefs'> & {
  readonly drawerId: string | null;
  readonly draft: OpenForm | null;
  readonly undo: Undo | null;
  readonly setUndo: (undo: Undo | null) => void;
  readonly setSaving: (saving: boolean) => void;
  readonly setSaveError: (error: string) => void;
  readonly setNotice: (notice: string) => void;
  readonly refresh: () => Promise<boolean>;
};

type SubmitInput = {
  readonly state: TodayWriteState;
  readonly close: () => void;
  readonly onReminderChanged: (id: string) => Promise<boolean>;
};

export async function submitForm({ state, close, onReminderChanged }: SubmitInput): Promise<void> {
  const ready = readySubmit(state);
  if (ready === null) return;
  const errors = formErrors({ draft: ready.draft, hadDate: ready.target?.hadDate === true, today: businessToday() });
  if (errors.length > 0) {
    state.setNotice(errors.join('；'));
    return;
  }
  state.setSaving(true);
  state.setSaveError('');
  try {
    await writeDraft({ ready, state, close, onReminderChanged });
  } finally {
    state.setSaving(false);
  }
}

function readySubmit(state: TodayWriteState): SaveInput | null {
  const { drawerId: id, draft } = state;
  const row = id === null ? undefined : state.items.find((item) => item.id === id);
  if (id === null || draft === null || row === undefined) return null;
  const target = state.targets[id];
  const note = state.noteRefs[id];
  if (!canSubmit({ draft, target, note })) return null;
  return { draft, target, note, row };
}

async function writeDraft(input: SubmitInput & { readonly ready: SaveInput }): Promise<void> {
  const { ready, state, close, onReminderChanged } = input;
  try {
    const undo = await saveForm(ready);
    state.setUndo(undo);
    state.setNotice('');
    const { draft, target, row } = ready;
    if (draft.kind === 'note' && draft.nextFollowUpLocal !== undefined && draft.nextFollowUpLocal !== localFollowUpTime(target?.nextFollowUpAt)) {
      if (await onReminderChanged(row.id)) return;
    }
    await applyNextToday({ refresh: state.refresh, setNotice: state.setNotice, close });
  } catch (error) {
    const message = error instanceof ApiError
      ? `${error.message}。${error.code === 'INTERNAL' ? '已保留填写内容，可以重新确认。' : '请核对填写内容后再确认。'}`
      : '暂未收到保存结果。请先核对现有记录，再重新确认。';
    state.setSaveError(message);
  }
}

function canSubmit(input: { readonly draft: OpenForm; readonly target: Target | undefined; readonly note: NoteRef | undefined }): boolean {
  if (input.draft.kind === 'note') return input.target !== undefined || input.note !== undefined;
  return input.target !== undefined;
}

type SaveInput = {
  readonly draft: OpenForm;
  readonly target: Target | undefined;
  readonly note: NoteRef | undefined;
  readonly row: BoardItem;
};

async function saveForm(input: SaveInput): Promise<Undo> {
  if (input.draft.kind === 'receipt') return saveReceipt(input);
  if (input.draft.kind === 'ship') return saveShip(input);
  if (input.draft.kind === 'date') return saveDate(input);
  if (input.draft.kind === 'note') return saveNote(input);
  return saveException(input);
}

async function saveReceipt(input: SaveInput): Promise<Undo> {
  const { draft, target, row } = input;
  if (draft.kind !== 'receipt' || target === undefined) throw new Error('缺少批次');
  const saved = await postReceipt({ batchId: target.batchId, qty: draft.qty, receivedOn: draft.receivedOn, category: target.lane === 'finished' ? 'finished' : 'packaging', ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) });
  return { kind: 'receipt', id: saved.id, label: '已登记收货', row };
}

async function saveShip(input: SaveInput): Promise<Undo> {
  const { draft, target } = input;
  if (draft.kind !== 'ship' || target === undefined) throw new Error('缺少批次');
  const saved = await postShipment({ batchId: target.batchId, qty: draft.qty, shippedOn: draft.shippedOn, ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) });
  return { kind: 'ship', id: saved.id, label: '已登记发货' };
}

async function saveDate(input: SaveInput): Promise<Undo> {
  const { draft, target } = input;
  if (draft.kind !== 'date' || target === undefined) throw new Error('缺少批次');
  const body = confirmedDateBody({ hadDate: target.hadDate, date: draft.date, reason: draft.reason });
  await apiSend({ path: `/api/v1/batches/${encodeURIComponent(target.batchId)}`, method: 'PATCH', body, schema: BatchViewSchema });
  return { kind: 'date', batchId: target.batchId, previous: target.confirmedDate, label: '已改确认日' };
}

async function saveNote(input: SaveInput): Promise<Undo> {
  if (input.draft.kind !== 'note') throw new Error('缺少批次');
  const ids = input.target ?? input.note;
  if (ids === undefined) throw new Error('缺少批次');
  const saved = await saveTodayNote({ draft: input.draft, target: ids, nextFollowUpAt: input.target?.nextFollowUpAt });
  return { kind: 'note', id: saved.id, label: '已记跟进' };
}

async function saveException(input: SaveInput): Promise<Undo> {
  const { draft, target } = input;
  if (draft.kind !== 'exception' || target === undefined) throw new Error('缺少批次');
  const saved = await apiSend({ path: '/api/v1/exceptions', method: 'POST', body: { orderLineId: target.lineId, batchId: target.batchId, type: draft.type, note: draft.note.trim() }, schema: ExceptionViewSchema });
  return { kind: 'exception', id: saved.id, label: '已标异常' };
}

export async function restoreTodayWrite(state: TodayWriteState): Promise<void> {
  const undo = state.undo;
  if (undo === null) return;
  try {
    if (undo.kind === 'receipt') {
      await apiSend({ path: `/api/v1/receipts/${encodeURIComponent(undo.id)}/void`, method: 'POST', body: { reason: '撤销登记' }, schema: ReceiptViewSchema });
    } else if (undo.kind === 'date') {
      await apiSend({ path: `/api/v1/batches/${encodeURIComponent(undo.batchId)}`, method: 'PATCH', body: { dateBuyerConfirmed: undo.previous, reason: '撤销登记' }, schema: BatchViewSchema });
    } else {
      await apiDelete(deletePath(undo.kind, undo.id));
    }
    state.setUndo(null);
    state.setNotice('已撤销');
    await applyNextToday(state);
  } catch (error) {
    state.setNotice(error instanceof Error ? error.message : '撤销失败');
  }
}

function deletePath(kind: 'ship' | 'note' | 'exception', id: string): string {
  if (kind === 'ship') return `/api/v1/shipments/${encodeURIComponent(id)}`;
  if (kind === 'note') return `/api/v1/follow-ups/${encodeURIComponent(id)}`;
  return `/api/v1/exceptions/${encodeURIComponent(id)}`;
}
