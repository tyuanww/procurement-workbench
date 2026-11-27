import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip, Typography } from 'antd';
import { Fragment, useState, type ReactNode } from 'react';
import { addDays, diffDays, type LocalDate } from '@sw/domain';
import { predecessorWarningText } from '../../features/plan/index.js';
import { scheduleDays, type ScheduleScale, type ScheduleWindow } from '../../features/progress/index.js';
import { shortDate } from '../../features/today/index.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { statusColor } from '../../theme/tokens.js';
import { weeklySupplierText, type OrderBatchFacts, type WeeklyOrderDelivery } from './planning-batches.js';
import { planningRowTriggerId } from './planning-navigation.js';
import { dateInWindow, planningPointLabel, pointPosition, weeklyActionLabel, weeklyDeliveryStatus, type PlanningGroup, type PlanningPoint, type PlanningRow, type PlanningSource } from './planning-rows.js';
import { compactWeeklyGroups, WeeklyGanttLegend, WeeklyGanttPoints, WeeklyGanttRecord, weeklyGanttTitle } from './weekly-gantt.js';

type OpenRow = (source: PlanningSource, triggerId: string) => void;
type TimelineProps = {
  readonly groups: readonly PlanningGroup[];
  readonly window: ScheduleWindow;
  readonly scale: ScheduleScale;
  readonly today: LocalDate;
  readonly onOpen: OpenRow;
  readonly selectedRow: string | null;
  readonly renderRowFacts?: ((row: PlanningRow) => ReactNode) | undefined;
  readonly renderListContent?: ((row: PlanningRow) => ReactNode) | undefined;
  readonly compactWeek?: boolean;
};

export function PlanningTimeline(props: TimelineProps & {
  readonly isList: boolean;
  readonly ganttLabel?: string;
  readonly legend?: ReactNode;
  readonly renderGroupExtra?: ((group: PlanningGroup) => ReactNode) | undefined;
}): ReactNode {
  const [closed, setClosed] = useState<readonly string[]>([]);
  const toggle = (key: string) => setClosed((current) => current.includes(key)
    ? current.filter((closedKey) => closedKey !== key) : [...current, key]);
  const groups = props.compactWeek && !props.isList ? compactWeeklyGroups(props.groups) : props.groups;
  const rows = groups.map((group) => {
    const isOpen = !closed.includes(group.key);
    const header = <GroupButton group={group} isOpen={isOpen} onClick={() => toggle(group.key)} />;
    const extra = props.renderGroupExtra?.(group);
    return <Fragment key={group.key}>
      {group.leadHeading === undefined ? null : <div className="planning-lead-heading">{group.leadHeading}</div>}
      {extra == null ? header : <div className="planning-group-heading"><div className="planning-group-controls">{header}{extra}</div></div>}
      {isOpen ? group.rows.map((row) => props.isList
        ? <ListRow key={row.id} row={row} {...props} />
        : <GanttRow key={row.id} row={row} {...props} />) : null}
    </Fragment>;
  });
  if (props.isList) return <div aria-label="排期列表">{rows}</div>;
  const days = scheduleDays(props);
  const elapsedLabel = elapsedDeadlineLabel(groups);
  return <>
    {props.legend ?? (props.compactWeek
      ? <WeeklyGanttLegend groups={groups} elapsedDeadlineLabel={elapsedLabel} />
      : <PlanningLegend elapsedDeadlineLabel={elapsedLabel} />)}
    <div className="planning-gantt-scroll" role="region" aria-label={props.ganttLabel ?? '排期甘特图'} tabIndex={0}>
      <div className={props.compactWeek ? 'planning-gantt weekly-gantt' : 'planning-gantt'} data-scale={props.scale}
        style={{ gridTemplateColumns: `var(--planning-record-width) repeat(${days.length}, minmax(${props.scale === 'week' ? 64 : 32}px, 1fr))` }}>
        <div className="planning-axis-record" aria-hidden="true" />
        {days.map((day) => <time key={day.date} dateTime={day.date} className="planning-axis-day" data-today={day.isToday}
          aria-current={day.isToday ? 'date' : undefined}>{day.label}<span>{day.isToday ? '今天' : `周${day.weekday}`}</span></time>)}
        {rows}
      </div>
    </div>
  </>;
}

function GroupButton({ group, isOpen, onClick }: { readonly group: PlanningGroup; readonly isOpen: boolean; readonly onClick: () => void }) {
  return <Button type="text" className="planning-group" aria-expanded={isOpen} onClick={onClick}>
    <span className="planning-group-title">{isOpen ? <CaretDownOutlined /> : <CaretRightOutlined />} {group.title}</span>
    {group.meta === '' ? null : <span className="planning-group-meta">{group.meta}</span>}
  </Button>;
}

function RowContent({ row, today, isList }: { readonly row: PlanningRow; readonly today: LocalDate; readonly isList: boolean }) {
  const order = row.source.kind === 'batch' && row.source.batch.kind === 'order' ? row.source.batch : null;
  const meta = [row.meta, isList ? null : row.status.label].filter(Boolean).join(' · ');
  return <>
    <RowTitle title={row.title} status={isList ? row.status : null} />
    {meta === '' ? null : <span className="planning-row-meta">{meta}</span>}
    {order === null ? null : <BatchFacts facts={order.facts} today={today} />}
  </>;
}

type WeeklyBatchContent = {
  readonly row: PlanningRow;
  readonly facts: OrderBatchFacts;
  readonly today: LocalDate;
  readonly delivery: WeeklyOrderDelivery;
};

function WeeklyBatchListContent(props: WeeklyBatchContent) {
  const { row, facts: { confirmed }, today, delivery: { timing } } = props;
  const elapsedDays = confirmed === null ? null : diffDays(today, confirmed);
  const status = weeklyDeliveryStatus({ timing, elapsedDays, fallback: row.status });
  return <span className="weekly-batch-list">
    <WeeklyBatchIdentity {...props} status={status} />
    <WeeklyBatchSummary facts={props.facts} today={today} />
    <WeeklyBatchNotes {...props} elapsedDays={elapsedDays} />
  </span>;
}

function WeeklyBatchIdentity({ row, facts: { owner }, delivery: { supplier, actions }, status }:
  Pick<WeeklyBatchContent, 'row' | 'facts' | 'delivery'> & { readonly status: PlanningRow['status'] }) {
  const color = statusColor[status.tone];
  const meta = [row.meta, supplier?.name ?? weeklySupplierText(supplier)].filter(Boolean).join(' · ');
  const ownerName = owner === null ? '采购负责人未分配' : owner.name ?? '采购负责人待核对';
  return <span className="weekly-batch-identity">
    <span className="weekly-batch-title">
      <Tag variant="filled" style={{ color: color.text, background: color.bg, borderColor: color.border }}>{status.label}</Tag>
      <strong>{row.title}</strong>
    </span>
    <span className="planning-row-meta">{meta}<span className="weekly-batch-owner"> · {ownerName}</span></span>
    {actions.length === 0 ? null : <span className="weekly-batch-actions">{actions.map(weeklyActionLabel).join(' · ')}</span>}
  </span>;
}

function WeeklyBatchSummary({ facts: { confirmed, plannedQty, receivedQty, outstandingQty, unit }, today }:
  Pick<WeeklyBatchContent, 'facts' | 'today'>) {
  const quantity = (value: number | null) => batchQuantity(value, unit);
  return <>
    <span className="weekly-batch-due">
      <span className="planning-row-meta">采购确认交期 {confirmed === null ? '未确认' : batchDate(confirmed, today)}</span>
      <strong>{outstandingQty === null ? '欠收待核实' : `欠收 ${quantity(outstandingQty)}`}</strong>
    </span>
    <span className="weekly-batch-entry">查看批次</span>
    <span className="weekly-batch-quantities planning-row-meta">计划 {quantity(plannedQty)}{unit === null ? '（单位待核）' : ''} · {receivedQty === null ? '实收待核实' : `确认实收 ${quantity(receivedQty)}`}</span>
  </>;
}

function WeeklyBatchNotes({ row, facts: { original, conflict, unshippedQty, unit }, today, delivery: { timing, actions }, elapsedDays }:
  WeeklyBatchContent & { readonly elapsedDays: number | null }) {
  const isUnshippedShown = unshippedQty !== null && !actions.some((action) => action.kind === 'expedite' && action.qty === unshippedQty);
  const isPastUnverifiedDate = timing === 'needs-review' && elapsedDays !== null && elapsedDays > 0;
  const notes = [
    original === null ? null : <span key="original">原交期 {batchDate(original, today)}</span>,
    conflict === null ? null : <span key="conflict"><DeliveryDateConflict conflict={conflict} today={today} /></span>,
    !isUnshippedShown ? null : <span key="unshipped">其中未发 {batchQuantity(unshippedQty, unit)}</span>,
    !isPastUnverifiedDate ? null : <span key="past-confirmed">已过确认日 {elapsedDays} 天</span>,
    weeklyReceiptDates({ row, today }),
    row.risk === undefined ? null : <span key="risk" className="planning-warning">{row.risk}</span>,
  ];
  return notes.every((note) => note === null) ? null : <span className="weekly-batch-notes planning-row-meta">{notes}</span>;
}

function weeklyReceiptDates({ row, today }: Pick<WeeklyBatchContent, 'row' | 'today'>) {
  const dates = row.points.flatMap(({ kind, date }) => kind === 'received' ? [shortDate(date, today)] : []);
  return dates.length === 0 ? null : <span key="receipt">实际收货 {dates.join('、')}</span>;
}

function DeliveryDateConflict({ conflict, today }: { readonly conflict: NonNullable<OrderBatchFacts['conflict']>; readonly today: LocalDate }) {
  return <>
    <span className="planning-warning">交期冲突</span> · 工厂要求 {conflict.required === null ? '—' : batchDate(conflict.required, today)}
    {' · '}供应商承诺 {conflict.supplierPromised === null ? '—' : batchDate(conflict.supplierPromised, today)}
  </>;
}

function RowTitle({ title, status }: { readonly title: string; readonly status: PlanningRow['status'] | null }) {
  const color = status === null ? null : statusColor[status.tone];
  return <span className="planning-row-title"><strong>{title}</strong>
    {status === null || color === null ? null : <Tag variant="filled" style={{ color: color.text, background: color.bg }}>{status.label}</Tag>}
  </span>;
}

function batchDate(value: LocalDate, today: LocalDate) {
  return <time dateTime={value}>{shortDate(value, today)}</time>;
}

function batchQuantity(value: number | null, unit: OrderBatchFacts['unit']): string {
  return value === null || unit === null ? formatQuantity(value) : `${formatQuantity(value)} ${unit}`;
}

function BatchFacts({ facts, today }: { readonly facts: OrderBatchFacts; readonly today: LocalDate }) {
  const { confirmed, conflict, original, plannedQty, receivedQty, outstandingQty, unshippedQty, unit, owner } = facts;
  const date = (value: LocalDate) => batchDate(value, today);
  const quantity = (value: number | null) => batchQuantity(value, unit);
  return <>
    <span className="planning-row-meta">
      {conflict === null ? null : <><DeliveryDateConflict conflict={conflict} today={today} />{' · '}</>}
      采购确认交期 {confirmed === null ? '未确认' : date(confirmed)}
      {original === null ? null : <> · 原交期 {date(original)}</>}
    </span>
    <span className="planning-row-meta">
      计划量 {quantity(plannedQty)}{unit === null ? '（单位待核）' : ''} · {receivedQty === null ? '实收待核实' : `确认实收 ${quantity(receivedQty)}`}
    </span>
    <span className="planning-row-meta">欠收量 {quantity(outstandingQty)} · 其中未发 {quantity(unshippedQty)}</span>
    <span className="planning-row-meta">采购负责人 {owner === null ? '未分配' : owner.name ?? '待核对'}</span>
  </>;
}

function ListRow({ row, today, onOpen, selectedRow, renderRowFacts, renderListContent }:
  Pick<TimelineProps, 'today' | 'onOpen' | 'selectedRow' | 'renderRowFacts' | 'renderListContent'> & { readonly row: PlanningRow }) {
  const id = planningRowTriggerId(row.id);
  const order = row.source.kind === 'batch' && row.source.batch.kind === 'order' ? row.source.batch : null;
  const weekly = order?.weeklyDelivery;
  const custom = renderListContent?.(row);
  return <Button id={id} type="text" className={weekly === undefined ? 'planning-list-row' : 'planning-list-row weekly-batch-row'}
    data-selected={row.id === selectedRow} onClick={() => onOpen(row.source, id)}>
    {custom ?? (order === null || weekly === undefined
      ? <ListRowDetails row={row} today={today} />
      : <WeeklyBatchListContent row={row} today={today} facts={order.facts} delivery={weekly} />)}
    {renderRowFacts?.(row)}
    <DependencySummary row={row} />
  </Button>;
}

function ListRowDetails({ row, today }: { readonly row: PlanningRow; readonly today: LocalDate }) {
  const overdue = row.source.kind === 'task' && row.bar?.label !== row.status.label ? row.bar?.label : null;
  const schedule = [row.when, overdue].filter(Boolean).join(' · ');
  return <>
    <RowContent row={row} today={today} isList />
    {schedule === '' ? null : <span className="planning-row-meta">{schedule}</span>}
  </>;
}

function GanttRow({ row, window, today, onOpen, selectedRow, renderRowFacts, compactWeek }:
  Pick<TimelineProps, 'window' | 'today' | 'onOpen' | 'selectedRow' | 'renderRowFacts' | 'compactWeek'> & { readonly row: PlanningRow }) {
  const id = planningRowTriggerId(row.id);
  const current = dateInWindow(today, window) ? pointPosition(today, window) : null;
  const warningId = `${id}-warning`;
  const openRow = (trigger: string) => onOpen(row.source, trigger);
  const intervalId = `${id}-interval`;
  const compactIntervalLabel = compactWeek && row.bar !== null ? weeklyIntervalLabel(row, { bar: row.bar, today }) : null;
  return <>
    <div className="planning-row-heading" data-selected={row.id === selectedRow}>
      {compactWeek ? <WeeklyGanttRecord {...{ row, window, today, id, warningId }} onOpen={() => openRow(id)} />
        : <Button id={id} type="link" className="planning-record-link" onClick={() => openRow(id)} title={row.when}>
          <RowContent row={row} today={today} isList={false} />
          {row.recordDate === undefined ? null : <span className="planning-row-meta">{row.recordDate}</span>}
          {renderRowFacts?.(row)}
        </Button>}
      <DependencySummary row={row} id={warningId} hidden={compactWeek} />
    </div>
    <div className="planning-track" style={{ backgroundSize: `${100 / ((diffDays(window.to, window.from) + 1))}% 100%` }}>
      {current === null ? null : <span className="planning-today-line" style={{ insetInlineStart: `${current}%` }} aria-hidden="true" />}
      {row.bar === null ? null : <Interval id={intervalId} row={row} bar={row.bar} onOpen={() => openRow(intervalId)}
        warningId={warningId} compactLabel={compactIntervalLabel} />}
      {compactWeek ? <WeeklyGanttPoints {...{ row, window, id }} onOpen={openRow} />
        : row.points.map((point) => <Point key={`${point.kind}:${point.date}`} point={point} window={window} today={today} />)}
    </div>
  </>;
}

function weeklyIntervalLabel(row: PlanningRow, { bar, today }: { readonly bar: NonNullable<PlanningRow['bar']>; readonly today: LocalDate }) {
  const title = weeklyGanttTitle(row);
  if (row.source.kind === 'task') {
    const { plannedStart, plannedEnd } = row.source.item;
    const range = plannedStart === plannedEnd ? plannedStart : `${plannedStart} 至 ${plannedEnd}`;
    return `${title} · 任务计划 ${range}`;
  }
  if (row.source.kind === 'batch' && row.source.batch.kind === 'order') {
    const { confirmed } = row.source.batch.facts;
    const range = confirmed === null ? '' : ` · 采购确认 ${confirmed}，已过时段 ${addDays(confirmed, 1)} 至 ${today}`;
    return `${title} · ${bar.label}${range}`;
  }
  return `${title} · 任务计划 ${row.when}`;
}

function Interval({ id, row, bar, onOpen, warningId, compactLabel }: {
  readonly id: string; readonly row: PlanningRow; readonly bar: NonNullable<PlanningRow['bar']>; readonly onOpen: () => void; readonly warningId: string;
  readonly compactLabel: string | null;
}) {
  const title = `${row.title} ${bar.label}`;
  const status = row.source.kind === 'task' && row.status.label !== bar.label ? row.status.label : null;
  const details = row.source.kind === 'batch' ? [row.title, row.when] : [title, row.when, status];
  const button = <Button id={id} type="text" className="planning-interval" style={{
    insetInlineStart: `calc(${bar.leftPercent}% + 3px)`, width: `calc(${bar.widthPercent}% - 6px)`,
  }} aria-label={compactLabel ?? title} aria-describedby={row.dependencyConflicts?.length ? warningId : undefined}
    data-kind={row.source.kind === 'batch' ? 'overdue-delivery' : 'plan'} data-cut-start={bar.isCutStart} data-cut-end={bar.isCutEnd}
    title={compactLabel === null ? details.filter(Boolean).join(' · ') : undefined} onClick={onOpen} />;
  return <div className="planning-mark-lane">{compactLabel === null ? button
    : <Tooltip title={[compactLabel, row.risk].filter(Boolean).join(' · ')} trigger={['hover', 'focus']}>{button}</Tooltip>}</div>;
}

function Point({ point, window, today }: { readonly point: PlanningPoint; readonly window: ScheduleWindow; readonly today: LocalDate }) {
  const position = pointPosition(point.date, window);
  return <div className="planning-mark-lane">
    <span className="planning-point" style={{ insetInlineStart: `${position}%` }} data-align-end={position > 78}>
      <span className={`planning-marker planning-marker-${point.kind}`} aria-hidden="true" />
      <span>{planningPointLabel[point.kind]} <time dateTime={point.date}>{shortDate(point.date, today)}</time></span>
    </span>
  </div>;
}

function DependencySummary({ row, id, hidden }: { readonly row: PlanningRow; readonly id?: string; readonly hidden?: boolean | undefined }) {
  if (!row.dependencyConflicts?.length) return null;
  return <span id={id} className="planning-warning" hidden={hidden}>依赖冲突 · {row.dependencyConflicts.map(predecessorWarningText).join('、')}</span>;
}

function elapsedDeadlineLabel(groups: readonly PlanningGroup[]) {
  let label: string | null = null;
  for (const group of groups) {
    for (const { bar, source } of group.rows) {
      if (bar === null || source.kind !== 'batch') continue;
      if (source.batch.kind === 'order' && source.batch.weeklyDelivery?.timing === 'needs-review') return '已过采购确认日';
      label = '逾期待收';
    }
  }
  return label;
}

function PlanningLegend({ elapsedDeadlineLabel }: { readonly elapsedDeadlineLabel: string | null }) {
  return <div className="planning-legend" aria-label="甘特图图例">
    <Typography.Text><i className="planning-marker planning-marker-interval" aria-hidden="true" />任务计划</Typography.Text>
    {elapsedDeadlineLabel === null ? null : <Typography.Text><i className="planning-marker planning-marker-overdue" aria-hidden="true" />{elapsedDeadlineLabel}</Typography.Text>}
    {Object.entries(planningPointLabel).filter(([kind]) => kind !== 'milestone').map(([kind, label]) => (
      <Typography.Text key={kind}><i className={`planning-marker planning-marker-${kind}`} aria-hidden="true" />{label}</Typography.Text>
    ))}
  </div>;
}
