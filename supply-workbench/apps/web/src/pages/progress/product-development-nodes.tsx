import { DownOutlined, HolderOutlined } from '@ant-design/icons';
import { Button, Card, Dropdown, Empty, Flex, Timeline, Typography } from 'antd';
import { useCallback, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { WorkItemStatusSchema } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { TaskTagView, WorkItemStatusTag } from '../../features/plan/index.js';
import { canSetStatus, workItemStatusLabel, type WorkItemStatus } from '../../features/today/index.js';
import { ApiError, apiErrorMessage } from '../../shared/api/client.js';
import { space } from '../../theme/tokens.js';
import { planningRowTriggerId } from './planning-navigation.js';
import type { PlanningSource } from './planning-rows.js';
import { updateDevelopmentNode } from './product-development-api.js';
import type { DevelopmentNodeView } from './product-development-model.js';
import { DevelopmentCoordinationNodeFacts, DevelopmentCoordinationTag } from './product-development-progress.js';
import { developmentNodeCoordination } from './product-development-workflow.js';
import './product-development-node-board.css';

export type OpenDevelopmentNode = (source: PlanningSource, triggerId: string) => void;

type NodeResults = {
  readonly nodes: readonly DevelopmentNodeView[];
  readonly open: OpenDevelopmentNode;
  readonly showProject?: boolean;
};

const nodeDragType = 'application/x-shinemage-development-node';

type BoardFeedback = { readonly kind: 'saving' | 'success' | 'error'; readonly message: string };
type NodeDrag = { readonly nodeId: string; readonly over: WorkItemStatus | null };
type StatusMenuFocus = { readonly view: DevelopmentNodeView; readonly trigger: HTMLButtonElement };
type ChangeStatus = (input: {
  readonly view: DevelopmentNodeView;
  readonly status: WorkItemStatus;
  readonly trigger?: HTMLButtonElement;
}) => Promise<void>;

export function DevelopmentNodeBoard({ nodes, open, onChanged }: NodeResults & { readonly onChanged: () => void }): ReactNode {
  const { board, focusAfterMove } = useMovedNodeFocus(nodes);
  const { feedback, isSaving, changeStatus } = useNodeStatusChange({ onChanged, focusAfterMove });
  const drag = useNodeDrag({ nodes, isSaving, changeStatus });
  return <div ref={board} tabIndex={-1} className="development-node-board-region" role="region" aria-label="节点看板">
    <BoardStatusFeedback feedback={feedback} />
    {nodes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有开发节点。" />
      : <div className="development-node-board" aria-busy={isSaving}>
      {WorkItemStatusSchema.options.map((status) => <DevelopmentNodeLane key={status} status={status} drag={drag}
        nodes={nodes.filter(({ node }) => node.status === status)} open={open} isSaving={isSaving} changeStatus={changeStatus} />)}
      </div>}
  </div>;
}

function BoardStatusFeedback({ feedback }: { readonly feedback: BoardFeedback | null }): ReactNode {
  return <>
    <div className="development-board-feedback" role="status">
      {feedback?.kind === 'success' ? <Typography.Text>{feedback.message}</Typography.Text> : null}
    </div>
    <div className="development-board-feedback" role="alert">
      {feedback?.kind === 'error' ? <Typography.Text type="danger">{feedback.message}</Typography.Text> : null}
    </div>
    {feedback?.kind === 'saving'
      ? <div className="development-board-feedback"><Typography.Text type="secondary">{feedback.message}</Typography.Text></div> : null}
  </>;
}

function useMovedNodeFocus(nodes: NodeResults['nodes']) {
  const board = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef<StatusMenuFocus | null>(null);
  useLayoutEffect(() => {
    const focus = focusAfterMove.current;
    if (focus === null) return;
    const current = nodes.find(({ node }) => node.id === focus.view.node.id);
    if (current?.node.version === focus.view.node.version) return;
    focusAfterMove.current = null;
    if (document.activeElement !== document.body && document.activeElement !== focus.trigger) return;

    const nodeTrigger = developmentNodeTrigger(focus.view);
    const target = document.getElementById(statusMenuId(nodeTrigger)) ?? document.getElementById(nodeTrigger) ?? board.current;
    target?.focus();
  }, [nodes]);
  return { board, focusAfterMove };
}

function useNodeStatusChange({ onChanged, focusAfterMove }: {
  readonly onChanged: () => void;
  readonly focusAfterMove: ReturnType<typeof useMovedNodeFocus>['focusAfterMove'];
}) {
  const [feedback, setFeedback] = useState<BoardFeedback | null>(null);
  const saving = useRef(false);
  const changeStatus: ChangeStatus = async ({ view, status, trigger }) => {
    const { project, node } = view;
    if (saving.current || !project.canManage || !canSetStatus(node.status, status)) return;
    saving.current = true;
    setFeedback({ kind: 'saving', message: `正在更改「${node.title}」的状态…` });
    try {
      await updateDevelopmentNode({
        projectId: project.id, nodeId: node.id, expectedVersion: node.version, status,
        ownerUserId: node.ownerUserId, buyerUserId: node.buyerUserId, plannedStart: node.plannedStart, plannedEnd: node.plannedEnd,
      });
    } catch (error: unknown) {
      setFeedback({ kind: 'error', message: `「${node.title}」状态更改失败。${statusErrorReason(error)}` });
      return;
    } finally {
      saving.current = false;
    }
    if (trigger !== undefined) focusAfterMove.current = { view, trigger };
    setFeedback({ kind: 'success', message: `已将「${node.title}」改为「${workItemStatusLabel(status)}」。` });
    onChanged();
  };
  return { feedback, isSaving: feedback?.kind === 'saving', changeStatus };
}

function statusErrorReason(error: unknown): string {
  return error instanceof ApiError && error.code === 'STATE_CONFLICT'
    ? '请刷新看板后重试。'
    : apiErrorMessage(error) ?? '请重试。';
}

function useNodeDrag({ nodes, isSaving, changeStatus }: {
  readonly nodes: NodeResults['nodes'];
  readonly isSaving: boolean;
  readonly changeStatus: ChangeStatus;
}) {
  const [drag, setDrag] = useState<NodeDrag | null>(null);
  const dragged = drag === null ? undefined : nodes.find(({ node }) => node.id === drag.nodeId);
  function start(event: DragEvent<HTMLSpanElement>, view: DevelopmentNodeView) {
    if (isSaving) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(nodeDragType, view.node.id);
    setDrag({ nodeId: view.node.id, over: null });
  }

  function drop(event: DragEvent<HTMLDivElement>, status: WorkItemStatus) {
    if (dragged === undefined || event.dataTransfer.getData(nodeDragType) !== dragged.node.id) return;
    event.preventDefault();
    setDrag(null);
    void changeStatus({ view: dragged, status });
  }

  function dragOver(event: DragEvent<HTMLDivElement>, status: WorkItemStatus) {
    if (!event.dataTransfer.types.includes(nodeDragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDrag((current) => current === null || current.over === status ? current : { ...current, over: status });
  }

  function leave(event: DragEvent<HTMLDivElement>, status: WorkItemStatus) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDrag((current) => current?.over === status ? { ...current, over: null } : current);
  }

  return { dragged, over: drag?.over, start, drop, dragOver, leave, end: () => setDrag(null) };
}

function DevelopmentNodeLane({ status, nodes, open, drag, isSaving, changeStatus }: NodeResults & {
  readonly status: WorkItemStatus;
  readonly drag: ReturnType<typeof useNodeDrag>;
  readonly isSaving: boolean;
  readonly changeStatus: ChangeStatus;
}): ReactNode {
  const { dragged, over } = drag;
  const isValidDrop = dragged !== undefined && canSetStatus(dragged.node.status, status);
  const dropState = dragged === undefined ? undefined : isValidDrop ? over === status ? 'over' : 'available' : 'invalid';
  return <Card size="small" className="development-node-lane" data-empty={nodes.length === 0}
    data-node-lane={status} data-drop-state={dropState}
    onDragOver={isValidDrop ? (event) => drag.dragOver(event, status) : undefined}
    onDragLeave={isValidDrop ? (event) => drag.leave(event, status) : undefined}
    onDrop={isValidDrop ? (event) => drag.drop(event, status) : undefined}
    title={<Typography.Title level={3}>{workItemStatusLabel(status)} <span>{nodes.length}</span></Typography.Title>}>
    {nodes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="development-empty" description="暂无节点" />
      : nodes.map((view) => <DevelopmentNodeRow key={view.node.id} view={view} open={open}
        isDragged={view.node.id === dragged?.node.id}
        actions={!view.project.canManage ? undefined : <NodeStatusActions view={view} isSaving={isSaving}
          changeStatus={(next, trigger) => void changeStatus({ view, status: next, trigger })}
          startDrag={(event) => drag.start(event, view)} endDrag={drag.end} />} />)}
  </Card>;
}

function NodeStatusActions({ view, isSaving, changeStatus, startDrag, endDrag }: {
  readonly view: DevelopmentNodeView;
  readonly isSaving: boolean;
  readonly changeStatus: (status: WorkItemStatus, trigger: HTMLButtonElement) => void;
  readonly startDrag: (event: DragEvent<HTMLSpanElement>) => void;
  readonly endDrag: () => void;
}): ReactNode {
  const triggerId = statusMenuId(developmentNodeTrigger(view));
  const menuId = `${triggerId}-entries`;
  const { trigger, isOpen, attachMenu, setMenuOpen, closeMenu, leaveMenu } = useStatusMenu(isSaving);
  const statuses = WorkItemStatusSchema.options.filter((status) => canSetStatus(view.node.status, status));
  if (statuses.length === 0) return null;

  return <div className="development-node-status-actions">
    <span className="development-node-drag" data-node-drag draggable={!isSaving} aria-hidden
      title="拖动更改状态" onDragStart={startDrag} onDragEnd={endDrag}>
      <HolderOutlined />
    </span>
    <Dropdown trigger={isSaving ? [] : ['click']} destroyOnHidden open={isOpen} onOpenChange={setMenuOpen}
      popupRender={(content) => <div ref={attachMenu} inert={!isOpen} onKeyDownCapture={leaveMenu}>{content}</div>}
      menu={{ id: menuId, items: statuses.map((status) => ({
        key: status, label: workItemStatusLabel(status),
        onClick: () => {
          closeMenu();
          if (trigger.current !== null) changeStatus(status, trigger.current);
        },
      })), onKeyDown: (event) => { if (event.key === 'Enter') event.preventDefault(); } }}>
      <Button ref={trigger} id={triggerId} data-node-status-menu
        type="text" size="small" icon={<DownOutlined aria-hidden />} iconPlacement="end"
        aria-label={`更改状态 ${view.node.title}`} aria-haspopup="menu" aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined} aria-disabled={isSaving} onKeyDown={leaveMenu}>更改状态</Button>
    </Dropdown>
  </div>;
}

function useStatusMenu(isSaving: boolean) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const [isRequestedOpen, setRequestedOpen] = useState(false);
  const isOpen = isRequestedOpen && !isSaving;
  const attachMenu = useCallback((element: HTMLDivElement | null) => {
    menu.current = element;
    if (isOpen) element?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [isOpen]);

  function setMenuOpen(next: boolean) {
    if (menu.current !== null) menu.current.inert = !next;
    setRequestedOpen(next);
  }

  function closeMenu() {
    setMenuOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function leaveMenu(event: KeyboardEvent<HTMLElement>) {
    if (!isOpen || (event.key !== 'Escape' && event.key !== 'Tab')) return;
    event.stopPropagation();
    if (event.key === 'Escape') event.preventDefault();
    closeMenu();
  }
  return { trigger, isOpen, attachMenu, setMenuOpen, closeMenu, leaveMenu };
}

export function DevelopmentNodeTimeline({ nodes, open, showProject = false, coordinationDate }:
  NodeResults & { readonly coordinationDate?: LocalDate | undefined }): ReactNode {
  if (nodes.length === 0) return null;
  return <Timeline className="development-node-timeline" items={nodes.map((view) => ({
    key: view.node.id,
    content: <DevelopmentNodeRow view={view} open={open} showProject={showProject} showStart={!showProject} coordinationDate={coordinationDate} />,
  }))} />;
}

function DevelopmentNodeRow({ view, open, showProject = false, showStart = false, actions, isDragged, coordinationDate }: {
  readonly view: DevelopmentNodeView;
  readonly open: OpenDevelopmentNode;
  readonly showProject?: boolean;
  readonly showStart?: boolean;
  readonly actions?: ReactNode;
  readonly isDragged?: boolean;
  readonly coordinationDate?: LocalDate | undefined;
}): ReactNode {
  const { node, project } = view;
  const item = coordinationDate === undefined ? null : developmentNodeCoordination({ node, today: coordinationDate });
  const trigger = developmentNodeTrigger(view);
  return <section className="development-node-row" data-dragged={isDragged || undefined}>
    <Flex align="center" wrap gap={space[1]}>
      <Button type="link" id={trigger} aria-haspopup="dialog" className="development-node-open"
        onClick={() => open({ kind: 'development', project, node }, trigger)}>{node.title}</Button>
      {item === null ? <WorkItemStatusTag status={node.status} /> : <DevelopmentCoordinationTag item={item} />}
    </Flex>
    {coordinationDate === undefined ? <DevelopmentTimelineFacts {...{ view, showProject, showStart }} /> : <>
      {showProject ? <Typography.Text type="secondary">{project.title}</Typography.Text> : null}
      <DevelopmentCoordinationNodeFacts node={node} item={item} />
    </>}
    {actions}
  </section>;
}

function DevelopmentTimelineFacts({ view, showProject, showStart }: {
  readonly view: DevelopmentNodeView; readonly showProject: boolean; readonly showStart: boolean;
}) {
  const { risk, waiting } = view;
  return <>
    <DevelopmentNodeFacts {...{ view, showProject, showStart }} />
    {risk === null && waiting === null ? null : <Flex wrap align="center" gap={space[1]}>
      {risk === null ? null : <TaskTagView tag={{ key: 'risk', label: risk, tone: 'warning', fill: 'solid' }} />}
      {waiting === null ? null : <Typography.Text type="secondary">{waiting}</Typography.Text>}
    </Flex>}
  </>;
}

function developmentNodeTrigger({ project, node }: DevelopmentNodeView) {
  return planningRowTriggerId(`development:${project.id}:${node.id}`);
}

function statusMenuId(nodeTrigger: string) {
  return `${nodeTrigger}-status`;
}

function DevelopmentNodeFacts({ view, showProject, showStart }: {
  readonly view: DevelopmentNodeView;
  readonly showProject: boolean;
  readonly showStart: boolean;
}): ReactNode {
  const { node, project } = view;
  return <Typography.Text type="secondary" className="development-node-facts">
    {showProject ? <span>{project.title}</span> : null}
    {showStart && node.plannedStart !== node.plannedEnd ? <span>计划开始 <time dateTime={node.plannedStart}>{node.plannedStart}</time></span> : null}
    <span>项目要求 <time dateTime={node.plannedEnd}>{node.plannedEnd}</time></span>
    {node.ownerName === null || showProject ? null : <span>负责人 {node.ownerName}</span>}
  </Typography.Text>;
}
