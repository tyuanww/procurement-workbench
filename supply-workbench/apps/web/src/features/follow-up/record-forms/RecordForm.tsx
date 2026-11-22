import { Alert, Form, Input, InputNumber, Select } from 'antd';
import type { ReceiptDisposition, ReceiptEvidenceInput, ShipmentEvidenceInput } from '@sw/domain';
import { businessToday } from './defaults.js';
import { recordError, type ReceiptDraft, type RecordDraft, type ShipDraft } from './drafts.js';

export function RecordForm(props: {
  readonly draft: RecordDraft;
  readonly error: string;
  readonly warehouses: readonly { readonly id: string; readonly name: string }[];
  readonly onChange: (draft: RecordDraft) => void;
}) {
  const message = props.error !== '' ? props.error : recordError(props.draft, businessToday());
  return (
    <Form layout="vertical">
      {message === '' ? null : <Alert type="error" title={message} />}
      <RecordFields draft={props.draft} warehouses={props.warehouses} onChange={props.onChange} />
    </Form>
  );
}

function RecordFields(props: {
  readonly draft: RecordDraft;
  readonly warehouses: readonly { readonly id: string; readonly name: string }[];
  readonly onChange: (draft: RecordDraft) => void;
}) {
  const draft = props.draft;
  if (draft.kind === 'ship') return <ShipmentFields draft={draft} onChange={props.onChange} />;
  if (draft.kind === 'receipt') return <ReceiptFields draft={draft} onChange={props.onChange} />;
  return <CreateFields draft={draft} warehouses={props.warehouses} onChange={props.onChange} />;
}

function ShipmentFields({ draft, onChange }: { readonly draft: ShipDraft; readonly onChange: (draft: ShipDraft) => void }) {
  const facts = draft.fulfillment;
  const isReported = facts?.kind === 'reported';
  const canSwitch = facts !== undefined && (facts.kind !== 'verified' || facts.reportId === undefined);
  return (
    <>
      {canSwitch ? <Form.Item label="发货记录类型"><Select<ShipmentEvidenceInput['kind']> aria-label="发货记录类型" value={facts.kind}
        options={[{ value: 'verified', label: '核实实发' }, { value: 'reported', label: '工厂报发待核' }]}
        onChange={(kind) => onChange({ ...draft, fulfillment: { kind, unit: facts.unit, evidence: '' } })} /></Form.Item> : null}
      <QtyDate label={isReported ? '报发日期' : '发货日'} qty={draft.qty} date={draft.shippedOn} onQty={(qty) => onChange({ ...draft, qty })} onDate={(shippedOn) => onChange({ ...draft, shippedOn })} />
      {facts === undefined ? null : <EvidenceFields facts={facts} label={isReported ? '工厂报发来源' : '交运依据'} onChange={(patch) => onChange({ ...draft, fulfillment: { ...facts, ...patch } })} />}
    </>
  );
}

const dispositions = [
  { value: 'normal', label: '正常入库' },
  { value: 'rework', label: '返工待核' },
  { value: 'return', label: '退回待核' },
] satisfies ReadonlyArray<{ value: ReceiptDisposition; label: string }>;

function ReceiptFields({ draft, onChange }: { readonly draft: ReceiptDraft; readonly onChange: (draft: ReceiptDraft) => void }) {
  const facts = draft.fulfillment;
  return (
    <>
      <QtyDate label="收货日" qty={draft.qty} date={draft.receivedOn} onQty={(qty) => onChange({ ...draft, qty })} onDate={(receivedOn) => onChange({ ...draft, receivedOn })} />
      {facts === undefined ? null : <>
        <Form.Item label="收货处置"><Select<ReceiptDisposition> aria-label="收货处置" value={facts.disposition} options={dispositions}
          onChange={(disposition) => onChange({ ...draft, fulfillment: { ...facts, disposition } })} /></Form.Item>
        <EvidenceFields facts={facts} label="收货及归批依据" onChange={(patch) => onChange({ ...draft, fulfillment: { ...facts, ...patch } })} />
      </>}
    </>
  );
}

type EvidenceFields = Pick<ReceiptEvidenceInput, 'unit' | 'evidence'>;

function EvidenceFields({ facts, label, onChange }: { readonly facts: EvidenceFields; readonly label: string; readonly onChange: (patch: Partial<EvidenceFields>) => void }) {
  return <>
    <Form.Item label="数量单位" extra="单位缺失或与批次计划不同的记录需要核对">
      <Input aria-label="数量单位" value={facts.unit ?? ''} maxLength={64} onChange={(event) => onChange({ unit: event.target.value })} />
    </Form.Item>
    <Form.Item label={label}>
      <Input aria-label={label} value={facts.evidence} maxLength={1000} onChange={(event) => onChange({ evidence: event.target.value })} />
    </Form.Item>
  </>;
}

function QtyDate(props: {
  readonly label: string;
  readonly qty: number;
  readonly date: string;
  readonly onQty: (qty: number) => void;
  readonly onDate: (date: string) => void;
}) {
  return (
    <>
      <Form.Item label="数量" style={{ marginBottom: 16 }}>
        <InputNumber aria-label="数量" value={props.qty} onChange={(value) => props.onQty(numberOf(value))} />
      </Form.Item>
      <Form.Item label={props.label} style={{ marginBottom: 16 }}>
        <Input aria-label={props.label} value={props.date} onChange={(event) => props.onDate(event.target.value)} />
      </Form.Item>
    </>
  );
}

function CreateFields(props: {
  readonly draft: Extract<RecordDraft, { readonly kind: 'create' }>;
  readonly warehouses: readonly { readonly id: string; readonly name: string }[];
  readonly onChange: (draft: RecordDraft) => void;
}) {
  return (
    <>
      <Form.Item label="计划数量" style={{ marginBottom: 16 }}>
        <InputNumber aria-label="计划数量" value={props.draft.plannedQty} onChange={(value) => props.onChange({ ...props.draft, plannedQty: optionalNumber(value) })} />
      </Form.Item>
      <Form.Item label="收货方" style={{ marginBottom: 16 }}>
        <Select
          aria-label="收货方"
          placeholder="选择收货方"
          showSearch={{ optionFilterProp: 'label' }}
          style={{ width: 160 }}
          value={props.draft.receiverPartyId === '' ? null : props.draft.receiverPartyId}
          options={props.warehouses.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(receiverPartyId) => props.onChange({ ...props.draft, receiverPartyId })}
        />
      </Form.Item>
    </>
  );
}

function numberOf(value: number | string | null): number {
  if (typeof value === 'number') return value;
  return 0;
}

function optionalNumber(value: number | string | null): number | null {
  if (typeof value === 'number') return value;
  return null;
}
