import { Button, Flex, Result, Skeleton, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import type { ProjectProgress } from '@sw/contracts';
import { DashboardChrome, dashboardQuery, dashboardSearch, type DashboardPatch, type DashboardQuery } from '../../features/performance/index.js';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { space } from '../../theme/tokens.js';
import { ScheduleRiskPanel } from './schedule-risk-panel.js';
import { scheduleReturnPath, scheduleRiskLabel } from '../../features/progress/index.js';
import { isFilteredRisk, riskScopeLabels, riskScopeOf, scopeProjectProgress, useRiskScopeData, type ScheduleRiskScope } from './schedule-risk-scope.js';
import type { ScheduleWindow } from '../../features/progress/index.js';

type RiskLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly project: ProjectProgress };

export function ScheduleRisk(): ReactNode {
  const [params, setParams] = useSearchParams();
  const { pathname, state } = useLocation();
  const [now] = useState(() => new Date());
  const query: DashboardQuery = { ...dashboardQuery(params.toString(), now), view: 'project' };
  const fixed = new URLSearchParams(params);
  fixed.set('preset', query.preset);
  fixed.set('from', query.from);
  fixed.set('to', query.to);
  if (fixed.toString() !== params.toString()) {
    return <Navigate replace to={{ pathname, search: fixed.toString() }} state={state} />;
  }
  const onSearch = (patch: DashboardPatch): void => {
    const period = new URLSearchParams(dashboardSearch({ current: params.toString(), now, patch }));
    const next = new URLSearchParams(params);
    for (const key of ['preset', 'from', 'to']) {
      const value = period.get(key);
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    for (const key of ['risk', 'riskGroup', 'riskPage', 'groupPage']) next.delete(key);
    setParams(next);
  };
  return (
    <WorkbenchPage title={scheduleRiskLabel} showIdentity>
      <Flex vertical gap={space[3]}>
        <Link to={scheduleReturnPath(params, query)}>返回订单与任务排期</Link>
        <DashboardChrome query={query} onSearch={onSearch} />
        <RiskBody key={`${query.from}:${query.to}:${params.get('scheduleReturn') ?? ''}`}
          window={query} scope={riskScopeOf(params, query)} />
      </Flex>
    </WorkbenchPage>
  );
}

function RiskBody({ window, scope }: { readonly window: ScheduleWindow; readonly scope: ScheduleRiskScope }): ReactNode {
  const { from, to } = window;
  const scopes = useRiskScopeData({ scope, window });
  const [load, setLoad] = useState<RiskLoad>({ kind: 'loading' });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void read({ name: 'planProgress', from, to, signal: abort.signal }).then(
      (project) => { if (!abort.signal.aborted) setLoad({ kind: 'ready', project }); },
      (error: unknown) => {
        if (abort.signal.aborted) return;
        const failure = readFailureOf(error);
        setLoad({ kind: 'error', message: failure === null ? '请重试读取。' : failureText(failure) });
      },
    );
    return () => abort.abort();
  }, [from, to, attempt]);
  const project = load.kind === 'ready' ? load.project : null;
  const labels = riskScopeLabels(scope, project);
  const isFiltered = isFilteredRisk(scope);
  const reload = () => { setLoad({ kind: 'loading' }); retry((value) => value + 1); scopes.retry(); };
  const error = load.kind === 'error' ? load.message : scopes.error
    ?? (isFiltered && project !== null && project.details === undefined ? '没有读到所选范围的任务明细。' : null);
  return <>
    <Typography.Text type="secondary" style={{ overflowWrap: 'anywhere' }}>
      {from} 至 {to} · {labels.join(' · ')}
    </Typography.Text>
    {error !== null ? <Result status="error" title="排期任务进度没有读出来" subTitle={error}
      extra={<Button type="primary" onClick={reload}>重试</Button>} />
      : project === null || scopes.loading ? <Skeleton active paragraph={{ rows: 8 }} />
        : <ScheduleRiskPanel project={scopeProjectProgress({ project, scope, window, data: scopes })} scopeLabels={labels} isFiltered={isFiltered} />}
  </>;
}
