import { Input, InputNumber, Select } from 'antd';
import type { ReceiptDisposition, ReceiptEvidenceInput, ShipmentEvidenceInput } from '@sw/domain';
import { businessToday } from './defaults.js';
import { recordFieldErrors, type RecordDraft } from './drafts.js';
import { RecordField, RecordFormLayout } from './RecordFields.js';

type Errors = ReturnType<typeof recordFieldErrors>;
type RecordFormProps = {
  readonly id: string;
  readonly draft: RecordDraft;
  readonly error: string;
  readonly warehouses: readonly { readonly id: string; readonly name: string }[];
  readonly onChange: (draft: RecordDraft) => void;
  readonly onSubmit: () => void;
};

export function RecordForm(props: RecordFormProps) {
  const errors = recordFieldErrors(props.draft, businessToday());
  return (
    <RecordFormLayout id={props.id} invalid={Object.values(errors).some(Boolean)} error={props.error} onSubmit={props.onSubmit}>
      <RecordFields draft={props.draft} warehouses={props.warehouses} errors={errors} onChange={props.onChange} />
    </RecordFormLayout>
  );
}

type Change<T extends RecordDraft> = { readonly draft: T; readonly errors: Errors; readonly onChange: (draft: RecordDraft) => void };

function RecordFields({ draft, warehouses, errors, onChange }: Change<RecordDraft> & Pick<RecordFormProps, 'warehouses'>) {
  if (draft.kind === 'ship') return <ShipmentFields draft={draft} errors={errors} onChange={onChange} />;
  if (draft.kind === 'receipt') return <ReceiptFields draft={draft} errors={errors} onChange={onChange} />;
  return <CreateFields draft={draft} warehouses={warehouses} errors={errors} onChange={onChange} />;
}

function ShipmentFields({ draft, errors, onChange }: Change<Extract<RecordDraft, { kind: 'ship' }>>) {
  const facts = draft.fulfillment;
  const isReported = facts?.kind === 'reported';
  const canSwitch = facts !== undefined && (facts.kind !== 'verified' || facts.reportId === undefined);
  return (
    <>
      {canSwitch ? <RecordField label="发货记录类型">{(control) => <Select<ShipmentEvidenceInput['kind']> {...control} value={facts.kind}
        options={[{ value: 'verified', label: '核实实发' }, { value: 'reported', label: '工厂报发待核' }]}
        onChange={(kind) => onChange({ ...draft, fulfillment: { kind, unit: facts.unit, evidence: '' } })} />}</RecordField> : null}
      <QtyDate label={isReported ? '报发日期' : '发货日'} errors={errors} qty={draft.qty} date={draft.shippedOn} onQty={(qty) => onChange({ ...draft, qty })} onDate={(shippedOn) => onChange({ ...draft, shippedOn })} />
      {facts === undefined ? null : <EvidenceFields facts={facts} error={errors.evidence} label={isReported ? '工厂报发来源' : '交运依据'}
        onChange={(patch) => onChange({ ...draft, fulfillment: { ...facts, ...patch } })} />}
    </>
  );
}

const dispositions = [
  { value: 'normal', label: '正常入库' },
  { value: 'rework', label: '返工待核' },
  { value: 'return', label: '退回待核' },
] satisfies ReadonlyArray<{ value: ReceiptDisposition; label: string }>;

function ReceiptFields({ draft, errors, onChange }: Change<Extract<RecordDraft, { kind: 'receipt' }>>) {
  const facts = draft.fulfillment;
  return (
    <>
      <QtyDate label="收货日" errors={errors} qty={draft.qty} date={draft.receivedOn} onQty={(qty) => onChange({ ...draft, qty })} onDate={(receivedOn) => onChange({ ...draft, receivedOn })} />
      {facts === undefined ? null : <>
        <RecordField label="收货处置">{(control) => <Select<ReceiptDisposition> {...control} value={facts.disposition} options={dispositions}
          onChange={(disposition) => onChange({ ...draft, fulfillment: { ...facts, disposition } })} />}</RecordField>
        <EvidenceFields facts={facts} error={errors.evidence} label="收货及归批依据" onChange={(patch) => onChange({ ...draft, fulfillment: { ...facts, ...patch } })} />
      </>}
    </>
  );
}

type Evidence = Pick<ReceiptEvidenceInput, 'unit' | 'evidence'>;

function EvidenceFields({ facts, label, error, onChange }: { readonly facts: Evidence; readonly label: string; readonly error: string | undefined; readonly onChange: (patch: Partial<Evidence>) => void }) {
  return <>
    <RecordField label="数量单位" hint="单位缺失或与批次计划不同的记录需要核对">
      {(control) => <Input {...control} value={facts.unit ?? ''} maxLength={64} onChange={(event) => onChange({ unit: event.target.value })} />}
    </RecordField>
    <RecordField label={label} required error={error}>
      {(control) => <Input {...control} value={facts.evidence} maxLength={1000} onChange={(event) => onChange({ evidence: event.target.value })} />}
    </RecordField>
  </>;
}

function QtyDate(props: {
  readonly label: string;
  readonly errors: Errors;
  readonly qty: number;
  readonly date: string;
  readonly onQty: (qty: number) => void;
  readonly onDate: (date: string) => void;
}) {
  return (
    <>
      <RecordField label="数量" required error={props.errors.qty}>
        {(control) => <InputNumber {...control} value={props.qty} onChange={(value) => props.onQty(optionalNumber(value) ?? 0)} />}
      </RecordField>
      <RecordField label={props.label} required error={props.errors.date}>
        {(control) => <Input {...control} placeholder="YYYY-MM-DD" value={props.date} onChange={(event) => props.onDate(event.target.value)} />}
      </RecordField>
    </>
  );
}

function CreateFields({ draft, warehouses, errors, onChange }: Change<Extract<RecordDraft, { kind: 'create' }>> & Pick<RecordFormProps, 'warehouses'>) {
  return (
    <>
      <RecordField label="计划数量" required error={errors.qty}>
        {(control) => <InputNumber {...control} value={draft.plannedQty} onChange={(value) => onChange({ ...draft, plannedQty: optionalNumber(value) })} />}
      </RecordField>
      <RecordField label="收货方" required error={errors.receiver}>
        {(control) => <Select
          {...control}
          placeholder="选择收货方"
          showSearch={{ optionFilterProp: 'label' }}
          value={draft.receiverPartyId === '' ? null : draft.receiverPartyId}
          options={warehouses.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(receiverPartyId) => onChange({ ...draft, receiverPartyId })}
        />}
      </RecordField>
    </>
  );
}

function optionalNumber(value: number | string | null): number | null {
  return typeof value === 'number' ? value : null;
}
