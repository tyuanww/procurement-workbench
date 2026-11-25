import { Alert, Button, Flex, Pagination, Skeleton, Typography } from 'antd';
import { AppstoreOutlined, CalendarOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useEffect } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { todayArrivalsPath } from '../../features/today/index.js';
import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';
import { WorkspaceBatches, WorkspaceCalendar, WorkspaceCounts, procurementWorkspaceStyles } from './ProcurementWorkspaceViews.js';
import { WorkspaceBatchDrawer } from './WorkspaceBatchDrawer.js';
import { WorkspacePreview } from './WorkspacePreview.js';
import { workspaceParams, workspaceQuery, type WorkspaceNavigation, type WorkspaceView } from './personal-query.js';
import { usePersonalToday } from './use-personal-today.js';

const VIEW_OPTIONS = [
  { label: '列表', value: 'list', icon: <UnorderedListOutlined aria-hidden /> },
  { label: '看板', value: 'board', icon: <AppstoreOutlined aria-hidden /> },
  { label: '日历', value: 'calendar', icon: <CalendarOutlined aria-hidden /> },
] satisfies Parameters<typeof ViewSwitch<WorkspaceView>>[0]['options'];

export function PersonalWorkspacePage() {
  const [params] = useSearchParams();
  const { userId } = useOutletContext<{ readonly userId: string }>();
  return params.get('preview') === '1' ? <WorkspacePreview /> : <ProcurementWorkspace key={userId} />;
}

function useWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const query = workspaceQuery(params);
  const { load, previousData, retry } = usePersonalToday(query.request, query.drawer !== null);
  const data = load.kind === 'ready' ? load.data : null;
  const summary = data ?? previousData;
  const item = data?.items.find((row) => row.id === query.drawer);
  const focus = query.drawer === null ? data?.items.find((row) => row.id === query.focus)?.id : undefined;
  useEffect(() => {
    if (focus !== undefined) document.getElementById(`workspace-batch-${focus}`)?.focus();
  }, [data?.page, focus]);
  function go(navigation: WorkspaceNavigation) {
    setParams(workspaceParams(params, navigation), { replace: navigation.kind === 'saved' });
    if (navigation.kind === 'saved') retry();
  }
  return { load, query, data, summary, item, retry, go };
}

type Page = ReturnType<typeof useWorkspacePage>;

function ProcurementWorkspace() {
  const page = useWorkspacePage();
  const { query, summary, data, item, go } = page;
  const asOf = summary?.asOf;
  return <WorkbenchPage title="个人工作台" secondary={asOf === undefined ? '本人逾期未发批次' : `本人逾期未发批次 · 业务日 ${asOf}`}>
    <style>{procurementWorkspaceStyles}</style>
    <Flex vertical gap={space[3]}>
      <WorkspaceCounts counts={summary?.counts} scope={query.scope} onScope={(scope) => go({ kind: 'select', selection: { scope } })} />
      <WorkspaceActions view={query.view} onView={(view) => go({ kind: 'select', selection: { view } })}
        isAll={query.scope === 'all'} onAll={() => go({ kind: 'select', selection: { scope: 'all' } })} />
      <WorkspaceResults page={page} />
      <Typography.Text type="secondary"><Link to="/today/personal?preview=1">打开浏览器中的合成预览</Link></Typography.Text>
    </Flex>
    <WorkspaceBatchDrawer item={item} asOf={asOf} onClose={() => go({ kind: 'close', page: data?.page })}
      onSaved={(location) => go({ kind: 'saved', location })} />
  </WorkbenchPage>;
}

function WorkspaceActions({ view, onView, isAll, onAll }: {
  readonly view: WorkspaceView;
  readonly onView: (view: WorkspaceView) => void;
  readonly isAll: boolean;
  readonly onAll: () => void;
}) {
  return <Flex gap={space[2]} align="center" wrap>
    <Button size="small" type={isAll ? 'default' : 'text'} aria-pressed={isAll} onClick={onAll}>全部逾期未发</Button>
    <ViewSwitch<WorkspaceView> aria-label="工作台视图" value={view} options={VIEW_OPTIONS} onChange={onView} />
    <Link to="/today?group=schedule&mine=1">我的到期排期</Link>
    <Link to={todayArrivalsPath}>在途待收</Link>
    <Link to="/today">行动板</Link>
    <ProcurementCutoff />
  </Flex>;
}

function WorkspaceResults({ page }: { readonly page: Page }) {
  const { load, data, query, item, retry, go } = page;
  if (load.kind === 'error') return <Alert type="error" showIcon title="无法加载本人逾期未发批次" description={load.message}
    action={<Button onClick={retry}>重试</Button>} />;
  if (data === null) return <Skeleton active aria-label="正在加载逾期未发批次" />;
  return <>
    {data.calendar === undefined ? null : <WorkspaceCalendar calendar={data.calendar} onDay={(date) => go({ kind: 'select', selection: { date } })} />}
    {query.drawer !== null && item === undefined ? <Alert type="info" title="当前筛选下找不到这条本人逾期未发批次"
      action={<Button onClick={() => go({ kind: 'close', page: data.page })}>关闭提示</Button>} /> : null}
    <WorkspaceBatches items={data.items} scope={query.scope} view={query.view} focus={query.focus} onOpen={(id) => go({ kind: 'open', id })} />
    <Pagination current={data.page} pageSize={data.pageSize} total={data.total} hideOnSinglePage showSizeChanger={false}
      onChange={(page) => go({ kind: 'select', selection: { page } })} />
  </>;
}
