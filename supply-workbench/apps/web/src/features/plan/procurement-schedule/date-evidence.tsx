import { Alert, Collapse, Tag, Typography } from 'antd';
import { type BatchView, type OrderLineDetail } from '@sw/contracts';
import { batchStatusLabel, countsInRecordedQuantity } from '@sw/domain';
import { space } from '../../../theme/tokens.js';
import { formatDateTime } from '../../../shared/ui/format.js';
import { useCanWrite } from '../../../shared/actor.js';
import { Link } from 'react-router';

type Dates = NonNullable<OrderLineDetail['procurementSchedule']>;
type Observation = Dates['observations'][number];

const fieldLabels: Readonly<Record<Observation['field'], string>> = {
  submittedOn: 'OA 提报日', releasedOn: '需求下发日', projectOrderedOn: '项目表下单日',
  semiFinishedOrderedOn: '总表半成品订单创建日', masterTargetOn: '总表目标交付日', projectTargetOn: '项目表需求交付日',
};

export function ProcurementDateEvidence({ schedule, batches }: { readonly schedule: Dates; readonly batches: readonly BatchView[] }) {
  const canReadImport = useCanWrite('imports.write');
  const dates = [
    ['OA 提报日', schedule.submittedOn],
    ['需求下发日', schedule.releasedOn],
    ['项目表下单日', schedule.projectOrderedOn],
    ['总表半成品订单创建日', schedule.semiFinishedOrderedOn],
    ['提报至原目标', schedule.submissionDays === null ? null : `${schedule.submissionDays} 天（含首尾）`],
    ['下发至原目标', schedule.releaseDays === null ? null : `${schedule.releaseDays} 天（含首尾）`],
  ];
  const hasDifferentTarget = schedule.observations.some((item) =>
    (item.field === 'masterTargetOn' || item.field === 'projectTargetOn') && item.value !== null && item.value !== schedule.originalTargetOn);
  return (
    <>
      <DeliveryProgress target={schedule.originalTargetOn} batches={batches} />
      <dl style={dateGrid}>
        {dates.map(([label, value]) => <div key={label}><dt>{label}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{value ?? '缺项或待核对'}</dd></div>)}
      </dl>
      {schedule.releasedOn !== null && schedule.originalTargetOn !== null && schedule.releaseDays === null
        ? <Alert type="warning" showIcon title="原目标交付日早于需求下发日" /> : null}
      {hasDifferentTarget ? <Alert type="warning" showIcon title="来源目标日期有不同值，请核对来源与变更记录" /> : null}
      {schedule.observations.length === 0 ? null : <Collapse items={[{
        key: 'dates', label: '日期来源与变更记录',
        children: <ul style={{ margin: 0 }}>{[...schedule.observations].reverse().map((item, index) => (
          <li key={`${item.importBatchId}:${item.field}:${index}`}>
            {fieldLabels[item.field]} {item.value ?? `待核对（${item.raw}）`} · <DateSourceLink item={item} canReadImport={canReadImport} />
            {'column' in item.source ? `第 ${item.source.column} 列` : ''}
            {'range' in item.source && item.source.range !== null ? `（合并至第 ${item.source.range.endRow} 行）` : ''}
            {' · '}{formatDateTime(item.committedAt) ?? item.committedAt}
          </li>
        ))}</ul>,
      }]} />}
    </>
  );
}

function DateSourceLink({ item, canReadImport }: { readonly item: Observation; readonly canReadImport: boolean }) {
  const label = `${item.source.sheetName} 第 ${item.source.rowNo} 行`;
  return canReadImport ? <Link to={`/imports/${encodeURIComponent(item.importBatchId)}`}
    aria-label={`${label} · ${fieldLabels[item.field]} · ${item.committedAt}`}>{label}</Link> : label;
}

const dateGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 185px), 1fr))', gap: space[3] };

function DeliveryProgress({ target, batches }: { readonly target: Dates['originalTargetOn']; readonly batches: readonly BatchView[] }) {
  return <dl aria-label="成品交期对照" style={dateGrid}>
    <div>
      <dt><Tag variant="filled">原表</Tag><span>原目标交付日</span></dt>
      <dd style={{ margin: 0 }}><Typography.Text strong>{target ?? '待核对'}</Typography.Text></dd>
    </div>
    <div>
      <dt>当前确认进度</dt>
      <dd style={{ margin: 0 }}><ConfirmedBatchProgress batches={batches} /></dd>
    </div>
  </dl>;
}

function ConfirmedBatchProgress({ batches }: { readonly batches: readonly BatchView[] }) {
  const active = batches.filter((batch) => batch.status !== 'cancelled');
  if (active.length === 0) return <Typography.Text type="secondary">暂无有效批次，确认到货和签收待登记</Typography.Text>;
  return <>
    {active.map((batch) => {
      const received = recordedReceiptDays(batch).at(-1);
      return <div key={batch.id}>
        <Typography.Text strong>批次 {batch.seq} · {batchStatusLabel(batch.status)}</Typography.Text>
        <div><Tag variant="filled">采购确认</Tag>到货日 {batch.dateBuyerConfirmed ?? '待确认'}</div>
        <div><Tag variant="filled">实收</Tag>{received === undefined ? '待登记或核实' : `最近签收 ${received}`}</div>
      </div>;
    })}
  </>;
}

function recordedReceiptDays(batch: BatchView) {
  return [...new Set(batch.receipts.filter((receipt) => receipt.fulfillment?.kind === 'received' && countsInRecordedQuantity(receipt)).map((item) => item.receivedOn))].sort();
}

export function ProcurementBatchDates({ batch }: { readonly batch: BatchView }) {
  const receipts = recordedReceiptDays(batch);
  const history = batch.dateChanges.filter((change) => change.field === 'dateSupplierPromised');
  return (
    <>
      <Typography.Paragraph>
        供应商承诺日 {batch.dateSupplierPromised ?? '缺项'} · 采购确认到货日 {batch.dateBuyerConfirmed ?? '缺项'} · 实际收货日 {receipts.length > 0 ? receipts.join('、') : '未有已确认记录'}
      </Typography.Paragraph>
      {history.length === 0 ? null : <Collapse items={[{
        key: 'promises', label: '供应商承诺变更',
        children: history.map((change) => <div key={change.id}>{change.oldValue ?? '缺项'} → {change.newValue ?? '缺项'} · {formatDateTime(change.changedAt) ?? change.changedAt}{change.reason === null ? '' : ` · ${change.reason}`}</div>),
      }]} />}
    </>
  );
}
