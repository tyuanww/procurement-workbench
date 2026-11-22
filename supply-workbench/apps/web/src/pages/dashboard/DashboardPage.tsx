import { Alert, Button, Empty, Result, Skeleton, Tabs } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import {
  DASHBOARD_VIEWS,
  buyerView,
  dashboardQuery,
  dashboardSearch,
  loadDashboard,
  loadStuck,
  supplierView,
  type DashboardLoad,
  type DashboardPatch,
  type DashboardView,
} from '../../features/performance/index.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { fontSize, space, text } from '../../theme/tokens.js';
import { BuyerPanel } from './BuyerPanel.js';
import { BuyerLoadSummary, SupplierRateChart } from './dashboard-charts.js';
import { ProjectProgressPanel } from './ProjectProgressPanel.js';
import { ManagementMeetingPanel } from './ManagementMeetingPanel.js';
import { DashboardChrome } from './DashboardChrome.js';
import { StuckPanel } from './StuckPanel.js';
import { SupplierPanel } from './SupplierPanel.js';

const VIEW_LABEL: Record<DashboardView, string> = {
  stuck: '卡点',
  suppliers: '供应商表现',
  buyers: '采购负荷',
  project: '项目进度',
  meeting: '管理周会',
};

type BoardState<T> = {
  readonly loaded: T | null;
  readonly error: string | undefined;
  readonly isUpdating: boolean;
};

type BoardLoad<T> = {
  readonly state: BoardState<T>;
  readonly reload: () => void;
};

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [now] = useState(() => new Date());
  const query = dashboardQuery(params.toString(), now);
  const { from, to, lane, stage, bucket, cause, card, page, view } = query;
  const performance = useCallback(() => loadDashboard({ from, to, lane }), [from, to, lane]);
  const stuck = useCallback(
    () => loadStuck({ from, to, lane, stage, bucket, cause, card, page }),
    [from, to, lane, stage, bucket, cause, card, page],
  );
  const performanceBoard = useBoardLoad(performance, view !== 'meeting' && view !== 'stuck');
  const stuckBoard = useBoardLoad(stuck, view === 'stuck');
  const onSearch = (patch: DashboardPatch): void => {
    setParams(dashboardSearch({ current: params.toString(), now, patch }));
  };
  return (
    <WorkbenchPage title="管理看板">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {query.view === 'meeting' ? null : <DashboardChrome query={query} onSearch={onSearch} />}
        <ViewTabs view={query.view} onSearch={onSearch}>
          {view === 'meeting' ? <ManagementMeetingPanel now={now} /> : view === 'stuck' ? (
            <BoardBody board={stuckBoard.state} onRetry={stuckBoard.reload}>
              {(data, isUpdating) => <StuckPanel data={data} query={query} now={now} onSearch={onSearch} isUpdating={isUpdating} />}
            </BoardBody>
          ) : (
            <BoardBody board={performanceBoard.state} onRetry={performanceBoard.reload} keepOnError>
              {(loaded) => <ActiveView view={view} loaded={loaded} onSearch={onSearch} />}
            </BoardBody>
          )}
        </ViewTabs>
      </div>
    </WorkbenchPage>
  );
}

function useBoardLoad<T>(load: () => Promise<T>, isEnabled: boolean): BoardLoad<T> {
  const [result, setResult] = useState<{
    readonly load: () => Promise<T>;
    readonly revision: number;
    readonly loaded: T | null;
    readonly error: string | undefined;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!isEnabled) return;
    let isCurrent = true;
    load().then(
      (loaded) => {
        if (isCurrent) setResult({ load, revision, loaded, error: undefined });
      },
      (error: unknown) => {
        if (isCurrent) setResult((previous) => ({ load, revision, loaded: previous?.loaded ?? null, error: boardFailure(error) }));
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [load, revision, isEnabled]);
  const isUpdating = result?.load !== load || result.revision !== revision;
  return {
    state: { loaded: result?.loaded ?? null, error: isUpdating ? undefined : result.error, isUpdating },
    reload: () => setRevision((value) => value + 1),
  };
}

function boardFailure(error: unknown): string {
  const failure = readFailureOf(error);
  return failure === null ? '看板没有载入' : failureText(failure);
}

function BoardNotice(props: { readonly board: BoardState<unknown> }) {
  if (props.board.loaded !== null && props.board.isUpdating) {
    return (
      <p role="status" style={{ margin: 0, color: text.secondary, fontSize: fontSize.body }}>
        数据在更新
      </p>
    );
  }
  if (props.board.error !== undefined)
    return <Alert type="error" showIcon title={props.board.error} />;
  return null;
}

function BoardBody<T>(props: {
  readonly board: BoardState<T>;
  readonly onRetry: () => void;
  readonly children: (loaded: T, isUpdating: boolean) => ReactNode;
  readonly keepOnError?: boolean;
}) {
  const { loaded, error, isUpdating } = props.board;
  if (error !== undefined && (loaded === null || !props.keepOnError)) {
    return (
      <Result
        status="error"
        title="看板没有读出来"
        subTitle={error}
        extra={[
          <Button key="retry" type="primary" onClick={props.onRetry}>重试</Button>,
          <Button key="back" onClick={() => window.history.back()}>返回</Button>,
        ]}
      />
    );
  }
  if (loaded === null) return <Skeleton active paragraph={{ rows: 8 }} />;
  return <>
    <BoardNotice board={props.board} />
    {props.children(loaded, isUpdating)}
  </>;
}

function ActiveView(props: {
  readonly view: Exclude<DashboardView, 'stuck' | 'meeting'>;
  readonly loaded: DashboardLoad;
  readonly onSearch: (patch: DashboardPatch) => void;
}) {
  if (props.view === 'suppliers') return <SupplierBoard loaded={props.loaded} onSearch={props.onSearch} />;
  if (props.view === 'buyers') return <BuyerBoard loaded={props.loaded} onSearch={props.onSearch} />;
  return <ProjectProgressPanel project={props.loaded.project} />;
}

function SupplierBoard(props: { readonly loaded: DashboardLoad; readonly onSearch: (patch: DashboardPatch) => void }) {
  const rows = supplierView({ rows: props.loaded.suppliers });
  if (rows.length === 0) return <Empty description="这段时间没有供应商数据。下一步：换个周期或线别。"><Button onClick={() => props.onSearch({ view: 'stuck' })}>去看卡点</Button></Empty>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <SupplierRateChart inputs={props.loaded.suppliers} />
      <SupplierPanel rows={rows} />
    </div>
  );
}

function BuyerBoard(props: { readonly loaded: DashboardLoad; readonly onSearch: (patch: DashboardPatch) => void }) {
  const rows = buyerView({ rows: props.loaded.buyers });
  if (rows.length === 0) return <Empty description="这段时间没有采购负荷数据。下一步：换个周期或线别。"><Button onClick={() => props.onSearch({ view: 'stuck' })}>去看卡点</Button></Empty>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <BuyerLoadSummary inputs={props.loaded.buyers} unassignedExceptions={props.loaded.unassignedExceptions} />
      <BuyerPanel rows={rows} unassignedExceptions={props.loaded.unassignedExceptions} />
    </div>
  );
}

function ViewTabs(props: {
  readonly view: DashboardView;
  readonly onSearch: (patch: DashboardPatch) => void;
  readonly children: ReactNode;
}) {
  return (
    <Tabs
      activeKey={props.view}
      onChange={(key) => chooseView(key, props.onSearch)}
      items={DASHBOARD_VIEWS.map((view) => ({
        key: view,
        label: VIEW_LABEL[view],
        children: view === props.view ? props.children : null,
      }))}
    />
  );
}

function chooseView(key: string, onSearch: (patch: DashboardPatch) => void): void {
  const view = DASHBOARD_VIEWS.find((item) => item === key);
  if (view === undefined) return;
  onSearch({ view });
}
