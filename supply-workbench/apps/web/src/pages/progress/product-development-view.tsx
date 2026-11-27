import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Flex, Skeleton, Typography } from 'antd';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { ProductDevelopment } from '@sw/contracts';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';
import { DevelopmentEditModal } from './development-edit-modal.js';
import type { DevelopmentStore } from './planning-load.js';
import { DevelopmentDetail } from './product-development-detail.js';
import { NodeForm } from './product-development-forms.js';
import {
  developmentProjects, hasDevelopmentFilters, readDevelopmentFilters, readDevelopmentPeriod,
  type DevelopmentPeriod, type DevelopmentProjectView,
} from './product-development-model.js';
import { DevelopmentNodeBoard, DevelopmentNodeTimeline, type OpenDevelopmentNode } from './product-development-nodes.js';
import { DevelopmentGantt } from './product-development-gantt.js';
import { DevelopmentOverview } from './product-development-overview.js';
import { developmentProjectLinkId } from './product-development-project-links.js';
import { DevelopmentProjectProgressCard, DevelopmentProjectProgressForm } from './product-development-progress.js';
import { DevelopmentProjectCreator } from './product-development-workbook.js';
import { storeLabels } from './store-query.js';
import './product-development-view.css';

type DevelopmentWorkspaceProps = {
  readonly data: ProductDevelopment;
  readonly availableProjects: ProductDevelopment['projects'];
  readonly store: DevelopmentStore;
  readonly params: URLSearchParams;
  readonly update: (params: URLSearchParams, options?: { readonly replace: boolean }) => void;
  readonly open: OpenDevelopmentNode;
  readonly closeDevelopment: () => void;
  readonly reload: () => void;
  readonly isManagement: boolean;
  readonly isMine: boolean;
  readonly isRefreshing?: boolean;
  readonly storePicker: ReactNode;
};

const projectViews = [{ label: '节点看板', value: 'board' }, { label: '项目时间轴', value: 'timeline' }, { label: '甘特图', value: 'gantt' }];
const filterKeys = ['planSearch', 'ownerUserId', 'status', 'developmentLead', 'planRiskOnly', 'developmentStage', 'developmentWaiting', 'store'];
const drawerKeys = ['developmentNode', 'developmentNodeProject', 'scheduleBatch', 'planSelected'];

export function DevelopmentWorkspace(props: DevelopmentWorkspaceProps): ReactNode {
  const { data, params, isManagement, isRefreshing, open, store, reload } = props;
  const period = readDevelopmentPeriod(params, data.businessDate);
  const legacyFilters = readDevelopmentFilters(params);
  const filters = isManagement ? legacyFilters : { ...legacyFilters, productLead: null, isRiskOnly: false };
  const projects = developmentProjects({ projects: data.projects, period, filters });
  const requestedProject = params.get('developmentProject');
  const active = props.availableProjects.find(({ id }) => id === requestedProject);
  const [selected] = active === undefined ? [] : developmentProjects({ projects: [active], period, filters });
  const focus = useDevelopmentProjectFocus(selected?.project.id);
  const navigation = developmentNavigation(props);
  const createAction = data.canCreateProject ? <DevelopmentProjectCreator store={store} data={{ ...data, projects: props.availableProjects }}
    onCreated={(projectId) => navigation.save({ projectId })} /> : null;
  return <div className="development-workspace">
    {requestedProject === null ? <div ref={focus.overview} tabIndex={-1} className="development-overview">
      <DevelopmentOverview {...{ ...props, ...navigation, period, projects, filters, createAction, today: data.businessDate }} />
    </div> : selected === undefined ? <MissingProject isRefreshing={isRefreshing === true} back={navigation.projectPath(null)} />
      : <div ref={focus.project} tabIndex={-1} className="development-project-view">
        <DevelopmentProjectWorkspace {...{ data, selected, open, navigation, period, reload }} hasFilters={hasDevelopmentFilters(filters)} />
      </div>}
    <DevelopmentDrawer {...props} />
  </div>;
}

function developmentNavigation({ params, update, reload }: Pick<DevelopmentWorkspaceProps, 'params' | 'update' | 'reload'>) {
  const write = (key: string, value: string | null) => {
    if (params.get(key) === value) return;
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    update(next, { replace: key === 'planSearch' });
  };
  const clear = () => {
    const next = new URLSearchParams(params);
    for (const key of filterKeys) next.delete(key);
    update(next);
  };
  const projectPath = (id: string | null) => ({ search: projectParams(params, id).toString() });
  const save = ({ projectId, nodeId }: { readonly projectId: string; readonly nodeId?: string }) => {
    const next = projectParams(params, projectId);
    if (nodeId !== undefined) next.set('developmentNode', nodeId);
    update(next);
    reload();
  };
  const view = projectViews.find(({ value }) => value === params.get('developmentView'))?.value ?? 'board';
  return { view, write, clear, projectPath, save, selectedRow: params.get('planSelected') };
}

function projectParams(params: URLSearchParams, id: string | null) {
  const next = new URLSearchParams(params);
  for (const key of drawerKeys) next.delete(key);
  if (id === null) next.delete('developmentProject');
  else next.set('developmentProject', id);
  return next;
}

function DevelopmentProjectWorkspace({ data, selected, open, navigation, hasFilters, period, reload }: {
  readonly data: ProductDevelopment;
  readonly selected: DevelopmentProjectView;
  readonly open: OpenDevelopmentNode;
  readonly navigation: ReturnType<typeof developmentNavigation>;
  readonly hasFilters: boolean;
  readonly period: DevelopmentPeriod;
  readonly reload: () => void;
}) {
  const { project } = selected;
  const { view, projectPath, write, clear, save, selectedRow } = navigation;
  return <>
    <Card size="small" className="development-project-banner">
      <Flex wrap align="center" justify="space-between" gap={space[1]}>
        <ProjectBack to={projectPath(null)} />
        {project.canManage ? <Flex wrap gap={space[1]}>
          <DevelopmentEditModal key={`progress:${project.id}:${project.progressVersion ?? 0}`} title="编辑项目进度" onSaved={() => save({ projectId: project.id })}>
            {(saved) => <DevelopmentProjectProgressForm project={project} saved={saved} />}
          </DevelopmentEditModal>
          <DevelopmentEditModal key={project.id} title="新增开发节点" onSaved={(nodeId) => save({ projectId: project.id, nodeId })}>
            {(saved) => <NodeForm project={project} users={data.users} businessDate={data.businessDate} saved={saved} />}
          </DevelopmentEditModal>
        </Flex> : null}
      </Flex>
      <Typography.Title level={2}>{project.title}</Typography.Title>
      <Typography.Text type="secondary">{storeLabels[project.store]} · 项目负责人 {project.productLeadName ?? '待核对'}</Typography.Text>
    </Card>
    <DevelopmentProjectProgressCard project={project} today={data.businessDate} />
    <Card size="small" className="development-project-nodes" title="开发节点" extra={<ViewSwitch aria-label="项目节点视图" options={projectViews} value={view}
          onChange={(value) => write('developmentView', value === 'board' ? null : value)} />}>
      {hasFilters ? <Button type="link" onClick={clear}>清除筛选</Button> : null}
      <ProjectNodes {...{ selected, open, view, period, selectedRow, reload }} today={data.businessDate} />
    </Card>
  </>;
}

function ProjectNodes({ selected, view, open, period, today, selectedRow, reload }: {
  readonly selected: DevelopmentProjectView;
  readonly view: ReturnType<typeof developmentNavigation>['view'];
  readonly open: OpenDevelopmentNode;
  readonly period: DevelopmentPeriod;
  readonly today: ProductDevelopment['businessDate'];
  readonly selectedRow: string | null;
  readonly reload: () => void;
}) {
  const { project, nodes } = selected;
  if (view === 'board' && project.nodes.length > 0) return <DevelopmentNodeBoard nodes={nodes} open={open} onChanged={reload} />;
  if (nodes.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={project.nodes.length === 0 ? '项目暂无开发节点。' : '当前筛选下没有开发节点。'} />;
  if (view === 'gantt') return <DevelopmentGantt projects={[selected]} {...{ period, today, open, selectedRow }} />;
  return <DevelopmentNodeTimeline nodes={nodes} open={open} />;
}

function DevelopmentDrawer({ data, availableProjects, params, closeDevelopment, reload }: DevelopmentWorkspaceProps) {
  const id = params.get('developmentNode');
  if (id === null) return null;
  const projectId = params.get('developmentNodeProject') ?? params.get('developmentProject');
  const project = projectId === null ? availableProjects.find(({ nodes }) => nodes.some((node) => node.id === id))
    : availableProjects.find((entry) => entry.id === projectId);
  const node = project?.nodes.find((entry) => entry.id === id);
  if (project === undefined || node === undefined) return null;
  return <DevelopmentDetail key={node.id} node={node} project={project} users={data.users} today={data.businessDate}
    onClose={closeDevelopment} onChanged={reload} selectedBatch={params.get('scheduleBatch')} />;
}

function ProjectBack({ to }: { readonly to: { readonly search: string } }) {
  const { state } = useLocation();
  return <Link to={to} state={state} preventScrollReset replace className="development-project-back">
    <ArrowLeftOutlined aria-hidden /> 返回项目
  </Link>;
}

function MissingProject({ isRefreshing, back }: { readonly isRefreshing: boolean; readonly back: { readonly search: string } }) {
  return <Card size="small">
    {isRefreshing ? <Skeleton active paragraph={{ rows: 2 }} />
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前范围内找不到这个项目。可返回项目列表。">
        <ProjectBack to={back} />
      </Empty>}
  </Card>;
}

function useDevelopmentProjectFocus(selected: string | undefined) {
  const { state } = useLocation();
  const returnOrigin = typeof state === 'object' && state !== null && state.developmentProjectOrigin === 'follow-up' ? 'follow-up' : 'list';
  const previous = useRef(selected);
  const overview = useRef<HTMLDivElement>(null);
  const project = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = selected;
    if (before === selected) return;
    const target = selected === undefined && before !== undefined
      ? document.getElementById(developmentProjectLinkId(before, returnOrigin)) ?? overview.current
      : project.current;
    target?.focus();
  }, [returnOrigin, selected]);
  return { overview, project };
}
