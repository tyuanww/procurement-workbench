import { Descriptions, Tooltip, Typography, type TableColumnsType } from 'antd';
import type { ProgressArrival, ProgressRow } from '../../features/progress/index.js';
import { arrivalPaint, arrivalTableDate } from '../../features/progress/index.js';
import { MissingValue, StatusTag } from '../../shared/ui/widgets.js';
import { fontSize } from '../../theme/tokens.js';
import { ProgressNote } from './progress-note.js';
import { materialRiskState, ProgressNextAction } from './progress-material-risk.js';

export type ProgressMobileInput = {
  readonly notes: Readonly<Record<string, string>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly setDrafts: (drafts: Readonly<Record<string, string>>) => void;
  readonly onSaved: (lineId: string, text: string) => void;
  readonly setError: (message: string) => void;
  readonly now: Date;
  readonly isNarrowPhone: boolean;
};

export function progressMobileColumns(input: ProgressMobileInput): TableColumnsType<ProgressRow> {
  const widths = input.isNarrowPhone
    ? { po: 56, title: 70, stage: 48, days: 30, arrival: 48 }
    : { po: 72, title: 88, stage: 56, days: 36, arrival: 54 };
  return [
    { title: '单号', dataIndex: 'po', width: widths.po, ellipsis: true },
    { title: '品名', dataIndex: 'title', width: widths.title, ellipsis: true, render: (_value, row) => <MobileProduct row={row} /> },
    { title: '阶段', dataIndex: 'stageLabel', width: widths.stage, render: (_value, row) => <MobileStage row={row} /> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>停留</span>, width: widths.days, align: 'right', render: (_value, row) => <span style={{ whiteSpace: 'nowrap' }}>{row.dayText}</span> },
    { title: '到货', width: widths.arrival, ellipsis: true, render: (_value, row) => progressArrivalDate({ arrival: row.arrival, now: input.now }) },
  ];
}

function MobileStage({ row }: { readonly row: ProgressRow }) {
  const short = row.stage === 'no_batch' ? '待建' : row.stage === 'awaiting_date' ? '待确认' : row.stageLabel;
  return <Tooltip title={row.stageLabel}><span style={{ fontSize: fontSize.meta, overflowWrap: 'anywhere' }}>{short}</span></Tooltip>;
}

function MobileProduct({ row }: { readonly row: ProgressRow }) {
  const risk = materialRiskState(row.materialRisks);
  return (
    <>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</div>
      {risk === '' ? null : <Typography.Text type={risk === '物料逾期' ? 'danger' : 'secondary'} style={{ display: 'block', fontSize: fontSize.meta }}>{risk}</Typography.Text>}
    </>
  );
}

export function progressArrivalDate(input: { readonly arrival: ProgressArrival; readonly now: Date }) {
  if (input.arrival.kind === 'missing') return <MissingValue reason="not_provided" />;
  return <Tooltip title={input.arrival.dateText}>{arrivalTableDate({ arrival: input.arrival, now: input.now })}</Tooltip>;
}

export function progressMobileDetails(row: ProgressRow, input: ProgressMobileInput) {
  return (
    <Descriptions size="small" column={1} items={[
      { key: 'supplier', label: '供应商', children: row.supplierLabel },
      { key: 'stage', label: '阶段', children: row.stageLabel },
      { key: 'status', label: '状态', children: <ArrivalStatus arrival={row.arrival} /> },
      { key: 'next', label: '下一步', children: <ProgressNextAction row={row} /> },
      { key: 'note', label: '进度说明', children: <ProgressNote lineId={row.lineId} saved={input.notes[row.lineId] ?? ''} draft={input.drafts[row.lineId] ?? ''} onDraft={(text) => input.setDrafts({ ...input.drafts, [row.lineId]: text })} onSaved={(text) => input.onSaved(row.lineId, text)} onError={input.setError} /> },
    ]} />
  );
}

function ArrivalStatus(props: { readonly arrival: ProgressRow['arrival'] }) {
  const paint = arrivalPaint(props.arrival.kind);
  return paint.kind === 'missing' ? <MissingValue reason={paint.reason} /> : <StatusTag status={paint.status} />;
}
