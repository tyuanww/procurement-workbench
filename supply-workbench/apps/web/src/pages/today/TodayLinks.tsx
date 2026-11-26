import { Button, Dropdown, Typography } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { TodayPaging, TodayResponse } from '@sw/contracts';
import type { ActionPageControls } from './ActionControls.js';
import { focusSection } from './today-focus.js';
import { PENDING_BATCH_TARGET } from './PendingBatches.js';
import type { WorkspaceInbox } from './action-query.js';
import { PLAN_TASK_TARGET } from './TodayAgenda.js';
import type { MyPlan } from './use-today-plan.js';

const inboxes: readonly { readonly key: WorkspaceInbox; readonly label: string; readonly unit: string }[] = [
  { key: 'today', label: '今天要办', unit: ' 项' },
  { key: 'scheduled', label: '已约跟进', unit: ' 批' },
  { key: 'unassigned', label: '待分派', unit: ' 项' },
];

type TodayLinksProps = {
  readonly asOf: TodayResponse['asOf'] | undefined;
  readonly page: ActionPageControls | undefined;
  readonly myPlan: MyPlan | undefined;
  readonly onRetryPlan: () => void;
  readonly inbox: WorkspaceInbox;
  readonly onInbox: (inbox: WorkspaceInbox) => void;
};

export function TodayLinks(props: TodayLinksProps) {
  const { page, myPlan, inbox, onInbox, onRetryPlan } = props;
  const isPlanUnavailable = myPlan?.kind === 'error';
  const counts = page?.paging.inboxCounts;
  const scopeOptions = inboxes.map((scope) => ({
    key: scope.key, label: scopeLabel(scope, hasSharedReviews(page)) + scopeQuantity(scope, counts),
  }));
  const title = inbox === 'today' ? '我的行动清单' : (scopeOptions.find((scope) => scope.key === inbox)?.label ?? '工作范围');
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const canReturn = inbox === 'today' && isOtherWorkDay(page?.calendar, props.asOf);
  return <div className="today-workspace-intro">
    <nav className="today-workspace-heading today-touch" aria-label="工作范围">
      <Typography.Title level={2} aria-label={title}>
        <Dropdown trigger={['click']} autoFocus open={isMenuOpen} onOpenChange={setMenuOpen} destroyOnHidden
          menu={{ className: 'today-workspace-menu', selectable: true, selectedKeys: [inbox], items: scopeOptions, onClick: ({ key }) => {
            const scope = inboxes.find((item) => item.key === key);
            if (scope === undefined) return;
            setMenuOpen(false);
            onInbox(scope.key);
            trigger.current?.focus({ preventScroll: true });
          } }}>
          <Button ref={trigger} type="text" aria-label="切换工作范围" aria-haspopup="menu" aria-expanded={isMenuOpen} aria-describedby={titleId}>
            <ScopeCaption id={titleId} title={title} inbox={inbox} />
            <DownOutlined aria-hidden />
          </Button>
        </Dropdown>
      </Typography.Title>
      {canReturn ? <Button onClick={() => onInbox('today')}>回到业务日</Button> : null}
    </nav>
    {isPlanUnavailable ? <div className="today-review-scope today-touch">
      <Typography.Text type="secondary">排期未读</Typography.Text><Button onClick={onRetryPlan}>重试排期</Button>
    </div> : null}
    <ReviewScopeNote page={page} />
  </div>;
}

function ScopeCaption({ id, title, inbox }: { readonly id: string; readonly title: string; readonly inbox: WorkspaceInbox }) {
  return <span id={id}>{inbox === 'today' ? <>
    <span className="today-scope-full">{title}</span><span className="today-scope-short">我的清单</span>
  </> : title}</span>;
}

function scopeQuantity(scope: (typeof inboxes)[number], counts: TodayPaging['inboxCounts']) {
  const count = counts?.[scope.key];
  return scope.key === 'today' || count === undefined ? '' : ' ' + count + scope.unit;
}

function scopeLabel(scope: (typeof inboxes)[number], hasReviews: boolean): string {
  return scope.key === 'unassigned' && hasReviews ? '待分派与审核' : scope.label;
}

function hasSharedReviews(page: ActionPageControls | undefined): boolean {
  return (page?.paging.unassignedReviewCount ?? 0) > 0;
}

function isOtherWorkDay(date: string | undefined, businessDate: string | undefined): boolean {
  return date !== undefined && date !== 'today' && date !== businessDate;
}

function ReviewScopeNote({ page }: { readonly page: ActionPageControls | undefined }) {
  if (page?.inbox !== 'unassigned') return null;
  const reviewCount = page.paging.unassignedReviewCount;
  const total = page.paging.inboxCounts?.unassigned;
  if (reviewCount === undefined || total === undefined) {
    return page.paging.reasonCounts.review_pending > 0 ? <Typography.Text type="secondary">含共享主数据待审核</Typography.Text> : null;
  }
  if (reviewCount === 0) return null;
  return <div className="today-review-scope today-touch">
    <Typography.Text type="secondary">待分派 {total - reviewCount} 项</Typography.Text>
    <Link to="/master">共享主数据审核 {reviewCount} 项</Link>
  </div>;
}

export function TodayAgendaShortcuts({ pendingCount, planCount, jump }: {
  readonly pendingCount: number;
  readonly planCount: number | undefined;
  readonly jump: (id: string) => void;
}) {
  return <>
    {!planCount ? null : <JumpLink id={PLAN_TASK_TARGET} jump={jump}>我的到期排期 {planCount} 项</JumpLink>}
    {pendingCount === 0 ? null : <JumpLink id={PENDING_BATCH_TARGET} jump={jump}>待建批次 {pendingCount} 行</JumpLink>}
  </>;
}

export function useAgendaJump({ page, onReset, onShow }: {
  readonly page: ActionPageControls | undefined;
  readonly onReset: () => void;
  readonly onShow: () => void;
}) {
  const [jumpId, setJumpId] = useState<string | null>(null);
  const canJump = page?.isSettled !== false;
  useEffect(() => {
    if (jumpId === null || !canJump || !focusSection(jumpId)) return;
    onShow();
    setJumpId(null);
  }, [jumpId, canJump, onShow]);
  const jump = (id: string) => {
    onShow();
    if (canJump && focusSection(id)) return;
    setJumpId(id);
    if (!canJump || document.getElementById(id) === null) onReset();
  };
  return { jump, jumpId };
}

function JumpLink({ id, children, jump }: { readonly id: string; readonly children: React.ReactNode; readonly jump: (id: string) => void }) {
  return <Button size="small" href={`#${id}`} onClick={(event) => {
    event.preventDefault();
    jump(id);
  }}>{children}</Button>;
}
