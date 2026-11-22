import { useState } from 'react';
import { Alert, Button, Input, Space, Typography } from 'antd';
import { BatchViewSchema, LocalDateSchema, WorkItemVersionResponseSchema, type BatchView, type OrderLineDetail } from '@sw/contracts';
import { diffDays, PROCUREMENT_STAGE_LABELS } from '@sw/domain';
import { useCanWrite } from '../../../shared/actor.js';
import { apiErrorMessage, apiSend } from '../../../shared/api/client.js';
import { TaskDrawer } from '../TaskDrawer.js';
import { WorkItemStatusTag } from '../task-tag.js';

type Schedule = NonNullable<OrderLineDetail['procurementSchedule']>;
type Item = Schedule['items'][number];
type Refresh = { readonly onChanged: () => void };

export function ProcurementStageList({ schedule, onChanged }: { readonly schedule: Schedule } & Refresh) {
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = useCanWrite('records.write');
  const delivery = schedule.items.find((item) => item.stage === 'delivery');
  const basis = schedule.items.find((item) => item.basis !== null)?.basis;
  const late = delivery === undefined || schedule.originalTargetOn === null ? 0 : diffDays(delivery.plannedEnd, schedule.originalTargetOn);
  return (
    <>
      {basis === undefined || basis === null ? null : <Typography.Paragraph>周期依据 {basis.basis} · 齐料间隔 {basis.materialsDays} 天 · 生产 {basis.productionDays} 天 · 交付间隔 {basis.deliveryDays} 天</Typography.Paragraph>}
      {late > 0 ? <Alert type="warning" showIcon title={`排期短缺 ${late} 天`} /> : null}
      <ol aria-label="已建排期节点">
        {schedule.items.map((item) => <li key={`${item.id}:${item.version}`} style={{ marginBottom: 8 }}>
          <Space wrap>
            <Button type="link" onClick={() => setOpenId(item.id)}>{PROCUREMENT_STAGE_LABELS[item.stage]}</Button>
            <WorkItemStatusTag status={item.status} />
            <span>负责人 {item.ownerName ?? '未分派'}</span>
            {canWrite && item.status !== 'cancelled' && item.status !== 'done'
              ? <PhaseDates item={item} onChanged={onChanged} />
              : <span>{item.plannedStart}{item.plannedStart === item.plannedEnd ? '' : ` 至 ${item.plannedEnd}`}</span>}
          </Space>
        </li>)}
      </ol>
      <TaskDrawer workItemId={openId} isOpen={openId !== null} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </>
  );
}

function PhaseDates({ item, onChanged }: { readonly item: Item } & Refresh) {
  const [start, setStart] = useState<string>(item.plannedStart);
  const [end, setEnd] = useState<string>(item.plannedEnd);
  const [error, setError] = useState('');
  const [isSaving, setSaving] = useState(false);
  const label = PROCUREMENT_STAGE_LABELS[item.stage];
  const isTask = item.stage === 'production';
  const isValid = LocalDateSchema.safeParse(start).success && LocalDateSchema.safeParse(end).success && start <= end;
  async function save() {
    setSaving(true);
    setError('');
    try {
      await apiSend({
        path: `/api/v1/plan/work-items/${encodeURIComponent(item.id)}`, method: 'PATCH',
        body: { plannedStart: start, plannedEnd: end, expectedVersion: item.version },
        schema: WorkItemVersionResponseSchema,
      });
      onChanged();
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught) ?? '保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Space wrap>
      <Input aria-label={isTask ? '生产计划开始日' : `${label}计划日`} type="date" value={start}
        onChange={(event) => { setStart(event.target.value); if (!isTask) setEnd(event.target.value); }} />
      {isTask ? <Input aria-label="生产计划结束日" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /> : null}
      <Button disabled={!isValid || start === item.plannedStart && end === item.plannedEnd} loading={isSaving} onClick={() => { void save(); }}>保存{label}日期</Button>
      {error === '' ? null : <Typography.Text type="danger" role="alert">{error}</Typography.Text>}
    </Space>
  );
}

export function SupplierPromiseEditor({ batch, onChanged }: { readonly batch: BatchView } & Refresh) {
  const canWrite = useCanWrite('records.write');
  const [date, setDate] = useState<string>(batch.dateSupplierPromised ?? '');
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!canWrite || batch.closedAt !== null || batch.cancelledAt !== null) return null;
  async function save() {
    setSaving(true);
    setError('');
    try {
      await apiSend({
        path: `/api/v1/batches/${encodeURIComponent(batch.id)}`, method: 'PATCH',
        body: { dateSupplierPromised: date || null }, schema: BatchViewSchema,
      });
      onChanged();
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught) ?? '保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Space wrap>
      <label>供应商承诺日 <Input aria-label={`批次 ${batch.seq} 供应商承诺日`} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <Button disabled={date === (batch.dateSupplierPromised ?? '') || date !== '' && !LocalDateSchema.safeParse(date).success}
        loading={isSaving} onClick={() => { void save(); }}>保存供应商承诺</Button>
      {error === '' ? null : <Typography.Text type="danger" role="alert">{error}</Typography.Text>}
    </Space>
  );
}
