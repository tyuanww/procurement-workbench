import { Alert, Collapse, Typography } from 'antd';
import { type BatchView, type OrderLineDetail } from '@sw/contracts';
import { countsInRecordedQuantity } from '@sw/domain';
import { formatDateTime } from '../../../shared/ui/format.js';

type Dates = NonNullable<OrderLineDetail['procurementSchedule']>;
type Observation = Dates['observations'][number];

const fieldLabels: Readonly<Record<Observation['field'], string>> = {
  submittedOn: 'OA 提报日', releasedOn: '需求下发日', projectOrderedOn: '项目表下单日',
  semiFinishedOrderedOn: '总表半成品订单创建日', masterTargetOn: '总表目标交付日', projectTargetOn: '项目表需求交付日',
};

export function ProcurementDateEvidence({ schedule }: { readonly schedule: Dates }) {
  const dates = [
    ['OA 提报日', schedule.submittedOn],
    ['需求下发日', schedule.releasedOn],
    ['项目表下单日', schedule.projectOrderedOn],
    ['总表半成品订单创建日', schedule.semiFinishedOrderedOn],
    ['原目标交付日', schedule.originalTargetOn],
    ['提报至原目标', schedule.submissionDays === null ? null : `${schedule.submissionDays} 天（含首尾）`],
    ['下发至原目标', schedule.releaseDays === null ? null : `${schedule.releaseDays} 天（含首尾）`],
  ];
  const hasDifferentTarget = schedule.observations.some((item) =>
    (item.field === 'masterTargetOn' || item.field === 'projectTargetOn') && item.value !== null && item.value !== schedule.originalTargetOn);
  return (
    <>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 12 }}>
        {dates.map(([label, value]) => <div key={label}><dt>{label}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{value ?? '缺项或待核对'}</dd></div>)}
      </dl>
      {schedule.releasedOn !== null && schedule.originalTargetOn !== null && schedule.releaseDays === null
        ? <Alert type="warning" showIcon title="原目标交付日早于需求下发日" /> : null}
      {hasDifferentTarget ? <Alert type="warning" showIcon title="来源目标日期有不同值，请核对来源与变更记录" /> : null}
      {schedule.observations.length === 0 ? null : <Collapse items={[{
        key: 'dates', label: '日期来源与变更记录',
        children: <ul style={{ margin: 0 }}>{[...schedule.observations].reverse().map((item, index) => (
          <li key={`${item.importBatchId}:${item.field}:${index}`}>
            {fieldLabels[item.field]} {item.value ?? `待核对（${item.raw}）`} · {item.source.sheetName} 第 {item.source.rowNo} 行
            {'column' in item.source ? `第 ${item.source.column} 列` : ''}
            {'range' in item.source && item.source.range !== null ? `（合并至第 ${item.source.range.endRow} 行）` : ''}
            {' · '}{formatDateTime(item.committedAt) ?? item.committedAt}
          </li>
        ))}</ul>,
      }]} />}
    </>
  );
}

export function ProcurementBatchDates({ batch }: { readonly batch: BatchView }) {
  const receipts = [...new Set(batch.receipts.filter((receipt) => receipt.fulfillment?.kind === 'received' && countsInRecordedQuantity(receipt)).map((item) => item.receivedOn))].sort();
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
