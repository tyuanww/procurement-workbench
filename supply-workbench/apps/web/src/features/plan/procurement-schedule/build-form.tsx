import { useState } from 'react';
import { Alert, Button, Input, InputNumber, Space, Typography } from 'antd';
import { BuildProcurementScheduleRequestSchema, BuildProcurementScheduleResultSchema, type OrderLineDetail, type ProcurementStore } from '@sw/contracts';
import { MAX_PROCUREMENT_PHASE_DAYS, PROCUREMENT_SCHEDULE_STAGES, PROCUREMENT_STAGE_LABELS, diffDays, procurementDraft, type LocalDate } from '@sw/domain';
import { apiErrorMessage, apiSend } from '../../../shared/api/client.js';

type Dates = NonNullable<OrderLineDetail['procurementSchedule']>;
type CompleteWindow = Dates & { readonly releasedOn: LocalDate; readonly originalTargetOn: LocalDate };

export function BuildProcurementForm({ schedule, orderLineId, store, onBuilt }: {
  readonly schedule: Dates;
  readonly orderLineId: string;
  readonly store: ProcurementStore;
  readonly onBuilt: (orderOn: LocalDate) => void;
}) {
  const { releasedOn, originalTargetOn, releaseDays } = schedule;
  if (releasedOn === null || originalTargetOn === null || releaseDays === null) {
    return <Alert type="warning" showIcon title="缺生产周期" description="需核实需求下发日和原目标交付日后，才能建立排期。" />;
  }
  return <BuildForm schedule={{ ...schedule, releasedOn, originalTargetOn }} orderLineId={orderLineId} store={store} onBuilt={onBuilt} />;
}

function BuildForm({ schedule, orderLineId, store, onBuilt }: {
  readonly schedule: CompleteWindow;
  readonly orderLineId: string;
  readonly store: ProcurementStore;
  readonly onBuilt: (orderOn: LocalDate) => void;
}) {
  const { fields, preview, isOrderEarly, isSaving, error, submit } = useBuildForm({ schedule, orderLineId, store, onBuilt });
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {preview === null ? <Alert type="warning" showIcon title="缺生产周期或日期待核对" description="填写从下单到齐料的间隔、齐料后次日起的生产天数和生产结束到交付的间隔，均按自然日。齐料与交付间隔可填 0。" /> : null}
      <BuildFields fields={fields} releasedOn={schedule.releasedOn} />
      {isOrderEarly ? <Typography.Text type="danger">计划下单日不能早于需求下发日。</Typography.Text> : null}
      {preview === null ? null : <DraftPreview preview={preview} target={schedule.originalTargetOn} />}
      {error === '' ? null : <Alert type="error" showIcon title={error} />}
      <Button type="primary" disabled={preview === null} loading={isSaving} onClick={() => { void submit(); }}>建立排期</Button>
    </Space>
  );
}

function useBuildForm({ schedule, orderLineId, store, onBuilt }: {
  readonly schedule: CompleteWindow;
  readonly orderLineId: string;
  readonly store: ProcurementStore;
  readonly onBuilt: (orderOn: LocalDate) => void;
}) {
  const [orderOn, setOrderOn] = useState<string>(schedule.projectOrderedOn !== null && schedule.projectOrderedOn >= schedule.releasedOn
    ? schedule.projectOrderedOn : schedule.releasedOn);
  const [materialsDays, setMaterialsDays] = useState<number | null>(null);
  const [productionDays, setProductionDays] = useState<number | null>(null);
  const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
  const [basis, setBasis] = useState('');
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const payload = { orderLineId, store, orderOn, cycle: { materialsDays, productionDays, deliveryDays, basis } };
  const parsed = BuildProcurementScheduleRequestSchema.safeParse(payload);
  const isOrderEarly = orderOn !== '' && orderOn < schedule.releasedOn;
  const preview = parsed.success && !isOrderEarly ? draftPreview(parsed.data) : null;

  async function submit() {
    if (!parsed.success || preview === null) return;
    setError('');
    setSaving(true);
    try {
      await apiSend({ path: '/api/v1/plan/procurement-schedule', method: 'POST', body: parsed.data, schema: BuildProcurementScheduleResultSchema });
      onBuilt(parsed.data.orderOn);
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught) ?? '保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  }

  return { fields: { orderOn, setOrderOn, materialsDays, setMaterialsDays, productionDays, setProductionDays, deliveryDays, setDeliveryDays, basis, setBasis }, preview, isOrderEarly, isSaving, error, submit };
}

function BuildFields({ fields, releasedOn }: { readonly fields: ReturnType<typeof useBuildForm>['fields']; readonly releasedOn: LocalDate }) {
  return <>
    <Space wrap align="start">
      <label>计划下单日 <Input aria-label="计划下单日" type="date" min={releasedOn} value={fields.orderOn} onChange={(event) => fields.setOrderOn(event.target.value)} /></label>
      <DayInput label="下单至齐料（天）" value={fields.materialsDays} onChange={fields.setMaterialsDays} min={0} />
      <DayInput label="生产周期（天）" value={fields.productionDays} onChange={fields.setProductionDays} min={1} />
      <DayInput label="生产结束至交付（天）" value={fields.deliveryDays} onChange={fields.setDeliveryDays} min={0} />
    </Space>
    <label>周期依据 <Input aria-label="周期依据" value={fields.basis} maxLength={500} placeholder="填写适用工厂及已核实的资料或记录" onChange={(event) => fields.setBasis(event.target.value)} /></label>
  </>;
}

function DraftPreview({ preview, target }: { readonly preview: ReturnType<typeof procurementDraft>; readonly target: LocalDate }) {
  const daysLate = diffDays(preview.delivery.end, target);
  return <>
    <ul aria-label="计划节点预览" style={{ margin: 0 }}>
      {PROCUREMENT_SCHEDULE_STAGES.map((stage) => <li key={stage}>{PROCUREMENT_STAGE_LABELS[stage]} {preview[stage].start}{preview[stage].end === preview[stage].start ? '' : ` 至 ${preview[stage].end}`}</li>)}
    </ul>
    {daysLate > 0 ? <Alert type="warning" showIcon title={`排期短缺 ${daysLate} 天`} description={`计划交付 ${preview.delivery.end}，原目标 ${target}。`} /> : null}
  </>;
}

function DayInput(props: { readonly label: string; readonly value: number | null; readonly onChange: (value: number | null) => void; readonly min: number }) {
  return <label style={{ display: 'grid' }}>{props.label}<InputNumber aria-label={props.label} value={props.value} min={props.min} max={MAX_PROCUREMENT_PHASE_DAYS} precision={0} onChange={props.onChange} /></label>;
}

function draftPreview(input: Parameters<typeof procurementDraft>[0]) {
  try {
    return procurementDraft(input);
  } catch {
    return null;
  }
}
