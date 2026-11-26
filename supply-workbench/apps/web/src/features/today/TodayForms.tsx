import { Input, Select } from 'antd';
import { EXCEPTION_TYPE_LABELS, EXCEPTION_TYPES, FOLLOW_UP_KIND_LABELS, FOLLOW_UP_KINDS, type BatchFulfillment, type ExceptionType, type FollowUpKind, type ReceiptEvidenceInput, type ShipmentEvidenceInput } from '@sw/domain';
import { businessDateError, businessToday, dateChangeErrors, exceptionErrors, followUpErrors, receiptDefaults, shipmentDefaults, recordFieldErrors, RecordField, RecordForm, RecordFormLayout, type RecordDraft } from '../../features/follow-up/index.js';
import { businessTimeZone } from '../../shared/business-time-zone.js';
import { followUpInstant, localFollowUpTime } from './follow-up-time.js';
import type { BoardItem } from './model/types.js';

export type NoteRef = {
  readonly lineId: string;
  readonly batchId: string;
};

export type Target = {
  readonly batchId: string;
  readonly batchSeq?: number;
  readonly lineId: string;
  readonly plannedQty: number;
  readonly receivedQty: number;
  readonly shippedQty: number;
  readonly lane: 'finished' | 'material';
  readonly hadDate: boolean;
  readonly confirmedDate: string | null;
  readonly fulfillment?: BatchFulfillment;
  readonly canScheduleFollowUp?: boolean;
  readonly nextFollowUpAt?: string;
};
export type OpenForm =
  | { readonly kind: 'receipt'; readonly qty: number; readonly receivedOn: string; readonly fulfillment?: ReceiptEvidenceInput }
  | { readonly kind: 'ship'; readonly qty: number; readonly shippedOn: string; readonly fulfillment?: ShipmentEvidenceInput }
  | { readonly kind: 'date'; readonly date: string; readonly reason: string }
  | { readonly kind: 'note'; readonly text: string; readonly followKind: FollowUpKind; readonly nextFollowUpLocal?: string }
  | { readonly kind: 'exception'; readonly note: string; readonly type: ExceptionType };
export type Undo =
  | { readonly kind: 'receipt'; readonly id: string; readonly label: string; readonly row: BoardItem }
  | { readonly kind: 'ship' | 'note' | 'exception'; readonly id: string; readonly label: string }
  | { readonly kind: 'date'; readonly batchId: string; readonly previous: string | null; readonly label: string };

type SimpleDraft = Exclude<OpenForm, { kind: 'ship' | 'receipt' }>;

export function ActionForm(props: {
  readonly id: string;
  readonly draft: OpenForm;
  readonly hadDate: boolean;
  readonly lane: 'finished' | 'material';
  readonly onChange: (draft: OpenForm) => void;
  readonly onSubmit: () => void;
}) {
  const { draft } = props;
  if (draft.kind === 'ship' || draft.kind === 'receipt') {
    const record: RecordDraft = draft.kind === 'ship' ? { ...draft, batchId: '' } : {
      ...draft, batchId: '', category: props.lane === 'finished' ? 'finished' : 'packaging',
    };
    return <RecordForm id={props.id} draft={record} error="" warehouses={[]} onChange={(next) => props.onChange(openOf(next))} onSubmit={props.onSubmit} />;
  }

  return (
    <RecordFormLayout id={props.id} invalid={Object.values(simpleFieldErrors(draft, props.hadDate)).some(Boolean)} onSubmit={props.onSubmit}>
      {draft.kind === 'date' ? <DateFields draft={draft} hadDate={props.hadDate} onChange={props.onChange} /> : null}
      {draft.kind === 'note' ? <NoteFields draft={draft} onChange={props.onChange} /> : null}
      {draft.kind === 'exception' ? <ExceptionFields draft={draft} onChange={props.onChange} /> : null}
    </RecordFormLayout>
  );
}

export function openDraft(input: { readonly id: string; readonly kind: OpenForm['kind']; readonly targets: Readonly<Record<string, Target>>; readonly setFocus: (id: string) => void; readonly setDraft: (draft: OpenForm | null) => void }): void {
  const { id, kind, targets, setFocus, setDraft } = input;
  const target = targets[id];
  if (target === undefined) return;
  setFocus(id);
  setDraft(draftFor({ kind, target, today: businessToday() }));
}

function draftFor({ kind, target, today }: { readonly kind: OpenForm['kind']; readonly target: Target; readonly today: string }): OpenForm {
  if (kind === 'receipt') {
    const defaults = receiptDefaults({ plannedQty: target.plannedQty, receivedQty: target.receivedQty, today, lane: target.lane });
    const facts = target.fulfillment;
    if (facts === undefined) return { kind, qty: defaults.qty, receivedOn: defaults.receivedOn };
    return { kind, qty: facts.inTransitQty ?? 0, receivedOn: defaults.receivedOn, fulfillment: { kind: 'received', unit: facts.unit, evidence: '', disposition: 'normal' } };
  }
  if (kind === 'ship') {
    const defaults = shipmentDefaults({ plannedQty: target.plannedQty, shippedQty: target.shippedQty, today });
    const facts = target.fulfillment;
    if (facts === undefined) return { kind, qty: defaults.qty, shippedOn: defaults.shippedOn };
    return { kind, qty: facts.unshippedQty ?? 0, shippedOn: defaults.shippedOn, fulfillment: { kind: 'verified', unit: facts.unit, evidence: '' } };
  }
  if (kind === 'date') return { kind, date: target.confirmedDate ?? today, reason: '' };
  if (kind === 'note') return noteDraft(target);
  return { kind, note: '', type: 'delay' };
}

export function noteDraft(target: Pick<Target, 'canScheduleFollowUp' | 'nextFollowUpAt'>): Extract<OpenForm, { readonly kind: 'note' }> {
  return {
    kind: 'note', text: '', followKind: 'call',
    ...(target.canScheduleFollowUp === true ? { nextFollowUpLocal: localFollowUpTime(target.nextFollowUpAt) } : {}),
  };
}

export function confirmedDateBody(input: { readonly hadDate: boolean; readonly date: string; readonly reason: string }): { readonly dateBuyerConfirmed: string; readonly reason?: string } {
  if (!input.hadDate) return { dateBuyerConfirmed: input.date };
  return { dateBuyerConfirmed: input.date, reason: input.reason };
}

export function formErrors({ draft, hadDate, today }: { readonly draft: OpenForm; readonly hadDate: boolean; readonly today: string }): string[] {
  const errors = draft.kind === 'receipt' || draft.kind === 'ship' ? recordFieldErrors(draft, today) : simpleFieldErrors(draft, hadDate);
  return Object.values(errors).filter((error) => error !== undefined);
}

function simpleFieldErrors(draft: SimpleDraft, hadDate: boolean) {
  if (draft.kind === 'date') return { date: businessDateError(draft.date, '确认日'), reason: dateChangeErrors({ isFirst: !hadDate, reason: draft.reason })[0] };
  if (draft.kind === 'note') {
    const local = draft.nextFollowUpLocal;
    return {
      text: followUpErrors({ text: draft.text })[0],
      time: local === undefined || local === '' || followUpInstant(local) !== null ? undefined : '请选择有效的业务日期和时间',
    };
  }
  return { note: exceptionErrors({ note: draft.note })[0] };
}

function openOf(draft: RecordDraft): OpenForm {
  if (draft.kind === 'ship') return { kind: 'ship', qty: draft.qty, shippedOn: draft.shippedOn, ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) };
  if (draft.kind === 'receipt') return { kind: 'receipt', qty: draft.qty, receivedOn: draft.receivedOn, ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) };
  throw new Error('今日不在这里新增批次');
}

type Fields<T extends SimpleDraft> = { readonly draft: T; readonly onChange: (draft: OpenForm) => void };

function DateFields({ draft, hadDate, onChange }: Fields<Extract<OpenForm, { kind: 'date' }>> & { readonly hadDate: boolean }) {
  const errors = simpleFieldErrors(draft, hadDate);
  return (
    <>
      <RecordField label="确认日" required error={errors.date}>
        {(control) => <Input {...control} placeholder="YYYY-MM-DD" value={draft.date} onChange={(event) => onChange({ ...draft, date: event.target.value })} />}
      </RecordField>
      <RecordField label="原因" required={hadDate} error={errors.reason}>
        {(control) => <Input {...control} value={draft.reason} onChange={(event) => onChange({ ...draft, reason: event.target.value })} />}
      </RecordField>
    </>
  );
}

function NoteFields({ draft, onChange }: Fields<Extract<OpenForm, { kind: 'note' }>>) {
  const errors = simpleFieldErrors(draft, false);
  return (
    <>
      <RecordField label="类型">{(control) => <Select
        {...control}
        value={draft.followKind}
        options={FOLLOW_UP_KINDS.map((kind) => ({ value: kind, label: FOLLOW_UP_KIND_LABELS[kind] }))}
        onChange={(followKind) => onChange({ ...draft, followKind: followKindOf(followKind) })}
      />}</RecordField>
      <RecordField label="内容" required error={errors.text}>
        {(control) => <Input.TextArea {...control} rows={2} value={draft.text} onChange={(event) => onChange({ ...draft, text: event.target.value })} />}
      </RecordField>
      {draft.nextFollowUpLocal === undefined ? null : <RecordField label="下次跟进时间（选填）" error={errors.time}
        hint={`工作台时区 ${businessTimeZone()}。清空时间可取消本批次提醒。`}>
        {(control) => <Input {...control} name="nextFollowUpAt" type="datetime-local" value={draft.nextFollowUpLocal}
          onChange={(event) => onChange({ ...draft, nextFollowUpLocal: event.target.value })} />}
      </RecordField>}
    </>
  );
}

function ExceptionFields({ draft, onChange }: Fields<Extract<OpenForm, { kind: 'exception' }>>) {
  return (
    <>
      <RecordField label="类型">{(control) => <Select
        {...control}
        value={draft.type}
        options={EXCEPTION_TYPES.map((type) => ({ value: type, label: EXCEPTION_TYPE_LABELS[type] }))}
        onChange={(type) => onChange({ ...draft, type: exceptionTypeOf(type) })}
      />}</RecordField>
      <RecordField label="说明" required error={simpleFieldErrors(draft, false).note}>
        {(control) => <Input {...control} value={draft.note} onChange={(event) => onChange({ ...draft, note: event.target.value })} />}
      </RecordField>
    </>
  );
}

function followKindOf(value: string): FollowUpKind {
  const found = FOLLOW_UP_KINDS.find((kind) => kind === value);
  return found ?? 'call';
}

function exceptionTypeOf(value: string): ExceptionType {
  const found = EXCEPTION_TYPES.find((type) => type === value);
  return found ?? 'delay';
}
