import { Button, Card, Empty, Skeleton, Typography } from 'antd';
import { useId, type ReactNode } from 'react';
import type { OrderLineDetail, OrderLineRow } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import type { ScheduleQuery, ScheduleWindow } from '../../features/progress/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { useCan } from '../../shared/actor.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';
import type { PlanningToolbarSlots } from './planning-filters.js';
import { hasUnambiguousWeeklyBatch, PlanningOrderMatches, type OpenPlanningOrder } from './planning-order-results.js';
import type { PlanningDisplay, PlanningGroup, PlanningSource } from './planning-rows.js';
import { PlanningTimeline } from './progress-timeline.js';
import type { WeeklyDeliveryBucket } from './weekly-delivery.js';

export type PlanningResultState = 'loading' | 'failed' | 'ready';

type Results = {
  readonly display: PlanningDisplay;
  readonly isWeekly: boolean;
  readonly groups: readonly PlanningGroup[];
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly query: ScheduleQuery;
  readonly keyword: string;
  readonly lookup: readonly OrderLineRow[];
  readonly orderDetail: OrderLineDetail | null;
  readonly clear: () => void;
  readonly resultState: PlanningResultState;
  readonly onClearStatus: () => void;
  readonly onDisplay: (display: PlanningDisplay) => void;
  readonly onOpen: (source: PlanningSource, triggerId: string) => void;
  readonly selectedRow: string | null;
  readonly onOpenOrder: OpenPlanningOrder;
  readonly orderPage: number;
  readonly onOrderPage: (page: number) => void;
  readonly toolbar: (slots: PlanningToolbarSlots) => ReactNode;
  readonly errors: ReactNode;
  readonly managementLink: ReactNode;
  readonly weeklySummary: ReactNode;
  readonly weeklyBucket: WeeklyDeliveryBucket | null;
};

export function PlanningResults(props: Results) {
  const { groups, keyword, lookup, orderDetail, resultState, onOpenOrder, selectedRow, toolbar, errors, managementLink } = props;
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const shouldShowBatchFirst = hasUnambiguousWeeklyBatch({ groups, rows: lookup, keyword });
  const orderMatches = <PlanningOrderMatches rows={lookup} onOpen={onOpenOrder} selectedRow={selectedRow} detail={orderDetail} page={props.orderPage} onPage={props.onOrderPage} />;
  const resultCount = resultState === 'loading' ? '正在读取'
    : resultState === 'failed' && total === 0 ? '读取失败' : `${total} 条排期`;
  return <section className="planning-results" aria-label="排期结果" aria-busy={resultState === 'loading'}>
    {props.weeklySummary}
    {toolbar({ resultCount, managementLink })}
    {errors}
    {shouldShowBatchFirst ? null : orderMatches}
    <PlanningRecordCard {...props} hasRows={total > 0} />
    {shouldShowBatchFirst ? orderMatches : null}
  </section>;
}

function PlanningRecordCard(props: Pick<Results, 'display' | 'groups' | 'window' | 'today' | 'query' | 'keyword' | 'lookup' | 'clear' |
  'resultState' | 'onDisplay' | 'onOpen' | 'selectedRow' | 'weeklyBucket' | 'onClearStatus' | 'isWeekly'> & { readonly hasRows: boolean }) {
  const { display, groups, window, today, query, keyword, lookup, clear, resultState, onDisplay, onOpen, selectedRow, weeklyBucket } = props;
  const isPhone = useShellViewport().band === 'phone';
  const titleId = useId();
  if (resultState === 'failed' && !props.hasRows) return null;
  const view = isPhone ? null : <ViewSwitch<PlanningDisplay> aria-label="结果视图" value={display}
    options={[{ value: 'gantt', label: '甘特图' }, { value: 'list', label: '列表' }]} onChange={onDisplay} />;
  return <article aria-labelledby={titleId}>
    <Card className="planning-record-card" extra={view} classNames={{ header: 'planning-record-header', body: 'planning-record-body' }}
      title={<Typography.Title id={titleId} level={2}>任务、里程碑及批次</Typography.Title>}>
      {props.hasRows
        ? <PlanningTimeline key={weeklyBucket ?? 'all'} groups={groups} window={window} today={today} scale={query.scale}
          onOpen={onOpen} selectedRow={selectedRow} isList={isPhone || display === 'list'} compactWeek={props.isWeekly} />
        : resultState === 'loading' ? <Skeleton active paragraph={{ rows: 4 }} style={{ padding: space[2] }} />
          : <PlanningEmpty {...{ keyword, lookup, clear, query, weeklyBucket }} onClearStatus={props.onClearStatus} />}
    </Card>
  </article>;
}

function PlanningEmpty({ keyword, lookup, clear, query, onClearStatus, weeklyBucket }: Pick<Results, 'keyword' | 'lookup' | 'clear' | 'query' | 'onClearStatus' | 'weeklyBucket'>) {
  const canReadImports = useCan('imports.read');
  const { status } = query.filters;
  const hasFilters = Object.values(query.filters).some((value) => value !== null);
  let description = '当前店铺和日期内暂无排期。可切换店铺或日期。';
  let action: ReactNode = null;
  const clearFilters = <Button onClick={clear}>清空筛选</Button>;
  if (status !== null) {
    description = `当前筛选下没有排期。已选状态「${workItemStatusLabel(status)}」。`;
    action = <Button onClick={onClearStatus}>清除状态筛选</Button>;
  } else if (weeklyBucket !== null) {
    description = '当前条件下暂无这类批次。';
    if (hasFilters || (keyword !== '' && lookup.length === 0)) action = clearFilters;
  } else if (hasFilters) {
    description = '当前筛选下没有排期。';
    action = clearFilters;
  } else if (lookup.length > 0) {
    description = '找到成品订单，当前日期内暂无匹配排期。';
  } else if (keyword !== '') {
    description = '没有找到匹配的排期。可检查关键词或日期。';
    action = clearFilters;
  } else if (canReadImports) {
    action = <Button href="/imports">去导入排期里程碑</Button>;
  }
  return <Empty className="planning-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>{action}</Empty>;
}
