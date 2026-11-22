import { Alert, Button, Empty, Result, Skeleton, Tabs } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import {
  DASHBOARD_VIEWS,
  buyerView,
  dashboardQuery,
  dashboardSearch,
  loadDashboard,
  stuckView,
  supplierView,
  type DashboardLoad,
  type DashboardPatch,
  type DashboardQuery,
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

type BoardState = {
  readonly loaded: DashboardLoad | null;
  readonly error: string | undefined;
  readonly isUpdating: boolean;
};

type BoardLoad = {
  readonly state: BoardState;
  readonly reload: () => void;
};

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [now] = useState(() => new Date());
  const query = dashboardQuery(params.toString(), now);
  const board = useDashboardLoad(query, query.view !== 'meeting');
  const onSearch = (patch: DashboardPatch): void => {
    setParams(dashboardSearch({ current: params.toString(), now, patch }));
  };
  return (
    <WorkbenchPage title="管理看板">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {query.view === 'meeting' ? null : <DashboardChrome query={query} onSearch={onSearch} />}
        <ViewTabs view={query.view} onSearch={onSearch}>
          {query.view === 'meeting' ? <ManagementMeetingPanel now={now} /> : <>
            <BoardNotice board={board.state} />
            <BoardBody query={query} board={board.state} onSearch={onSearch} onRetry={board.reload} now={now} />
          </>}
        </ViewTabs>
      </div>
    </WorkbenchPage>
  );
}

function useDashboardLoad(query: Pick<DashboardQuery, 'from' | 'to' | 'lane'>, isEnabled: boolean): BoardLoad {
  const [board, setBoard] = useState<BoardState>({
    loaded: null,
    error: undefined,
    isUpdating: true,
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!isEnabled) return;
    let isCurrent = true;
    // A period refetch keeps the board on screen. The first load has nothing to keep.
    setBoard((current) => ({ loaded: current.loaded, error: undefined, isUpdating: true }));
    loadDashboard({ from: query.from, to: query.to, lane: query.lane }).then(
      (loaded) => {
        if (isCurrent) setBoard({ loaded, error: undefined, isUpdating: false });
      },
      (error: unknown) => {
        if (isCurrent) setBoard((current) => failBoard(current, error));
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [query.from, query.to, query.lane, reload, isEnabled]);
  return { state: board, reload: () => setReload((value) => value + 1) };
}

function boardFailure(error: unknown): string {
  const failure = readFailureOf(error);
  return failure === null ? '看板没有载入' : failureText(failure);
}

function failBoard(current: BoardState, error: unknown): BoardState {
  return {
    loaded: current.loaded,
    error: boardFailure(error),
    isUpdating: false,
  };
}

function BoardNotice(props: { readonly board: BoardState }) {
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

function BoardBody(props: {
  readonly query: DashboardQuery;
  readonly board: BoardState;
  readonly onSearch: (patch: DashboardPatch) => void;
  readonly onRetry: () => void;
  readonly now: Date;
}) {
  if (props.board.loaded === null) {
    if (props.board.error === undefined) return <Skeleton active paragraph={{ rows: 8 }} />;
    return (
      <Result
        status="error"
        title="看板没有读出来"
        subTitle={props.board.error}
        extra={[
          <Button key="retry" type="primary" onClick={props.onRetry}>重试</Button>,
          <Button key="back" onClick={() => window.history.back()}>返回</Button>,
        ]}
      />
    );
  }
  return <ActiveView query={props.query} loaded={props.board.loaded} onSearch={props.onSearch} now={props.now} />;
}

function ActiveView(props: {
  readonly query: DashboardQuery;
  readonly loaded: DashboardLoad;
  readonly onSearch: (patch: DashboardPatch) => void;
  readonly now: Date;
}) {
  if (props.query.view === 'suppliers') return <SupplierBoard loaded={props.loaded} onSearch={props.onSearch} />;
  if (props.query.view === 'buyers') return <BuyerBoard loaded={props.loaded} onSearch={props.onSearch} />;
  if (props.query.view === 'project') return <ProjectProgressPanel project={props.loaded.project} />;
  return <StuckBoard query={props.query} loaded={props.loaded} onSearch={props.onSearch} now={props.now} />;
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

function StuckBoard(props: { readonly query: DashboardQuery; readonly loaded: DashboardLoad; readonly onSearch: (patch: DashboardPatch) => void; readonly now: Date }) {
  return (
    <StuckPanel
      cards={props.loaded.cards}
      stuck={stuckView({ items: props.loaded.stuckItems, distribution: props.loaded.distribution, stage: props.query.stage, bucket: props.query.bucket, cause: props.query.cause })}
      items={props.loaded.stuckItems}
      from={props.query.from}
      to={props.query.to}
      stage={props.query.stage}
      bucket={props.query.bucket}
      cause={props.query.cause}
      onSearch={props.onSearch}
      now={props.now}
    />
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
