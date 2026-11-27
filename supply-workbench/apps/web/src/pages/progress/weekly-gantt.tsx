import { Button, Tag, Tooltip, Typography } from 'antd';
import { diffDays, type LocalDate } from '@sw/domain';
import type { ScheduleWindow } from '../../features/progress/index.js';
import { shortDate } from '../../features/today/index.js';
import { statusColor } from '../../theme/tokens.js';
import { dateInWindow, planningPointLabel, pointPosition, weeklyDeliveryStatus, type PlanningGroup, type PlanningPoint, type PlanningRow } from './planning-rows.js';
import './weekly-gantt.css';

export function compactWeeklyGroups(groups: readonly PlanningGroup[]): readonly PlanningGroup[] {
  return groups.map((group) => ({ ...group, rows: group.rows.map(compactWeeklyRow) }));
}

function compactWeeklyRow(row: PlanningRow): PlanningRow {
  if (row.source.kind !== 'task') return row;
  const { item } = row.source;
  if (item.kind !== 'milestone' || item.plannedStart !== item.plannedEnd) return row;
  return { ...row, bar: null, points: [...row.points, { kind: 'milestone', date: item.plannedEnd }] };
}

function recordTitles(row: PlanningRow): readonly [title: string, subject?: string] {
  const { product, po } = row.orderIdentity ?? { product: null, po: null };
  if (row.source.kind === 'batch' && row.source.batch.kind === 'order') {
    const { batch } = row.source;
    return [product ?? batch.orderName ?? po ?? '成品订单', `批次 ${batch.seq}`];
  }
  return product === null || product === row.title ? [row.title] : [product, row.title];
}

export function weeklyGanttTitle(row: PlanningRow): string {
  return recordTitles(row).join(' · ');
}

function recordStatus(row: PlanningRow, today: LocalDate) {
  const { source, status } = row;
  if (source.kind === 'task' && source.item.overdueDays !== null && source.item.overdueDays > 0) {
    return { primary: { label: `逾期 ${source.item.overdueDays} 天`, tone: 'warning' as const }, secondary: status.label };
  }
  const fallback = { primary: status, secondary: null };
  if (source.kind !== 'batch' || source.batch.kind !== 'order') return fallback;
  const { weeklyDelivery, facts: { confirmed } } = source.batch;
  if (weeklyDelivery === undefined || weeklyDelivery.timing === 'settled') return fallback;
  const elapsedDays = confirmed === null ? null : diffDays(today, confirmed);
  return {
    primary: weeklyDeliveryStatus({ timing: weeklyDelivery.timing, elapsedDays, fallback: status }),
    secondary: source.batch.status === 'partially_received' ? status.label : null,
  };
}

type WeeklyRecord = {
  readonly row: PlanningRow; readonly window: ScheduleWindow; readonly today: LocalDate;
};

export function WeeklyGanttRecord({ row, window, today, id, warningId, onOpen }: WeeklyRecord & {
  readonly id: string; readonly warningId: string; readonly onOpen: () => void;
}) {
  const title = weeklyGanttTitle(row);
  const [product, subject] = recordTitles(row);
  const { primary, secondary } = recordStatus(row, today);
  const color = statusColor[primary.tone];
  return <Tooltip title={[title, row.when].filter(Boolean).join(' · ')} trigger={['hover', 'focus']}>
    <Button id={id} type="link" className="planning-record-link" onClick={onOpen}
      aria-describedby={hasDependencyConflict(row) ? warningId : undefined}>
      <span className="planning-row-title weekly-gantt-row-title" data-batch={row.source.kind === 'batch'}>
        <strong>{product}</strong>
        {subject === undefined ? null : <span className="weekly-gantt-subject"> · {subject}</span>}
        <Tag variant="filled" style={{ color: color.text, background: color.bg }}>{primary.label}</Tag>
      </span>
      <WeeklyGanttRecordMeta {...{ row, window, today }} secondaryStatus={secondary} />
    </Button>
  </Tooltip>;
}

function WeeklyGanttRecordMeta({ row, window, today, secondaryStatus }: WeeklyRecord & { readonly secondaryStatus: string | null }) {
  const previous = carriedConfirmedDate(row, { window, today });
  const next = row.nextRiskOn !== undefined && !dateInWindow(row.nextRiskOn, window) ? row.nextRiskOn : null;
  const po = row.orderIdentity?.po;
  const notes = [
    po == null ? null : <span key="po" className="weekly-gantt-po">{po}</span>,
    secondaryStatus === null ? null : <span key="status">{secondaryStatus}</span>,
    previous === null ? null : <span key="confirmed">采购确认 <time dateTime={previous}>{shortDate(previous, today)}</time></span>,
    next === null ? null : <span key="next">下周风险 <time dateTime={next}>{shortDate(next, today)}</time></span>,
    hasDependencyConflict(row) ? <span key="conflict" className="planning-warning">依赖冲突</span> : null,
  ].filter((note) => note !== null);
  return notes.length === 0 ? null : <span className="planning-row-meta weekly-gantt-row-meta">{notes}</span>;
}

function hasDependencyConflict(row: PlanningRow): boolean {
  return Boolean(row.dependencyConflicts?.length);
}

function carriedConfirmedDate({ source }: PlanningRow, { window, today }: Omit<WeeklyRecord, 'row'>): LocalDate | null {
  if (source.kind !== 'batch' || source.batch.kind !== 'order') return null;
  const { facts: { confirmed }, weeklyDelivery } = source.batch;
  if (weeklyDelivery?.timing !== 'overdue' && weeklyDelivery?.timing !== 'needs-review') return null;
  return confirmed !== null && confirmed < window.from && confirmed < today ? confirmed : null;
}

function pointsByDate(points: readonly PlanningPoint[]) {
  const byDate = new Map<LocalDate, Set<PlanningPoint['kind']>>();
  for (const { date, kind } of points) {
    const kinds = byDate.get(date);
    if (kinds === undefined) byDate.set(date, new Set([kind]));
    else kinds.add(kind);
  }
  return [...byDate].sort(([left], [right]) => left.localeCompare(right));
}

export function WeeklyGanttPoints({ row, window, id, onOpen }: {
  readonly row: PlanningRow; readonly window: ScheduleWindow; readonly id: string; readonly onOpen: (trigger: string) => void;
}) {
  if (row.points.length === 0) return null;
  const title = weeklyGanttTitle(row);
  return <div className="weekly-gantt-points">
    {pointsByDate(row.points).map(([date, kinds]) =>
      <div className="weekly-gantt-point-stack" key={date} style={{ marginInlineStart: `${pointPosition(date, window)}%` }}>
        {[...kinds].map((kind) => {
          const trigger = `${id}-point-${date}-${kind}`;
          const label = `${title} · ${planningPointLabel[kind]} ${date}`;
          return <Tooltip key={kind} title={[label, row.risk].filter(Boolean).join(' · ')} trigger={['hover', 'focus']}>
            <Button id={trigger} type="text" className="weekly-gantt-point" aria-label={label} onClick={() => onOpen(trigger)}>
              <span className={`planning-marker planning-marker-${kind}`} aria-hidden="true" />
            </Button>
          </Tooltip>;
        })}
      </div>
    )}
  </div>;
}

export function WeeklyGanttLegend({ groups, elapsedDeadlineLabel }: {
  readonly groups: readonly PlanningGroup[]; readonly elapsedDeadlineLabel: string | null;
}) {
  const rows = groups.flatMap((group) => group.rows);
  const pointKinds = new Set<string>(rows.flatMap((row) => row.points.map((point) => point.kind)));
  const hasPlan = rows.some((row) => row.bar !== null && row.source.kind !== 'batch');
  if (!hasPlan && elapsedDeadlineLabel === null && pointKinds.size === 0) return null;
  const marks = [
    ...(hasPlan ? [{ kind: 'interval', label: '任务计划' }] : []),
    ...Object.entries(planningPointLabel).filter(([kind]) => pointKinds.has(kind)).map(([kind, label]) => ({ kind, label })),
    ...(elapsedDeadlineLabel === null ? [] : [{ kind: 'overdue', label: elapsedDeadlineLabel }]),
  ];
  return <div className="planning-legend weekly-gantt-legend" role="group" aria-label="甘特图图例">
    {marks.map(({ kind, label }) =>
      <Typography.Text key={kind}><i className={`planning-marker planning-marker-${kind}`} aria-hidden="true" />{label}</Typography.Text>
    )}
  </div>;
}
