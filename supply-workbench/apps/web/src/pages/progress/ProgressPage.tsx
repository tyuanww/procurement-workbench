import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { progressViewOf, schedulePath, scheduleRiskPath, type ProgressView } from '../../features/progress/index.js';
import { ForbiddenPage } from '../../features/shell/index.js';
import { useCan } from '../../shared/actor.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { ProgressCurrent } from './progress-current.js';
import { ProgressSchedule } from './progress-schedule.js';
import { ScheduleRisk } from './schedule-risk.js';
import { ProgressOrderScopePicker, ProgressStorePicker } from './progress-scope-pickers.js';
import { progressStoreOf, withProgressScope, withProgressStore } from './store-query.js';

export { ArrivalTag, noteBatches, pagesFor } from './progress-current.js';

export { progressViewOf, type ProgressView } from '../../features/progress/index.js';

const viewLabels: Record<ProgressView, string> = { current: '当前进度', schedule: '订单与任务排期', development: '新品开发' };
export function ProgressPage({ view: selectedView }: { readonly view?: ProgressView }): ReactNode {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const view = selectedView ?? progressViewOf(params.get('view'));
  const canSeeRisk = useCan('dashboard.read');
  if (view === 'schedule' && params.get('lens') === 'risk') {
    if (!canSeeRisk) return <ForbiddenPage />;
    return pathname === schedulePath ? <ScheduleRisk /> : <Navigate to={scheduleRiskPath(params)} replace />;
  }
  return <WorkbenchPage title={view === 'current' ? viewLabels[view] : '计划与新品'} browserTitle={viewLabels[view]}>
    <ProgressContent view={view} params={params} setParams={setParams} />
  </WorkbenchPage>;
}

function ProgressContent({ view, params, setParams }: {
  readonly view: ProgressView;
  readonly params: URLSearchParams;
  readonly setParams: ReturnType<typeof useSearchParams>[1];
}): ReactNode {
  const store = progressStoreOf(params.get('store'));
  if (view !== 'current') return <ProgressSchedule store={store}
    entry={view === 'schedule' ? 'orders' : 'development'} />;
  const picker = <ProgressStorePicker value={store} onChange={(value) => setParams(withProgressStore(params.toString(), value))} />;
  const isMine = params.get('scope') === 'mine';
  return <ProgressCurrent store={store} isMine={isMine} filters={<>
    {picker}
    <ProgressOrderScopePicker value={isMine ? 'mine' : 'all'}
      onChange={(value) => setParams(withProgressScope(params.toString(), value === 'mine'))} />
  </>} />;
}
