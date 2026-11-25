import { useId } from 'react';
import { Alert, Form, Input, Select } from 'antd';
import { EXCEPTION_TYPE_LABELS, EXCEPTION_TYPES, FOLLOW_UP_KIND_LABELS, FOLLOW_UP_KINDS, type BatchFulfillment, type ExceptionType, type FollowUpKind, type ReceiptEvidenceInput, type ShipmentEvidenceInput } from '@sw/domain';
import { businessToday, dateChangeErrors, exceptionErrors, followUpErrors, receiptDefaults, receiptErrors, shipmentDefaults, shipmentErrors, RecordForm, type RecordDraft } from '../../features/follow-up/index.js';
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

export function ActionForm(props: {
  readonly draft: OpenForm;
  readonly hadDate: boolean;
  readonly lane: 'finished' | 'material';
  readonly onChange: (draft: OpenForm) => void;
  readonly onSubmit: () => void;
}) {
  const errors = formErrors({ draft: props.draft, hadDate: props.hadDate, today: businessToday() });
  const record = recordOf({ draft: props.draft, lane: props.lane });
  if (record !== null) {
    return (
      <>
        <RecordForm draft={record} error={errors.join('；')} warehouses={[]} onChange={(next) => props.onChange(openOf(next))} />
      </>
    );
  }
  return (
    <Form layout="vertical">
      {errors.length === 0 ? null : <Alert style={{ marginBottom: 16 }} type="error" showIcon title={errors.join('；')} />}
      {props.draft.kind === 'receipt' ? <Alert type="info" showIcon title="工作台登记，不等于 SRM 收货" /> : null}
      <FormFields draft={props.draft} onChange={props.onChange} />
    </Form>
  );
}

function FormFields(props: { readonly draft: OpenForm; readonly onChange: (draft: OpenForm) => void }) {
  const draft = props.draft;
  if (draft.kind === 'date') return <DateFields draft={draft} onChange={props.onChange} />;
  if (draft.kind === 'ship' || draft.kind === 'receipt') return null;
  if (draft.kind === 'note') return <NoteFields draft={draft} onChange={props.onChange} />;
  return <ExceptionFields draft={draft} onChange={props.onChange} />;
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
  if (draft.kind === 'receipt') return evidenceErrors(draft.fulfillment, receiptErrors({ qty: draft.qty, receivedOn: draft.receivedOn, today }));
  if (draft.kind === 'ship') return evidenceErrors(draft.fulfillment, shipmentErrors({ qty: draft.qty, shippedOn: draft.shippedOn, today }));
  if (draft.kind === 'date') return draft.date === '' ? ['请填写确认日'] : dateChangeErrors({ isFirst: !hadDate, reason: draft.reason });
  if (draft.kind === 'note') {
    const errors = followUpErrors({ text: draft.text });
    const local = draft.nextFollowUpLocal;
    return local === undefined || local === '' || followUpInstant(local) !== null ? errors : [...errors, '请选择有效的业务日期和时间'];
  }
  return exceptionErrors({ note: draft.note });
}

function evidenceErrors(facts: ShipmentEvidenceInput | ReceiptEvidenceInput | undefined, errors: string[]): string[] {
  return facts?.evidence.trim() === '' ? [...errors, '填写可回查的依据'] : errors;
}

function recordOf(input: { readonly draft: OpenForm; readonly lane: 'finished' | 'material' }): RecordDraft | null {
  if (input.draft.kind === 'ship') return { ...input.draft, batchId: '' };
  if (input.draft.kind === 'receipt') {
    return {
      ...input.draft,
      batchId: '',
      category: input.lane === 'finished' ? 'finished' : 'packaging',
    };
  }
  return null;
}

function openOf(draft: RecordDraft): OpenForm {
  if (draft.kind === 'ship') return { kind: 'ship', qty: draft.qty, shippedOn: draft.shippedOn, ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) };
  if (draft.kind === 'receipt') return { kind: 'receipt', qty: draft.qty, receivedOn: draft.receivedOn, ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) };
  throw new Error('今日不在这里新增批次');
}

function DateFields(props: { readonly draft: Extract<OpenForm, { readonly kind: 'date' }>; readonly onChange: (draft: OpenForm) => void }) {
  return (
    <>
      <Form.Item label="确认日">
        <Input aria-label="确认日" value={props.draft.date} onChange={(event) => props.onChange({ ...props.draft, date: event.target.value })} />
      </Form.Item>
      <Form.Item label="原因">
        <Input aria-label="原因" value={props.draft.reason} onChange={(event) => props.onChange({ ...props.draft, reason: event.target.value })} />
      </Form.Item>
    </>
  );
}

function NoteFields(props: { readonly draft: Extract<OpenForm, { readonly kind: 'note' }>; readonly onChange: (draft: OpenForm) => void }) {
  const reminderId = useId();
  const hintId = useId();
  return (
    <>
      <Form.Item label="类型">
        <Select
          aria-label="类型"
          value={props.draft.followKind}
          options={FOLLOW_UP_KINDS.map((kind) => ({ value: kind, label: FOLLOW_UP_KIND_LABELS[kind] }))}
          onChange={(followKind) => props.onChange({ ...props.draft, followKind: followKindOf(followKind) })}
        />
      </Form.Item>
      <Form.Item label="内容">
        <Input aria-label="内容" value={props.draft.text} onChange={(event) => props.onChange({ ...props.draft, text: event.target.value })} />
      </Form.Item>
      {props.draft.nextFollowUpLocal === undefined ? null : <Form.Item label="下次跟进时间（选填）" htmlFor={reminderId}
        extra={<span id={hintId}>工作台时区 {businessTimeZone()}。清空时间可取消本批次提醒。</span>}>
        <Input id={reminderId} name="nextFollowUpAt" aria-describedby={hintId} type="datetime-local" value={props.draft.nextFollowUpLocal}
          onChange={(event) => props.onChange({ ...props.draft, nextFollowUpLocal: event.target.value })} />
      </Form.Item>}
    </>
  );
}

function ExceptionFields(props: { readonly draft: Extract<OpenForm, { readonly kind: 'exception' }>; readonly onChange: (draft: OpenForm) => void }) {
  return (
    <>
      <Form.Item label="类型">
        <Select
          aria-label="类型"
          value={props.draft.type}
          options={EXCEPTION_TYPES.map((type) => ({ value: type, label: EXCEPTION_TYPE_LABELS[type] }))}
          onChange={(type) => props.onChange({ ...props.draft, type: exceptionTypeOf(type) })}
        />
      </Form.Item>
      <Form.Item label="说明">
        <Input aria-label="说明" value={props.draft.note} onChange={(event) => props.onChange({ ...props.draft, note: event.target.value })} />
      </Form.Item>
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
