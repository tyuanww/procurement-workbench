import { Button, Card, Checkbox, Flex, Form, Input, InputNumber, Select, Typography, type CheckboxChangeEvent, type FormItemProps } from 'antd';
import { RegisterArrivalSchema, ReviseArrivalSchema, type Arrival, type ArrivalCandidate, type RegisterArrivalInput, type ReviseArrivalInput } from '@sw/contracts';
import { RECEIPT_CATEGORIES, receiptCategoryLabel } from '@sw/domain';
import { businessToday } from '../../../features/follow-up/index.js';

export type Warehouse = { readonly id: string; readonly displayName: string };
const required = [{ required: true, message: '请填写此项' }];

export function RegisterArrivalForm({ warehouses, isSaving, onSubmit, onInvalid }: {
  readonly warehouses: readonly Warehouse[];
  readonly isSaving: boolean;
  readonly onSubmit: (body: RegisterArrivalInput) => void;
  readonly onInvalid: () => void;
}) {
  return <Form layout="vertical" initialValues={{ source: { kind: 'document' }, receivedOn: businessToday() }}
    onFinish={(values: unknown) => {
      const result = RegisterArrivalSchema.safeParse(values);
      if (result.success) onSubmit(result.data);
      else onInvalid();
    }}>
    <Form.Item label="来源类别" name={['source', 'kind']} rules={required}>
      <Select options={[{ label: '运输或收货单据', value: 'document' }, { label: '采购台账', value: 'ledger' }]} />
    </Form.Item>
    <TextField label="来源系统或台账名称" name={['source', 'source']} />
    <TextField label="单据号或台账版本" name={['source', 'number']} />
    <TextField label="明细行号或台账位序" name={['source', 'row']} />
    <Form.Item label="到仓仓库" name="warehouseId" rules={required}>
      <Select options={warehouses.map((row) => ({ label: row.displayName, value: row.id }))} />
    </Form.Item>
    <Form.Item label="到仓日期" name="receivedOn" rules={required}><Input type="date" max={businessToday()} /></Form.Item>
    <TextField label="完整商品码" name="itemCode" />
    <QuantityField label="原数量" name="qty" />
    <TextField label="原单位" name="unit" maxLength={64} />
    <Button htmlType="submit" type="primary" loading={isSaving}>登记到仓</Button>
  </Form>;
}

export function AllocateArrivalForm({ arrival, candidates, isSaving, onSubmit, onInvalid }: {
  readonly arrival: Arrival;
  readonly candidates: readonly ArrivalCandidate[];
  readonly isSaving: boolean;
  readonly onSubmit: (body: ReviseArrivalInput) => void;
  readonly onInvalid: () => void;
}) {
  const prior = arrival.allocation;
  const options = candidates.flatMap((row) => row.batch?.canAllocate === true
    ? [{
      label: `${row.poNumber ?? '无 PO'} · ${arrivalCandidateSource(row)} · 批次 ${row.batch.seq} · 确认到仓 ${row.batch.confirmedOn ?? '—'} · 计划 ${row.batch.plannedQty} ${row.batch.unit ?? ''}`,
      value: row.batch.id,
      lineId: row.lineId,
      needsLineId: row.needsLineConfirmation,
    }]
    : []);
  return <Form layout="vertical" initialValues={{
    count: prior?.count ?? { document: { kind: 'document' }, conversionEvidence: null },
    allocations: prior?.rows.map(({ batchId, poNumber, poLine, evidence, qty, category }) => ({ batchId, poNumber, poLine, evidence, qty, category })) ?? [{}],
  }} onFinish={(values: Record<string, unknown>) => {
    const result = ReviseArrivalSchema.safeParse({ kind: 'allocate', expectedRevision: arrival.revision, reason: null, ...values });
    if (result.success) onSubmit(result.data);
    else onInvalid();
  }}>
    <Typography.Paragraph type="secondary">填写经仓库确认可入账的有效实收量。破损、返工和退回沿用批次详情的履约与异常入口。</Typography.Paragraph>
    <WarehouseCountFields />
    <AllocationFields options={options} />
    {prior === null ? null : <TextField label="更正原因" name="reason" maxLength={500} />}
    <Button htmlType="submit" type="primary" loading={isSaving} disabled={options.length === 0} style={{ marginTop: 16 }}>
      {prior === null ? '确认凭据并归单' : '保存更正'}
    </Button>
  </Form>;
}

export function arrivalCandidateSource({ lineId, source }: ArrivalCandidate): string {
  const origin = source === null ? '' : `${source.sheet} 第 ${source.rowNo} 行 · `;
  return `${origin}订单行 ${lineId}`;
}

type BatchOption = { readonly label: string; readonly value: string; readonly lineId: ArrivalCandidate['lineId']; readonly needsLineId: boolean };

function AllocationFields({ options }: { readonly options: readonly BatchOption[] }) {
  const form = Form.useFormInstance();
  return <Form.List name="allocations">
      {(fields, { add, remove }) => <Flex vertical gap={12}>
        {fields.map(({ key, name }, index) => <Card key={key} size="small" title={`分配 ${index + 1}`} extra={fields.length > 1 ? <Button type="link" onClick={() => remove(name)}>移除</Button> : null}>
          <Form.Item label="要货批次" name={[name, 'batchId']} rules={required}>
            <Select options={[...options]} showSearch={{ optionFilterProp: 'label' }}
              onChange={() => form.setFieldValue(['allocations', name, 'targetLineId'], undefined)} />
          </Form.Item>
          <TextField label="凭据上的原 PO 号" name={[name, 'poNumber']} />
          <TextField label="PO 明细行标识" name={[name, 'poLine']} />
          <Form.Item noStyle dependencies={[['allocations', name, 'batchId']]}>
            {({ getFieldValue }) => {
              const batchId = getFieldValue(['allocations', name, 'batchId']);
              const selected = options.find((option) => option.value === batchId);
              if (selected?.needsLineId !== true) return null;
              return <Form.Item name={[name, 'targetLineId']} preserve={false}
                getValueProps={(value: unknown) => ({ checked: value === selected.lineId })}
                getValueFromEvent={({ target }: CheckboxChangeEvent) => target.checked ? selected.lineId : undefined}
                rules={[{ required: true, message: '请确认已核对所选订单行' }]}
                extra="打开上方候选详情，与原 PO 明细核对。无法确认时保留待归单。">
                <Checkbox style={{ minHeight: 44 }}>已按原 PO 明细核对所选订单行</Checkbox>
              </Form.Item>;
            }}
          </Form.Item>
          <TextField label="逐行归批依据" name={[name, 'evidence']} maxLength={500} />
          <QuantityField label="本批实收量" name={[name, 'qty']} />
          <Form.Item label="收货分类" name={[name, 'category']} rules={required}>
            <Select options={RECEIPT_CATEGORIES.map((value) => ({ value, label: receiptCategoryLabel(value) }))} />
          </Form.Item>
        </Card>)}
        {fields.length < 50 ? <Button onClick={() => add()}>添加一笔分配</Button> : null}
      </Flex>}
    </Form.List>;
}

function WarehouseCountFields() {
  return <>
    <Typography.Title level={5}>仓库点收</Typography.Title>
    <Form.Item name={['count', 'document', 'kind']} hidden><Input /></Form.Item>
    <TextField label="点收单来源系统" name={['count', 'document', 'source']} />
    <TextField label="仓库点收单号" name={['count', 'document', 'number']} />
    <TextField label="仓库点收单行号" name={['count', 'document', 'row']} />
    <QuantityField label="核实有效点收量" name={['count', 'qty']} />
    <TextField label="点收单位" name={['count', 'unit']} maxLength={64} />
    <Form.Item label="点收差异、换算或复点依据" name={['count', 'conversionEvidence']}
      extra="点收量与原数量不一致时填差异依据。跨单位时填本次换算或仓库复点依据。"
      normalize={(value: unknown) => typeof value === 'string' && value.trim() !== '' ? value : null}>
      <Input maxLength={500} />
    </Form.Item>
  </>;
}

export function RollbackArrivalForm({ arrival, isSaving, onSubmit, onInvalid }: {
  readonly arrival: Arrival;
  readonly isSaving: boolean;
  readonly onSubmit: (body: ReviseArrivalInput) => void;
  readonly onInvalid: () => void;
}) {
  return <Form layout="vertical" onFinish={(values: unknown) => {
    const reason = typeof values === 'object' && values !== null && 'reason' in values ? values.reason : undefined;
    const result = ReviseArrivalSchema.safeParse({ kind: 'rollback', expectedRevision: arrival.revision, reason });
    if (result.success) onSubmit(result.data);
    else onInvalid();
  }}>
    <TextField label="撤销原因" name="reason" maxLength={500} />
    <Button danger htmlType="submit" loading={isSaving}>撤销整份分配</Button>
  </Form>;
}

function TextField({ label, name, maxLength = 160 }: { readonly label: string; readonly name: NonNullable<FormItemProps['name']>; readonly maxLength?: number }) {
  return <Form.Item label={label} name={name} rules={required}><Input maxLength={maxLength} /></Form.Item>;
}

function QuantityField({ label, name }: { readonly label: string; readonly name: NonNullable<FormItemProps['name']> }) {
  return <Form.Item label={label} name={name} rules={required}><InputNumber min={0.0001} max={100_000_000_000} precision={4} style={{ width: '100%' }} /></Form.Item>;
}
