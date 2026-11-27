import { Alert, Button, Card, Flex, Skeleton } from 'antd';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { ProcurementStore } from '@sw/contracts';
import { localDate, type LocalDate } from '@sw/domain';
import { businessToday } from '../../features/follow-up/index.js';
import { TaskDrawer } from '../../features/plan/index.js';
import { emptyScheduleFilters, readScheduleQuery, scheduleWindow, writeScheduleQuery, type ScheduleQuery, type ScheduleWindow } from '../../features/progress/index.js';
import { useActorId, useCan } from '../../shared/actor.js';
import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { SectionTabs } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';
import { selectedPlanningBatches, type WeeklyOrderDelivery } from './planning-batches.js';
import { ManagementLink, SchedulePredecessorLink, ScheduleTaskReturnLink, useScheduleDrill } from './planning-drill.js';
import { PlanningFilters, type PlanningToolbarSlots } from './planning-filters.js';
import { useDevelopment, usePlanningOrders, useScheduleLoad, useSelectedPlanningOrder, type PlanningLoad } from './planning-load.js';
import { planningDisplay, planningScope, planningSectionOf, planningSectionPath, planningSections, type PlanningEntry, usePlanningNavigation } from './planning-navigation.js';
import { planningFilterOptions, planningGroups, type PlanningGroup, type PlanningScope } from './planning-rows.js';
import { ProcurementSchedulePanel, ScheduleOrderLink } from './procurement-schedule-panel.js';
import { DevelopmentActions, DevelopmentManagement } from './product-development-panel.js';
import { ProgressStorePicker } from './progress-scope-pickers.js';
import { matchingOrders, planningOrderPage, uniqueMatchedOrderId } from './planning-order-results.js';
import { storeLabels, withProgressStore } from './store-query.js';
import { developmentAudience, scopedDevelopment } from './planning-audience.js';
import { DevelopmentWorkspace } from './product-development-view.js';
import { tasksByBatch, weeklyDelivery, weeklyDeliveryFilterOptions, type WeeklyDeliveryBucket } from './weekly-delivery.js';
import { WeeklyDeliverySummary } from './weekly-delivery-summary.js';
import { PlanningResults } from './planning-results.js';
import './planning-workspace.css';

type Navigation = ReturnType<typeof usePlanningNavigation>;
type Resources = ReturnType<typeof usePlanningInputs>;

type RouteInput = { readonly store: ProcurementStore; readonly entry: PlanningEntry };

export function ProgressSchedule(input: RouteInput): ReactNode {
  const state = usePlanningWorkspace(input);
  const { scope, store, query, window, resources } = state;
  const batchId = state.nav.params.get('scheduleBatch');
  const predecessors = batchId === null || resources.schedule.load.kind !== 'ready' ? []
    : (resources.schedule.load.data.deliveryTasks ?? []).flatMap(({ task, dependencies }) =>
      task.batch?.id === batchId ? dependencies.map((predecessor) => predecessor.id) : []);
  const drill = useScheduleDrill({ store, items: resources.items, visiblePredecessors: predecessors });
  return <PlanningSections scope={scope}>
    <Flex vertical gap={space[2]} className="planning-workspace">
      {scope === 'development' ? <DevelopmentRoute state={state} /> : <PlanningWorkspaceBody {...state} scope={scope}
        onAnchor={(anchor) => state.write({ ...query, anchor })}
        toolbar={(slots) => <WorkspaceToolbar state={state} {...slots} />}
        managementLink={drill.isReadOnly && drill.id !== null ? null : <ManagementLink window={window} />} />}
      <TaskDrawer workItemId={drill.id} isOpen={drill.id !== null} onClose={() => drill.write(null)}
        onChanged={() => { resources.schedule.reload(); resources.detail.reload(); }}
        orderLink={(order) => <ScheduleOrderLink order={order} store={store} focusKey="planning-task" />}
        {...(drill.isReadOnly ? { readOnly: { returnLink: <ScheduleTaskReturnLink />,
          predecessorLink: (predecessor) => <SchedulePredecessorLink predecessor={predecessor} /> } } : {})} />
    </Flex>
  </PlanningSections>;
}

function usePlanningWorkspace({ store: requestedStore, entry }: RouteInput) {
  const nav = usePlanningNavigation(entry);
  const scope = planningScope(nav.params, entry);
  const store = scope === 'development' && requestedStore === 'unassigned' ? 'all' : requestedStore;
  const today = localDate(businessToday());
  const keyword = nav.params.get('planSearch') ?? '';
  const query = readScheduleQuery(nav.params.toString(), today);
  const window = scheduleWindow(query);
  const isWeekly = scope === 'orders' && query.scale === 'week';
  const resources = usePlanningInputs({ nav, store, keyword, window, scope });
  const actorId = useActorId();
  const canOversee = useCan('dashboard.read');
  const canLeadProduct = useCan('products.maintain');
  const audience = developmentAudience(resources.development, { actorId, canOversee, canLeadProduct });
  const development = scopedDevelopment(resources.development, { store, actorId: audience === 'mine' && scope === 'development' ? actorId : undefined });
  const write = (next: ScheduleQuery) => nav.update(scheduleSearch(nav.params, next));
  const clear = () => {
    const next = scheduleSearch(nav.params, { ...query, filters: emptyScheduleFilters() });
    for (const key of ['planSearch', 'planOrderPage', 'weeklyBucket', 'store', 'planRiskOnly', 'scheduleLine', 'scheduleBatch', 'scheduleBatchEntry', 'procurementTask', 'planSelected']) next.delete(key);
    nav.update(next);
  };
  return { nav, scope, store, today, keyword, query, window, resources, audience, development, write, clear, isWeekly };
}

type WorkspaceState = ReturnType<typeof usePlanningWorkspace>;

function WorkspaceStorePicker({ state }: { readonly state: WorkspaceState }) {
  const { nav, store, scope } = state;
  return <ProgressStorePicker value={store} includeUnassigned={scope !== 'development'}
    style={{ minWidth: 0 }} onChange={(value) => {
      const next = withProgressStore(nav.params.toString(), value);
      for (const key of ['scheduleLine', 'scheduleBatch', 'scheduleBatchEntry', 'procurementTask', 'planSelected', 'planOrderPage',
        'developmentProject', 'developmentNodeProject', 'developmentNode']) next.delete(key);
      nav.update(next);
    }} />;
}

function DevelopmentRoute({ state }: { readonly state: WorkspaceState }) {
  const { nav, resources: { developmentLoad, developmentStore, development: available }, development, audience } = state;
  return <>
    <LoadNotice label="新品开发" resource={developmentLoad} />
    {developmentLoad.load.kind === 'loading' ? <Card><Skeleton active paragraph={{ rows: 4 }} /></Card> : null}
    {development === null || developmentStore === null ? null : <DevelopmentWorkspace
      data={development} availableProjects={available?.projects ?? development.projects} store={developmentStore} params={nav.params} update={nav.update} open={nav.open}
      closeDevelopment={nav.closeDevelopment} reload={developmentLoad.reload} isManagement={audience === 'management'}
      isMine={audience === 'mine'} isRefreshing={developmentLoad.load.kind === 'ready' && developmentLoad.load.isRefreshing} storePicker={<WorkspaceStorePicker state={state} />} />}
  </>;
}

function WorkspaceToolbar({ state, ...slots }: PlanningToolbarSlots & { readonly state: WorkspaceState }) {
  const { nav, scope, store, keyword, query, window, today, resources, development, write, clear } = state;
  const baseOptions = planningFilterOptions(resources.items, scope === 'orders' ? [] : development?.projects ?? []);
  const options = resources.schedule.load.kind === 'ready'
    ? weeklyDeliveryFilterOptions(resources.schedule.load.data.deliveryBatches ?? [], baseOptions) : baseOptions;
  return <PlanningFilters {...slots} {...{ scope, keyword, query, window, today, clear, options }}
    storePicker={<WorkspaceStorePicker state={state} />} storeLabel={storeLabels[store]} hasStoreFilter={store !== 'all'}
    onSearch={(value) => nav.update(writeSearch(nav.params, value))} onQuery={write} />;
}

function PlanningSections({ scope, children }: { readonly scope: PlanningScope; readonly children: ReactNode }) {
  const tab = planningSectionOf(scope);
  const navigate = useNavigate();
  const { search } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(tab);
  useEffect(() => {
    const hasChanged = previous.current !== tab;
    previous.current = tab;
    const document = root.current?.ownerDocument;
    if (hasChanged && document?.activeElement === document?.body) root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, [tab]);
  return <div ref={root}><SectionTabs className="planning-sections" aria-label="计划与新品视图" activeKey={tab} extra={<ProcurementCutoff />}
    items={planningSections.map(({ key, label }) => ({ key, label, children: key === tab ? children : undefined }))}
    onChange={(key) => {
      const section = planningSections.find((item) => item.key === key);
      if (section !== undefined) void navigate(planningSectionPath({ to: section.key, search }), { preventScrollReset: true });
    }} /></div>;
}

function usePlanningInputs({ nav, store, keyword, window, scope }: {
  readonly nav: Navigation; readonly store: ProcurementStore; readonly keyword: string; readonly window: ScheduleWindow; readonly scope: PlanningScope;
}) {
  const selected = nav.params.get('scheduleLine');
  const canReadDelivery = useCan('data.read');
  const schedule = useScheduleLoad(window, { store: scope === 'development' ? null : store, includeDelivery: scope !== 'development' && canReadDelivery });
  const developmentStore = store === 'unassigned' ? null : store;
  const developmentLoad = useDevelopment(developmentStore === null ? null : 'all');
  const ordersLoad = usePlanningOrders(store, scope !== 'development' && keyword !== '');
  const orders = ordersLoad.load.kind === 'ready' ? ordersLoad.load.data : [];
  const lookup = matchingOrders(orders, keyword);
  const detail = useSelectedPlanningOrder(store, selected ?? uniqueMatchedOrderId(lookup));
  return {
    schedule, developmentLoad, developmentStore, ordersLoad, detail, selected,
    items: schedule.load.kind === 'ready' ? schedule.load.data.items : [],
    development: developmentLoad.load.kind === 'ready' ? developmentLoad.load.data : null,
    orders, lookup,
  };
}

type WorkspaceBody = {
  readonly nav: Navigation;
  readonly scope: Exclude<PlanningScope, 'development'>;
  readonly keyword: string;
  readonly query: ScheduleQuery;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly resources: Resources;
  readonly store: ProcurementStore;
  readonly clear: () => void;
  readonly onAnchor: (date: LocalDate) => void;
  readonly write: (query: ScheduleQuery) => void;
  readonly development: Resources['development'];
  readonly isWeekly: boolean;
  readonly toolbar: (slots: PlanningToolbarSlots) => ReactNode;
  readonly managementLink: ReactNode;
};

function PlanningWorkspaceBody(props: WorkspaceBody): ReactNode {
  const { nav, scope, keyword, query, window, today, resources, clear, write, toolbar, managementLink } = props;
  const { schedule, developmentLoad, developmentStore, detail, ordersLoad, lookup } = resources;
  const { orderDetail, groups, weekly, bucket, deliveryTasks } = usePlanningResults(props);
  const errors = <PlanningNotices {...{ scope, schedule, developmentLoad, developmentStore, ordersLoad, keyword }} />;
  return <>
    <PlanningResults {...{ groups, window, today, clear, keyword, query, lookup, toolbar, errors, managementLink, orderDetail }}
      display={planningDisplay(nav.params)} isWeekly={props.isWeekly} weeklyBucket={bucket}
      weeklySummary={weekly === null ? null : <WeeklyDeliverySummary delivery={weekly} bucket={bucket}
        onBucket={(next) => nav.write('weeklyBucket', next)} />}
      isLoading={loadingPlan(props)} onClearStatus={() => write({ ...query, filters: { ...query.filters, status: null } })}
      onDisplay={(value) => nav.write('planDisplay', value === 'gantt' ? null : value)}
      onOpen={nav.open} onOpenOrder={nav.openOrder} selectedRow={nav.params.get('planSelected')}
      orderPage={planningOrderPage(nav.params.get('planOrderPage'))}
      onOrderPage={(page) => nav.write('planOrderPage', page === 1 ? null : String(page))} />
    <PlanningOrderDrawer {...{ nav, today, store: props.store, selected: resources.selected, onAnchor: props.onAnchor, detail }}
      onTimelineChanged={() => { schedule.reload(); developmentLoad.reload(); }}
      batchDependencies={weekly?.batchDependencies ?? tasksByBatch(deliveryTasks)} weeklyBatch={weekly?.batchActions.get(nav.params.get('scheduleBatch') ?? '')} />
    {planningDevelopmentPanels(props, groups)}
  </>;
}

function usePlanningResults(props: WorkspaceBody) {
  const { nav, keyword, query, window, today, resources, isWeekly } = props;
  const { schedule, detail, orders, items } = resources;
  const { dependencyConflicts: conflicts = {}, deliveryBatches, deliveryTasks = [] } = loadedPlanningData(schedule.load) ?? {};
  const orderDetail = loadedPlanningData(detail.load);
  const resultGroups = useBasePlanningGroups(props, { orderDetail, conflicts, deliveryBatches, deliveryTasks });
  const bucket = readWeeklyBucket(isWeekly ? nav.params.get('weeklyBucket') : null);
  const weekly = isWeekly && deliveryBatches !== undefined ? weeklyDelivery({
    batches: deliveryBatches, deliveryTasks,
    window, today, filters: query.filters, keyword, orders, items, conflicts, bucket,
  }) : null;
  const groups = weekly === null ? resultGroups : mergeWeeklyGroups(weekly.groups, bucket === null ? resultGroups : []);
  return { orderDetail, groups, weekly, bucket, deliveryTasks };
}

function useBasePlanningGroups({ scope, keyword, query, window, today, resources, development, isWeekly }: WorkspaceBody,
  { orderDetail, conflicts, deliveryBatches, deliveryTasks }: {
    readonly orderDetail: Extract<Resources['detail']['load'], { kind: 'ready' }>['data'] | null;
    readonly conflicts: Extract<Resources['schedule']['load'], { kind: 'ready' }>['data']['dependencyConflicts'];
    readonly deliveryBatches: Extract<Resources['schedule']['load'], { kind: 'ready' }>['data']['deliveryBatches'];
    readonly deliveryTasks: Extract<Resources['schedule']['load'], { kind: 'ready' }>['data']['deliveryTasks'];
  }) {
  const { items, orders } = resources;
  const selectedDetail = resources.selected !== null && !isWeekly ? orderDetail : null;
  return useMemo(() => planningGroups({ scope, items, development, orders, window, today,
    selectedBatches: selectedDetail === null ? [] : selectedPlanningBatches(selectedDetail), deliveryBatches, deliveryTasks,
    filters: query.filters, query: keyword, conflicts }), [scope, items, development, orders, window.from, window.to, today, selectedDetail, deliveryBatches, deliveryTasks, query.filters, keyword, conflicts]);
}

function loadedPlanningData<T>(load: PlanningLoad<T>): T | null {
  return load.kind === 'ready' ? load.data : null;
}

function readWeeklyBucket(value: string | null): WeeklyDeliveryBucket | null {
  return value === 'expected' || value === 'outstanding' || value === 'nextRisk' ? value : null;
}

function mergeWeeklyGroups(weekly: readonly PlanningGroup[], groups: readonly PlanningGroup[]) {
  const weeklyRows = new Set(weekly.flatMap(({ rows }) => rows.map(({ id }) => id)));
  return [...weekly, ...groups.flatMap((group) => {
    const rows = group.rows.filter((row) => !weeklyRows.has(row.id));
    return rows.length === 0 ? [] : [{ ...group, rows }];
  })];
}

function PlanningOrderDrawer({ nav, today, store, selected, onAnchor, onTimelineChanged, detail, batchDependencies, weeklyBatch }: Pick<WorkspaceBody, 'nav' | 'today' | 'store' | 'onAnchor'>
  & Pick<Resources, 'selected' | 'detail'> & {
    readonly onTimelineChanged: () => void;
    readonly batchDependencies: ReturnType<typeof weeklyDelivery>['batchDependencies'] | undefined;
    readonly weeklyBatch: WeeklyOrderDelivery | undefined;
  }) {
  if (selected === null) return null;
  return <ProcurementSchedulePanel store={store} today={today} selected={selected} onClose={nav.closeOrder} onAnchor={onAnchor}
    onTimelineChanged={onTimelineChanged} detail={detail} batchDependencies={batchDependencies} weeklyBatch={weeklyBatch}
    selectedBatch={nav.params.get('developmentNode') === null ? nav.params.get('scheduleBatch') : null}
    onCloseBatch={nav.params.has('scheduleBatchEntry') ? nav.closeOrder : () => nav.write('scheduleBatch', null)} />;
}

function planningDevelopmentPanels({ nav, scope, development, resources: { developmentStore, developmentLoad } }: WorkspaceBody, groups: readonly PlanningGroup[]) {
  if (development === null || developmentStore === null) return null;
  const visibleNodes = new Set(groups.flatMap((group) => group.rows.flatMap((row) => row.source.kind === 'development' ? [row.source.node.id] : [])));
  const project = development.projects.find((entry) => entry.id === nav.params.get('developmentProject')) ?? development.projects[0];
  const props = {
    data: development, store: developmentStore, project, visibleNodes, params: nav.params, update: nav.update,
    open: nav.open, onClose: nav.closeDevelopment, reload: developmentLoad.reload, isScopeVisible: scope !== 'orders',
  };
  return <>{scope === 'all' ? <DevelopmentManagement {...props} showPriority={false} /> : null}<DevelopmentActions {...props} /></>;
}

function loadingPlan({ scope, resources: { schedule, developmentStore, developmentLoad, ordersLoad }, keyword }: WorkspaceBody): boolean {
  return schedule.load.kind === 'loading'
    || scope !== 'orders' && developmentStore !== null && developmentLoad.load.kind === 'loading'
    || keyword !== '' && ordersLoad.load.kind === 'loading';
}

function PlanningNotices({ scope, schedule, developmentLoad, developmentStore, ordersLoad, keyword }:
  Pick<WorkspaceBody, 'scope' | 'keyword'> & Pick<Resources, 'schedule' | 'developmentLoad' | 'developmentStore' | 'ordersLoad'>): ReactNode {
  return <>
    <LoadNotice label="订单与任务排期" resource={schedule} />
    {scope === 'orders' || developmentStore === null ? null : <LoadNotice label="新品排期" resource={developmentLoad} />}
    {keyword === '' ? null : <LoadNotice label="成品订单" resource={ordersLoad} />}
  </>;
}

function LoadNotice({ label, resource: { load, reload } }: {
  readonly label: string; readonly resource: { readonly load: PlanningLoad<unknown>; readonly reload: () => void };
}) {
  const message = load.kind === 'error' ? load.message : load.kind === 'ready' ? load.notice : null;
  return message === null ? null : <Alert type="error" showIcon title={`${label}读取失败`} description={message}
    action={<Button onClick={reload}>重试</Button>} />;
}

function scheduleSearch(params: URLSearchParams, query: ScheduleQuery): URLSearchParams {
  const next = new URLSearchParams(writeScheduleQuery({ search: params.toString(), query }));
  const view = params.get('view');
  if (view === null) next.delete('view');
  else next.set('view', view);
  return next;
}

function writeSearch(params: URLSearchParams, keyword: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if ((params.get('planSearch') ?? '') !== keyword) next.delete('planOrderPage');
  if (keyword === '') next.delete('planSearch');
  else next.set('planSearch', keyword);
  return next;
}
