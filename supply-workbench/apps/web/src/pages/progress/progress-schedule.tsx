import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Result, Segmented, Select, Skeleton, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ScheduleViewSchema, type ProcurementStore } from '@sw/contracts';
import { localDate, type LocalDate } from '@sw/domain';
import type { z } from 'zod';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { businessToday } from '../../features/follow-up/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import {
  applyScheduleFilters, emptyScheduleFilters, readScheduleQuery, scheduleKpi, scheduleOptions, scheduleWindow, scheduleWindowLabel,
  shiftScheduleWindow, statusOptions, timelineOf, writeScheduleQuery,
  type ScheduleOptions, type ScheduleQuery, type ScheduleScale, type ScheduleWindow, type Timeline,
} from '../../features/progress/index.js';
import { taskIdOf, taskParam, type WorkItem } from '../../features/today/index.js';
import { MetricStrip } from '../../shared/ui/analytics.js';
import { bg, border, fontSize, radius, space, text } from '../../theme/tokens.js';
import { TaskDrawer } from '../../features/plan/index.js';
import { ProcurementSchedulePanel } from './procurement-schedule-panel.js';
import { ScheduleList, ScheduleTimeline } from './progress-timeline.js';

type ScheduleView = z.output<typeof ScheduleViewSchema>;

type ScheduleLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: ScheduleView; readonly isLoading: boolean; readonly notice: string }
  | { readonly kind: 'error'; readonly message: string };

export function ProgressSchedule({ store }: { readonly store: ProcurementStore }): ReactNode {
  const [params, setParams] = useSearchParams();
  const today = localDate(businessToday());
  const query = readScheduleQuery(params.toString(), today);
  const window = scheduleWindow(query);
  const scheduleLoad = useScheduleLoad(window, store);
  const load = scheduleLoad.load;
  const items = load.kind === 'ready' ? applyScheduleFilters({ items: load.view.items, filters: query.filters }) : [];
  const options = scheduleOptions(load.kind === 'ready' ? load.view.items : []);
  const timeline = timelineOf({ items, window, today, scale: query.scale });
  const requestedDrawer = taskIdOf(params.get('drawer'));
  const drawerId = store === 'all' || load.kind === 'ready' && load.view.items.some((item) => item.id === requestedDrawer) ? requestedDrawer : null;
  const write = (next: ScheduleQuery): void => setParams(new URLSearchParams(writeScheduleQuery({ search: params.toString(), query: next })));
  const writeDrawer = (id: string | null): void => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('drawer');
    else next.set('drawer', id.startsWith('task:') ? id : taskParam(id));
    setParams(next);
  };
  const selectOrder = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('scheduleLine');
    else next.set('scheduleLine', id);
    setParams(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <ProcurementSchedulePanel store={store} selected={params.get('scheduleLine')} onSelect={selectOrder}
        search={params.toString()} onTimelineChanged={scheduleLoad.reload} onAnchor={(anchor) => write({ ...query, anchor })} />
      <ScheduleFiltersBar query={query} window={window} today={today} options={options} onQuery={write} />
      <ScheduleKpis items={items} scale={query.scale} />
      <ScheduleBody load={load} timeline={timeline} scale={query.scale} onOpen={writeDrawer} onRetry={scheduleLoad.reload} onClear={() => write({ ...query, filters: emptyScheduleFilters() })} />
      <TaskDrawer workItemId={drawerId} isOpen={drawerId !== null} onClose={() => writeDrawer(null)} onChanged={scheduleLoad.reload} />
    </div>
  );
}

function useScheduleLoad(window: ScheduleWindow, store: ProcurementStore): { readonly load: ScheduleLoad; readonly reload: () => void } {
  const [load, setLoad] = useState<ScheduleLoad>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let isActive = true;
    setLoad((current) => (current.kind === 'ready' ? { ...current, isLoading: true, notice: '' } : { kind: 'loading' }));
    void read({ name: 'planSchedule', from: window.from, to: window.to, store })
      .then((view) => { if (isActive) setLoad({ kind: 'ready', view, isLoading: false, notice: '' }); })
      .catch((error: unknown) => {
        if (!isActive) return;
        const failure = readFailureOf(error);
        if (failure === null) return;
        const message = failureText(failure);
        setLoad((current) => (current.kind === 'ready' ? { ...current, isLoading: false, notice: message } : { kind: 'error', message }));
      });
    return () => { isActive = false; };
  }, [window.from, window.to, store, reload]);
  return { load, reload: () => setReload((value) => value + 1) };
}

function ScheduleFiltersBar(props: {
  readonly query: ScheduleQuery;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly options: ScheduleOptions;
  readonly onQuery: (query: ScheduleQuery) => void;
}): ReactNode {
  const { query, window, today, options, onQuery } = props;
  const filters = query.filters;
  return (
    <div style={filterBarStyle()}>
      <Segmented
        value={query.scale}
        options={[{ label: '周', value: 'week' }, { label: '月', value: 'month' }]}
        onChange={(value) => onQuery({ ...query, scale: scaleOf(value), anchor: window.from })}
      />
      <Button icon={<LeftOutlined />} aria-label={`上一${scaleWord(query.scale)}`} onClick={() => onQuery({ ...query, anchor: shiftScheduleWindow({ scale: query.scale, window, direction: -1 }).from })} />
      <Button icon={<RightOutlined />} aria-label={`下一${scaleWord(query.scale)}`} onClick={() => onQuery({ ...query, anchor: shiftScheduleWindow({ scale: query.scale, window, direction: 1 }).from })} />
      <Typography.Text style={rangeStyle()}>{scheduleWindowLabel({ window, today })}</Typography.Text>
      <FilterSelect label="负责人" value={filters.ownerUserId} options={options.owners} onChange={(value) => onQuery({ ...query, filters: { ...filters, ownerUserId: value } })} />
      <FilterSelect label="供应商" value={filters.supplierPartyId} options={options.suppliers} onChange={(value) => onQuery({ ...query, filters: { ...filters, supplierPartyId: value } })} />
      <FilterSelect label="工厂" value={filters.factoryPartyId} options={options.factories} onChange={(value) => onQuery({ ...query, filters: { ...filters, factoryPartyId: value } })} />
      <FilterSelect label="状态" value={filters.status} options={[...statusOptions()]} onChange={(value) => onQuery({ ...query, filters: { ...filters, status: statusOf(value) } })} />
      <Button type="link" onClick={() => onQuery({ ...query, filters: emptyScheduleFilters() })}>清空</Button>
    </div>
  );
}

function FilterSelect(props: {
  readonly label: string;
  readonly value: string | null;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string | null) => void;
}): ReactNode {
  return (
    <Select
      allowClear
      style={{ minWidth: 136 }}
      placeholder={props.label}
      aria-label={props.label}
      value={props.value ?? undefined}
      options={[...props.options]}
      onChange={(value) => props.onChange(value ?? null)}
    />
  );
}

function ScheduleKpis(props: { readonly items: readonly WorkItem[]; readonly scale: ScheduleScale }): ReactNode {
  const insight = scheduleKpi(props.items);
  return (
    <MetricStrip
      ariaLabel="总排期指标"
      items={[
        { key: 'total', label: props.scale === 'week' ? '本周任务' : '本月任务', value: insight.total, tone: 'neutral' },
        { key: 'progress', label: '进行中', value: insight.inProgress, tone: 'info' },
        { key: 'overdue', label: '逾期', value: insight.overdue, tone: 'danger' },
        { key: 'blocked', label: '阻塞', value: insight.blocked, tone: 'warning' },
      ]}
    />
  );
}

function ScheduleBody(props: {
  readonly load: ScheduleLoad;
  readonly timeline: Timeline;
  readonly scale: ScheduleScale;
  readonly onOpen: (id: string) => void;
  readonly onRetry: () => void;
  readonly onClear: () => void;
}): ReactNode {
  const isPhone = useShellViewport().band === 'phone';
  if (props.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 8 }} />;
  if (props.load.kind === 'error') return <Result status="error" title="总排期没有读出来" subTitle={props.load.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  const notice = props.load.kind === 'ready' && props.load.notice !== ''
    ? <Alert type="error" showIcon title="总排期没有读出来" description={props.load.notice} />
    : null;
  if (props.timeline.total === 0) return <EmptySchedule total={props.load.view.total} scale={props.scale} onClear={props.onClear} />;
  return (
    <div>
      {notice}
      <div style={timelineHeadStyle()}>
        <Typography.Text strong>{props.scale === 'week' ? '本周排期' : '本月排期'}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{props.timeline.total} 条 · 按负责人分组</Typography.Text>
      </div>
      {isPhone
        ? <ScheduleList timeline={props.timeline} onOpen={props.onOpen} />
        : <ScheduleTimeline timeline={props.timeline} scale={props.scale} onOpen={props.onOpen} />}
    </div>
  );
}

function EmptySchedule(props: { readonly total: number; readonly scale: ScheduleScale; readonly onClear: () => void }): ReactNode {
  if (props.total === 0) {
    return <Empty description={emptyText(props.total, props.scale)}><Button href="/imports">去导入排期里程碑</Button></Empty>;
  }
  return <Empty description={emptyText(props.total, props.scale)}><Button onClick={props.onClear}>清空筛选</Button></Empty>;
}

function emptyText(total: number, scale: ScheduleScale): string {
  if (total === 0) return `${scale === 'week' ? '本周' : '本月'}没有排期任务。下一步：导入排期里程碑。`;
  return '筛选后没有任务。下一步：清空筛选。';
}

function scaleOf(value: string | number): ScheduleScale {
  return value === 'month' ? 'month' : 'week';
}

function scaleWord(scale: ScheduleScale): string {
  return scale === 'week' ? '周' : '月';
}

function statusOf(value: string | null): ScheduleQuery['filters']['status'] {
  return value === 'planned' || value === 'in_progress' || value === 'blocked' ? value : null;
}

function filterBarStyle(): CSSProperties {
  return { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[1], padding: space[2], background: bg.surface, border: `1px solid ${border}`, borderRadius: radius };
}

function rangeStyle(): CSSProperties {
  return { minWidth: 128, color: text.primary, fontVariantNumeric: 'tabular-nums' };
}

function timelineHeadStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[1], flexWrap: 'wrap' };
}
