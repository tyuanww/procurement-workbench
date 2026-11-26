import { Button, Card, Dropdown, Flex, Tooltip, Typography, type ButtonProps } from 'antd';
import { CopyOutlined, EllipsisOutlined } from '@ant-design/icons';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { TodayHighlight, actionIcon, actionReasonText, TodayOrderLink, type BoardRow, type QuickAction, type RowFace, type TodayOrderRef } from '../../features/today/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime, formatQuantity, formatTableDate } from '../../shared/ui/format.js';
import { isStatusKey } from '../../shared/ui/status.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { space } from '../../theme/tokens.js';
import { ReceiptAction, type ReceiptWork } from './TodayAgenda.js';

export type CopyAction = { readonly label: string; readonly disabled: boolean; readonly run: () => void };

type RowProps = {
  readonly row: BoardRow;
  readonly isCard: boolean;
  readonly headingLevel: 2 | 3;
  readonly isFocused: boolean;
  readonly isFading: boolean;
  readonly batchSeq: number | undefined;
  readonly receipt: ReceiptWork | undefined;
  readonly arrivalFocusId: string | null | undefined;
  readonly copy: CopyAction | null;
  readonly isFactoryChase?: boolean;
  readonly assignmentOrder?: TodayOrderRef | undefined;
  readonly isScheduled: boolean;
  readonly showReminder?: boolean;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
};

type PrimaryAction =
  | { readonly kind: 'receipt'; readonly memo: ReceiptWork }
  | { readonly kind: 'assign'; readonly order: TodayOrderRef }
  | { readonly kind: 'quick'; readonly action: QuickAction }
  | { readonly kind: 'copy'; readonly action: CopyAction }
  | { readonly kind: 'detail' };

type CardPresentation = {
  readonly title: string;
  readonly batch: string | undefined;
  readonly identity: string;
  readonly primary: PrimaryAction;
  readonly overflow: readonly QuickAction[];
  readonly inTransit: string | undefined;
};

export function TodayRow(props: RowProps): ReactNode {
  const canRecord = useCanWrite('records.write');
  const card = presentRow(props, canRecord ? props.row.actions : []);
  const state = { 'data-current': props.isFocused || undefined, 'data-fading': props.isFading || undefined };
  const content = <div className="today-row-layout">
    <RowFacts card={card} row={props.row} receipt={props.receipt} headingLevel={props.headingLevel}
      isScheduled={props.isScheduled} showReminder={props.showReminder === true} onOpen={props.onOpen} />
    <RowActions {...props} card={card} />
    <TodayHighlight active={props.isFocused} />
  </div>;
  return props.isCard
    ? <article aria-label={card.identity}><Card className="today-row today-work-card today-batch-card" size="small" {...state}>{content}</Card></article>
    : <div className="today-row today-work-card today-batch-card today-grouped-row" role="group" aria-label={card.identity} {...state}>{content}</div>;
}

function presentRow({ row, batchSeq, receipt, copy, isScheduled, assignmentOrder }: RowProps, actions: readonly QuickAction[]): CardPresentation {
  const { face } = row;
  const orderNo = face.orderNo === '—' ? undefined : face.orderNo;
  const productName = face.productName === '—' ? undefined : face.productName;
  const batch = batchSeq === undefined ? undefined : `第 ${batchSeq} 批`;
  const primary = choosePrimary({ actions, receipt, copy, isScheduled, assignmentOrder });
  return {
    title: productName ?? '品名待补充',
    batch,
    identity: [orderNo, productName, batch].filter(Boolean).join(' · '),
    primary,
    overflow: primary.kind === 'quick' ? actions.filter((action) => action.kind !== primary.action.kind) : actions,
    inTransit: face.inTransit ?? receiptQuantity(receipt),
  };
}

function choosePrimary({ actions, receipt, copy, isScheduled, assignmentOrder }: Pick<RowProps, 'receipt' | 'copy' | 'isScheduled' | 'assignmentOrder'> & {
  readonly actions: readonly QuickAction[];
}): PrimaryAction {
  if (receipt !== undefined) return { kind: 'receipt', memo: receipt };
  if (assignmentOrder !== undefined) return { kind: 'assign', order: assignmentOrder };
  const quick = preferredAction({ actions, hasCopy: copy !== null, isScheduled });
  if (quick !== undefined) return { kind: 'quick', action: quick };
  return copy === null ? { kind: 'detail' } : { kind: 'copy', action: copy };
}

function receiptQuantity(receipt: ReceiptWork | undefined): string | undefined {
  if (receipt === undefined) return undefined;
  return `在途待收 ${formatQuantity(receipt.inTransitQty)} ${receipt.unit}`;
}

function RowFacts({ card, row, receipt, headingLevel, isScheduled, showReminder, onOpen }: Pick<RowProps, 'row' | 'receipt' | 'headingLevel' | 'isScheduled' | 'showReminder' | 'onOpen'> & { readonly card: CardPresentation }) {
  const { face } = row;
  const hasReminderContext = showReminder === true || isScheduled || (card.primary.kind === 'quick' && card.primary.action.kind === 'note');
  const waiting = isScheduled && face.nextFollowUpTarget !== undefined ? undefined : face.waiting;
  const factory = face.waitingKind === 'supplier' ? waiting : undefined;
  const reasonCodes = visibleReasons(row, receipt);
  return <>
    <div className="today-row-facts">
      <RowHeading card={card} face={face} receipt={receipt} reason={reasonCodes[0]} headingLevel={headingLevel} onOpen={onOpen} />
      <RowIdentity card={card} face={face} factory={factory} isReceipt={receipt !== undefined} />
      <AdditionalReasons codes={receipt === undefined ? reasonCodes.slice(1) : reasonCodes} face={face} />
      {hasReminderContext ? <NextFollowUp face={face} /> : null}
    </div>
    <div className="today-row-details">
      <DeliveryFacts face={face} receipt={receipt} waiting={factory === undefined ? waiting : undefined} showReminder={showReminder === true} />
      <RowQuantities remaining={face.remaining} inTransit={card.inTransit} />
    </div>
  </>;
}

function RowQuantities({ remaining, inTransit }: { readonly remaining: string | undefined; readonly inTransit: string | undefined }) {
  return <div className="today-row-line today-row-quantities">
    {[remaining, inTransit].map((value) => value === undefined ? null : <Typography.Text key={value}>{value}</Typography.Text>)}
  </div>;
}

function visibleReasons({ face, reasons = [] }: BoardRow, receipt: ReceiptWork | undefined) {
  const distinct = reasons.filter((code) => code !== 'unassigned');
  const shown = distinct.filter((code) => {
    if (code === 'unshipped') return face.remaining === undefined;
    if (code === 'shipped_not_received') return receipt === undefined && face.inTransit === undefined;
    if (code === 'due_today') return receipt?.status !== 'due_today' || face.date !== receipt.confirmedDate;
    return true;
  });
  return shown.length === 0 && receipt === undefined ? distinct.slice(0, 1) : shown;
}

function RowHeading({ card, face, receipt, reason, headingLevel, onOpen }: Pick<RowProps, 'receipt' | 'headingLevel' | 'onOpen'> & {
  readonly card: CardPresentation; readonly face: RowFace; readonly reason: string | undefined;
}) {
  return <div className="today-row-line today-batch-title">
    <RowStatus face={face} receipt={receipt} reason={reason} />
    <Typography.Title level={headingLevel} className="today-row-title">{card.primary.kind === 'detail' ? card.title
      : <Button type="link" onClick={onOpen} aria-label={`查看详情 ${card.identity}`}>{card.title}</Button>}</Typography.Title>
  </div>;
}

function RowStatus({ face, receipt, reason }: { readonly face: RowFace; readonly receipt: ReceiptWork | undefined; readonly reason: string | undefined }) {
  if (receipt !== undefined) {
    const isLate = receipt.status === 'overdue';
    return <StatusTag status={isLate ? 'overdue' : 'due_today'} label={isLate ? '到仓逾期' : '今日应到'} />;
  }
  if (reason !== undefined && isStatusKey(reason)) return <StatusTag status={reason} label={reasonLabel(reason, face)} />;
  return <Typography.Text className="today-row-meta" type="secondary">{reason === undefined ? face.reason : actionReasonText(reason)}</Typography.Text>;
}

function RowIdentity({ card, face, factory, isReceipt }: {
  readonly card: CardPresentation; readonly face: RowFace; readonly factory: string | undefined; readonly isReceipt: boolean;
}) {
  const parts = [face.orderNo === '—' ? undefined : face.orderNo, card.batch,
    factory === undefined ? undefined : isReceipt ? factory : `等待方 · ${factory}`,
    face.isUnassigned === true ? '未分配' : undefined].filter(Boolean);
  return parts.length === 0 ? null : <Typography.Text className="today-row-meta" type="secondary">{parts.join(' · ')}</Typography.Text>;
}

function AdditionalReasons({ codes, face }: { readonly codes: readonly string[]; readonly face: RowFace }) {
  if (codes.length === 0) return null;
  return <Typography.Text className="today-row-reason">{codes.map((code) => reasonLabel(code, face)).join('、')}</Typography.Text>;
}

function reasonLabel(code: string, face: RowFace) {
  return code === 'overdue' && face.overdueTone === 'danger' ? `未发${face.overdue}` : actionReasonText(code);
}

function DeliveryFacts({ face, receipt, waiting, showReminder }: {
  readonly face: RowFace;
  readonly receipt: ReceiptWork | undefined;
  readonly waiting: string | undefined;
  readonly showReminder: boolean;
}) {
  if (receipt === undefined) return <div className="today-row-line today-row-delivery">
    {face.date === '—' ? null : <DateFact label="采购确认到仓日" date={face.date} />}
    {waiting === undefined ? null : <Typography.Text type="secondary">等待方 · {waiting}</Typography.Text>}
  </div>;
  return <div className="today-row-line today-row-delivery">
    <DateFact label="采购确认到仓日" date={receipt.confirmedDate} />
    <Fact label="收货方" value={receipt.warehouse ?? '未命名'} />
    {face.date !== '—' && face.date !== receipt.confirmedDate ? <DateFact label="待办日期" date={face.date} /> : null}
    {showReminder && waiting !== undefined ? <Typography.Text type="secondary">今日等待方 · {waiting}</Typography.Text> : null}
  </div>;
}

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return <Typography.Text><Typography.Text type="secondary">{label} </Typography.Text>{value}</Typography.Text>;
}

const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long', timeZone: 'UTC' });

function DateFact({ label, date }: { readonly label: string; readonly date: string | null }) {
  if (date === null) return <Fact label={label} value="未确认" />;
  const iso = new Date(date);
  const title = Number.isNaN(iso.valueOf()) ? date : `${date} ${weekday.format(iso)}`;
  return <Fact label={label} value={<Tooltip title={title}><time dateTime={date} aria-label={title}>
    {formatTableDate({ iso: date, now: new Date() })}</time></Tooltip>} />;
}

function NextFollowUp({ face }: { readonly face: RowFace }) {
  if (face.nextFollowUpAt === undefined) return null;
  return <div className="today-row-line today-row-reminder">
    <Typography.Text>下次跟进 · {formatDateTime(face.nextFollowUpAt)}</Typography.Text>
    {face.nextFollowUpTarget === undefined ? null : <Typography.Text type="secondary">{face.nextFollowUpTarget}</Typography.Text>}
  </div>;
}

const mainButton = { className: 'today-action-primary', color: 'default', variant: 'outlined' } satisfies ButtonProps;
const secondaryButton = { type: 'text' } satisfies ButtonProps;

function RowActions({ card, row, copy, isFactoryChase, onOpen, ...work }: Pick<RowProps,
  'row' | 'copy' | 'arrivalFocusId' | 'isFactoryChase' | 'assignmentOrder' | 'onOpen' | 'onQuick'> & { readonly card: CardPresentation }) {
  const { primary, identity } = card;
  const copyAction = primary.kind === 'copy' ? primary.action : isFactoryChase === true ? copy : null;
  return <Flex className="today-touch today-row-actions" align="center" gap={space[0]} wrap>
    <RowWorkAction {...work} primary={primary} rowId={row.id} />
    {copyAction === null ? null : <Button {...(primary.kind === 'copy' ? mainButton : secondaryButton)} icon={<CopyOutlined aria-hidden />}
      disabled={copyAction.disabled} onClick={copyAction.run}>{copyAction.label}</Button>}
    {primary.kind === 'detail' ? <Button {...mainButton} onClick={onOpen} aria-label={`查看详情 ${identity}`}>查看详情</Button> : null}
    <RowMenu actions={card.overflow} copy={copyAction === null ? copy : null} identity={identity} onQuick={work.onQuick} />
  </Flex>;
}

function RowWorkAction({ primary, rowId, arrivalFocusId, assignmentOrder, onQuick }: Pick<RowProps,
  'arrivalFocusId' | 'assignmentOrder' | 'onQuick'> & { readonly primary: PrimaryAction; readonly rowId: string }) {
  if (primary.kind === 'receipt') return <>
    <ReceiptAction memo={primary.memo} isFocused={arrivalFocusId === primary.memo.batchId} />
    {assignmentOrder === undefined ? null : <TodayOrderLink order={assignmentOrder} focusOwner returnRowId={rowId}>分配采购负责人</TodayOrderLink>}
  </>;
  if (primary.kind === 'assign') return <TodayOrderLink order={primary.order} primary focusOwner returnRowId={rowId}>分配采购负责人</TodayOrderLink>;
  if (primary.kind === 'quick') return <Button {...mainButton} icon={actionIcon(primary.action.kind)}
    onClick={() => onQuick(primary.action.kind)}>{primary.action.label}</Button>;
  return null;
}

function preferredAction({ actions, hasCopy, isScheduled }: {
  readonly actions: readonly QuickAction[];
  readonly hasCopy: boolean;
  readonly isScheduled: boolean;
}): QuickAction | undefined {
  if (isScheduled) return actions.find((action) => action.kind === 'note') ?? actions[0];
  const first = actions[0];
  return !hasCopy || first?.kind === 'date' ? first : undefined;
}

type RowMenuProps = Pick<RowProps, 'copy' | 'onQuick'> & {
  readonly actions: readonly QuickAction[];
  readonly identity: string;
};

function RowMenu({ actions, copy, identity, onQuick }: RowMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [isOpen, setOpen] = useState(false);
  function changeOpen(open: boolean) {
    // Ant Design keeps the menu mounted during its exit animation.
    const menu = document.getElementById(menuId);
    if (menu !== null) menu.inert = !open;
    setOpen(open);
  }
  function closeAndRestoreFocus() {
    changeOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (!isOpen || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeAndRestoreFocus();
  }
  function run(action: () => void) {
    closeAndRestoreFocus();
    action();
  }
  const items = actions.map((action) => ({
    key: action.kind, label: action.label, icon: actionIcon(action.kind),
    onClick: () => run(() => onQuick(action.kind)),
  }));
  const entries = copy === null ? items : [{
    key: 'copy', label: copy.label, disabled: copy.disabled, icon: <CopyOutlined aria-hidden />,
    onClick: () => run(copy.run),
  }, ...items];
  if (entries.length === 0) return null;
  return <Dropdown trigger={['click']} autoFocus open={isOpen} onOpenChange={changeOpen}
    menu={{ id: menuId, items: entries, onKeyDown: closeOnEscape }}>
    <Button ref={trigger} className="today-action-more" type="text" aria-haspopup="menu" aria-expanded={isOpen}
      aria-controls={isOpen ? menuId : undefined} onKeyDown={closeOnEscape}
      aria-label={`更多操作 ${identity}`} title="更多操作" icon={<EllipsisOutlined aria-hidden />} />
  </Dropdown>;
}
