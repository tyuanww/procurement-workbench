import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Alert, Button, Card, Collapse, Empty, Flex, Result, Select, Skeleton, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ScheduleViewSchema, type ProcurementStore } from '@sw/contracts';
import { localDate, type LocalDate } from '@sw/domain';
import type { z } from 'zod';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { useCan } from '../../shared/actor.js';
import { businessToday } from '../../features/follow-up/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import {
  applyScheduleFilters, emptyScheduleFilters, readScheduleQuery, scheduleKpi, scheduleOptions, scheduleWindow,
  statusOptions, timelineOf, writeScheduleQuery,
  type ScheduleOptions, type ScheduleQuery, type ScheduleScale, type ScheduleWindow, type Timeline,
} from '../../features/progress/index.js';
import { taskIdOf, taskParam, type WorkItem } from '../../features/today/index.js';
import { MetricStrip } from '../../shared/ui/analytics.js';
import { space } from '../../theme/tokens.js';
import { TaskDrawer } from '../../features/plan/index.js';
import { ProcurementSchedulePanel } from './procurement-schedule-panel.js';
import { ScheduleList, ScheduleTimeline } from './progress-timeline.js';
import { ScheduleWindowControls } from './schedule-window-controls.js';

type ScheduleView = z.output<typeof ScheduleViewSchema>;

type ScheduleLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: ScheduleView; readonly isLoading: boolean; readonly notice: string }
  | { readonly kind: 'error'; readonly message: string };

export function ProgressSchedule({ store, filters }: { readonly store: ProcurementStore; readonly filters: ReactNode }): ReactNode {
  const [params, setParams] = useSearchParams();
  const isPhone = useShellViewport().band === 'phone';
  const today = localDate(businessToday());
  const query = readScheduleQuery(params.toString(), today);
  const window = scheduleWindow(query);
  const scheduleLoad = useScheduleLoad(window, store);
  const load = scheduleLoad.load;
  const items = load.kind === 'ready' ? applyScheduleFilters({ items: load.view.items, filters: query.filters }) : [];
  const options = scheduleOptions(load.kind === 'ready' ? load.view.items : []);
  const timeline = timelineOf({
    items, window, today, scale: query.scale,
    dependencyConflicts: load.kind === 'ready' ? load.view.dependencyConflicts : {},
  });
  const requestedDrawer = taskIdOf(params.get('drawer'));
  const drawerId = store === 'all' || load.kind === 'ready' && load.view.items.some((item) => item.id === requestedDrawer) ? requestedDrawer : null;
  const write = (next: ScheduleQuery): void => setParams(new URLSearchParams(writeScheduleQuery({ search: params.toString(), query: next })));
  const writeDrawer = (id: string | null): void => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('drawer');
    else next.set('drawer', id.startsWith('task:') ? id : taskParam(id));
    setParams(next);
  };
  const metrics = load.kind === 'ready' ? <ScheduleKpis items={items} scale={query.scale} /> : null;
  return (
    <Flex vertical gap={space[3]}>
      <ScheduleFiltersBar query={query} window={window} today={today} options={options} onQuery={write} isPhone={isPhone} filters={filters} />
      {metrics}
      <ScheduleBody load={load} timeline={timeline} scale={query.scale} onOpen={writeDrawer} onRetry={scheduleLoad.reload} onClear={() => write({ ...query, filters: emptyScheduleFilters() })} />
      <ProcurementSchedulePanel key={store} store={store} selected={params.get('scheduleLine')} onSelect={(id) => setParams(withScheduleLine(params, id))}
        search={params.toString()} onTimelineChanged={scheduleLoad.reload} onAnchor={(anchor) => write({ ...query, anchor })} />
      <TaskDrawer workItemId={drawerId} isOpen={drawerId !== null} onClose={() => writeDrawer(null)} onChanged={scheduleLoad.reload} />
    </Flex>
  );
}

function withScheduleLine(params: URLSearchParams, id: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (id === null) next.delete('scheduleLine');
  else next.set('scheduleLine', id);
  return next;
}

function useScheduleLoad(window: ScheduleWindow, store: ProcurementStore): { readonly load: ScheduleLoad; readonly reload: () => void } {
  const scope = `${store}:${window.from}:${window.to}`;
  const [result, setResult] = useState<{ readonly scope: string; readonly load: ScheduleLoad }>({ scope, load: { kind: 'loading' } });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let isActive = true;
    setResult((current) => ({ scope, load: current.scope === scope && current.load.kind === 'ready'
      ? { ...current.load, isLoading: true, notice: '' } : { kind: 'loading' } }));
    void read({ name: 'planSchedule', from: window.from, to: window.to, store })
      .then((view) => { if (isActive) setResult({ scope, load: { kind: 'ready', view, isLoading: false, notice: '' } }); })
      .catch((error: unknown) => {
        if (!isActive) return;
        const failure = readFailureOf(error);
        if (failure === null) return;
        const message = failureText(failure);
        setResult((current) => ({ scope, load: current.load.kind === 'ready'
          ? { ...current.load, isLoading: false, notice: message } : { kind: 'error', message } }));
      });
    return () => { isActive = false; };
  }, [window.from, window.to, store, scope, reload]);
  return { load: result.scope === scope ? result.load : { kind: 'loading' }, reload: () => setReload((value) => value + 1) };
}

function ScheduleFiltersBar(props: {
  readonly query: ScheduleQuery;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly options: ScheduleOptions;
  readonly onQuery: (query: ScheduleQuery) => void;
  readonly isPhone: boolean;
  readonly filters: ReactNode;
}): ReactNode {
  const { query, window, today, options, onQuery, isPhone, filters } = props;
  const extra = <ScheduleSecondaryFilters query={query} options={options} onQuery={onQuery} />;
  const applied = Object.values(query.filters).filter((value) => value !== null).length;
  return (
    <Card size="small">
      <Flex vertical gap={space[2]}>
        <Flex wrap align="center" gap={space[2]}>{filters}{isPhone ? null : extra}<ProcurementCutoff /></Flex>
        {isPhone ? <Collapse ghost size="small" items={[{
          key: 'filters',
          label: applied === 0 ? '更多筛选' : `更多筛选（${applied}）`,
          children: <Flex wrap align="center" gap={space[2]}>{extra}</Flex>,
        }]} /> : null}
        <ScheduleWindowControls label="排期刻度" scale={query.scale} window={window} today={today}
          onScale={(scale) => onQuery({ ...query, scale })}
          onAnchor={(anchor) => onQuery({ ...query, anchor })} />
      </Flex>
    </Card>
  );
}

function ScheduleSecondaryFilters({ query, options, onQuery }: {
  readonly query: ScheduleQuery;
  readonly options: ScheduleOptions;
  readonly onQuery: (query: ScheduleQuery) => void;
}) {
  const filters = query.filters;
  return <>
    <FilterSelect label="负责人" value={filters.ownerUserId} options={options.owners} onChange={(value) => onQuery({ ...query, filters: { ...filters, ownerUserId: value } })} />
    <FilterSelect label="供应商" value={filters.supplierPartyId} options={options.suppliers} onChange={(value) => onQuery({ ...query, filters: { ...filters, supplierPartyId: value } })} />
    <FilterSelect label="工厂" value={filters.factoryPartyId} options={options.factories} onChange={(value) => onQuery({ ...query, filters: { ...filters, factoryPartyId: value } })} />
    <FilterSelect label="状态" value={filters.status} options={statusOptions()} onChange={(value) => onQuery({ ...query, filters: { ...filters, status: statusOf(value) } })} />
    {Object.values(filters).some((value) => value !== null) ? <Button onClick={() => onQuery({ ...query, filters: emptyScheduleFilters() })}>清空筛选</Button> : null}
  </>;
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
        { key: 'total', label: props.scale === 'week' ? '所选周任务' : '所选月任务', value: insight.total, tone: 'neutral' },
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
  const notice = props.load.notice !== ''
    ? <Alert type="error" showIcon title="总排期没有读出来" description={props.load.notice} />
    : null;
  if (props.timeline.total === 0) return <>{notice}<EmptySchedule total={props.load.view.total} onClear={props.onClear} /></>;
  return (
    <div>
      {notice}
      {props.load.isLoading ? <Typography.Paragraph role="status" type="secondary">正在更新排期</Typography.Paragraph> : null}
      {isPhone
        ? <ScheduleList timeline={props.timeline} onOpen={props.onOpen} />
        : <ScheduleTimeline timeline={props.timeline} scale={props.scale} onOpen={props.onOpen} />}
    </div>
  );
}

function EmptySchedule(props: { readonly total: number; readonly onClear: () => void }): ReactNode {
  const canReadImports = useCan('imports.read');
  if (props.total === 0) {
    return <Empty description="所选期间没有排期任务。">{canReadImports ? <Button href="/imports">去导入排期里程碑</Button> : null}</Empty>;
  }
  return <Empty description="筛选后没有任务。下一步：清空筛选。"><Button onClick={props.onClear}>清空筛选</Button></Empty>;
}

function statusOf(value: string | null): ScheduleQuery['filters']['status'] {
  return value === 'planned' || value === 'in_progress' || value === 'blocked' ? value : null;
}
