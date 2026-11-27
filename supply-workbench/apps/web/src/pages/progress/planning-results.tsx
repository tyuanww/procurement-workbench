import { Button, Card, Empty, Skeleton, Typography } from 'antd';
import { useId, type ReactNode } from 'react';
import type { OrderLineDetail, OrderLineRow } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import type { ScheduleQuery, ScheduleWindow } from '../../features/progress/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';
import type { PlanningToolbarSlots } from './planning-filters.js';
import { hasUnambiguousWeeklyBatch, PlanningOrderMatches, type OpenPlanningOrder } from './planning-order-results.js';
import type { PlanningDisplay, PlanningGroup, PlanningSource } from './planning-rows.js';
import { PlanningTimeline } from './progress-timeline.js';
import type { WeeklyDeliveryBucket } from './weekly-delivery.js';

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
  readonly isLoading: boolean;
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
  const { display, groups, window, today, query, keyword, lookup, orderDetail, clear, isLoading, onDisplay, onOpen, onOpenOrder, selectedRow, toolbar, errors, managementLink } = props;
  const isPhone = useShellViewport().band === 'phone';
  const titleId = useId();
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const shouldShowBatchFirst = hasUnambiguousWeeklyBatch({ groups, rows: lookup, keyword });
  const orderMatches = <PlanningOrderMatches rows={lookup} onOpen={onOpenOrder} selectedRow={selectedRow} detail={orderDetail} page={props.orderPage} onPage={props.onOrderPage} />;
  const view = isPhone ? null : <ViewSwitch<PlanningDisplay> aria-label="结果视图" value={display}
    options={[{ value: 'gantt', label: '甘特图' }, { value: 'list', label: '列表' }]} onChange={onDisplay} />;
  return <section className="planning-results" aria-label="排期结果" aria-busy={isLoading}>
    {props.weeklySummary}
    {toolbar({ resultCount: isLoading ? '正在读取' : `${total} 条排期`, managementLink })}
    {errors}
    {shouldShowBatchFirst ? null : orderMatches}
    <article aria-labelledby={titleId}>
      <Card className="planning-record-card" extra={view} classNames={{ header: 'planning-record-header', body: 'planning-record-body' }}
        title={<Typography.Title id={titleId} level={2}>任务、里程碑及批次</Typography.Title>}>
        {total === 0
          ? isLoading ? <Skeleton active paragraph={{ rows: 4 }} style={{ padding: space[2] }} />
            : <PlanningEmpty {...{ keyword, lookup, clear, query }} onClearStatus={props.onClearStatus} weeklyBucket={props.weeklyBucket} />
          : <PlanningTimeline key={props.weeklyBucket ?? 'all'} groups={groups} window={window} today={today} scale={query.scale}
            onOpen={onOpen} selectedRow={selectedRow} isList={isPhone || display === 'list'} compactWeek={props.isWeekly} />}
      </Card>
    </article>
    {shouldShowBatchFirst ? orderMatches : null}
  </section>;
}

function PlanningEmpty({ keyword, lookup, clear, query, onClearStatus, weeklyBucket }: Pick<Results, 'keyword' | 'lookup' | 'clear' | 'query' | 'onClearStatus' | 'weeklyBucket'>) {
  const { status } = query.filters;
  const hasFilters = Object.values(query.filters).some((value) => value !== null);
  const description = status !== null ? `当前筛选下没有排期。已选状态「${workItemStatusLabel(status)}」。`
    : weeklyBucket !== null ? '当前条件下暂无这类批次。'
      : hasFilters ? '当前筛选下没有排期。'
      : lookup.length > 0 ? '找到成品订单，当前日期内暂无匹配排期。'
        : keyword !== '' ? '没有找到匹配的排期。可检查关键词或日期。'
          : '当前店铺和日期内暂无排期。可切换店铺或日期。';
  return <Empty className="planning-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>
    {status !== null ? <Button onClick={onClearStatus}>清除状态筛选</Button>
      : hasFilters || keyword !== '' && lookup.length === 0 ? <Button onClick={clear}>清空筛选</Button> : null}
  </Empty>;
}
