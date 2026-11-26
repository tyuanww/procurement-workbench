import { Button, Card, Dropdown, Flex, Typography } from 'antd';
import { CopyOutlined, DownOutlined } from '@ant-design/icons';
import { useRef, useState, type ReactNode } from 'react';
import { actionIcon, rowStyle, type BoardRow, type QuickAction, type RowFace } from '../../features/today/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime } from '../../shared/ui/format.js';
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
  readonly isScheduled: boolean;
  readonly showReminder?: boolean;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
};

type PrimaryAction =
  | { readonly kind: 'receipt'; readonly memo: ReceiptWork }
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
  const { face } = props.row;
  const style = rowStyle({ isFocused: props.isFocused, isFading: props.isFading });
  const content = <div className="today-row-layout">
    <RowFacts card={card} face={face} receipt={props.receipt} headingLevel={props.headingLevel}
      isScheduled={props.isScheduled} showReminder={props.showReminder === true} />
    <RowActions {...props} card={card} />
  </div>;
  return props.isCard
    ? <article aria-label={card.identity}><Card className="today-row today-work-card today-batch-card" size="small" style={style}>{content}</Card></article>
    : <div className="today-row today-work-card today-batch-card today-grouped-row" role="group" aria-label={card.identity} style={style}>{content}</div>;
}

function presentRow({ row, batchSeq, receipt, copy, isScheduled }: RowProps, actions: readonly QuickAction[]): CardPresentation {
  const { face } = row;
  const orderNo = face.orderNo === '—' ? undefined : face.orderNo;
  const productName = face.productName === '—' ? undefined : face.productName;
  const batch = batchSeq === undefined ? undefined : `第 ${batchSeq} 批`;
  const primary = choosePrimary({ actions, receipt, copy, isScheduled });
  return {
    title: productName ?? '品名待补充',
    batch,
    identity: [orderNo, productName, batch].filter(Boolean).join(' · '),
    primary,
    overflow: primary.kind === 'quick' ? actions.filter((action) => action.kind !== primary.action.kind) : actions,
    inTransit: face.inTransit ?? receiptQuantity(receipt),
  };
}

function choosePrimary({ actions, receipt, copy, isScheduled }: Pick<RowProps, 'receipt' | 'copy' | 'isScheduled'> & { readonly actions: readonly QuickAction[] }): PrimaryAction {
  if (receipt !== undefined) return { kind: 'receipt', memo: receipt };
  const quick = preferredAction({ actions, hasCopy: copy !== null, isScheduled });
  if (quick !== undefined) return { kind: 'quick', action: quick };
  return copy === null ? { kind: 'detail' } : { kind: 'copy', action: copy };
}

const quantityFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

function receiptQuantity(receipt: ReceiptWork | undefined): string | undefined {
  if (receipt === undefined) return undefined;
  return `在途待收 ${quantityFormat.format(receipt.inTransitQty)} ${receipt.unit}`;
}

function RowFacts({ card, face, receipt, headingLevel, isScheduled, showReminder }: Pick<RowProps, 'receipt' | 'headingLevel' | 'isScheduled' | 'showReminder'> & { readonly card: CardPresentation; readonly face: RowFace }) {
  const hasReminderContext = showReminder === true || isScheduled || (card.primary.kind === 'quick' && card.primary.action.kind === 'note');
  const waiting = isScheduled && face.nextFollowUpTarget !== undefined ? undefined : face.waiting;
  return <div className="today-row-facts">
    <RowHeading card={card} face={face} receipt={receipt} headingLevel={headingLevel} />
    <DeliveryFacts face={face} receipt={receipt} waiting={waiting} showReminder={showReminder === true} />
    <div className="today-row-line today-row-quantities">
      {face.remaining === undefined ? null : <Typography.Text>{face.remaining}</Typography.Text>}
      {card.inTransit === undefined ? null : <Typography.Text>{card.inTransit}</Typography.Text>}
    </div>
    {hasReminderContext ? <NextFollowUp face={face} /> : null}
  </div>;
}

function RowHeading({ card, face, receipt, headingLevel }: Pick<RowProps, 'receipt' | 'headingLevel'> & { readonly card: CardPresentation; readonly face: RowFace }) {
  return <div className="today-row-line today-batch-title">
    <Typography.Title level={headingLevel} className="today-row-title">{card.title}</Typography.Title>
    <RowStatus face={face} receipt={receipt} />
    {face.isUnassigned === true ? <Typography.Text className="today-batch-meta" type="secondary">未分配</Typography.Text> : null}
    {card.batch === undefined ? null : <Typography.Text className="today-batch-meta" type="secondary">{card.batch}</Typography.Text>}
  </div>;
}

function RowStatus({ face, receipt }: { readonly face: RowFace; readonly receipt: ReceiptWork | undefined }) {
  if (receipt === undefined) return face.overdueTone === 'danger'
    ? <StatusTag status="overdue" label={face.overdue} />
    : <Typography.Text className="today-batch-meta" type="secondary">{face.reason}</Typography.Text>;
  const isLate = receipt.status === 'overdue';
  return <StatusTag status={isLate ? 'overdue' : 'due_today'} label={isLate ? '到仓逾期' : '今日应到'} />;
}

function DeliveryFacts({ face, receipt, waiting, showReminder }: {
  readonly face: RowFace;
  readonly receipt: ReceiptWork | undefined;
  readonly waiting: string | undefined;
  readonly showReminder: boolean;
}) {
  if (receipt === undefined) return <div className="today-row-line">
    {face.date === '—' ? null : <Fact label="采购确认到仓日" value={face.date} />}
    {waiting === undefined ? null : <Typography.Text type="secondary">等待方 · {waiting}</Typography.Text>}
  </div>;
  return <div className="today-row-line today-row-receipt-facts">
    <Fact label="采购确认到仓日" value={receipt.confirmedDate ?? '未确认'} />
    <Fact label="收货方" value={receipt.warehouse ?? '未命名'} />
    {face.date !== '—' && face.date !== receipt.confirmedDate ? <Fact label="待办日期" value={face.date} /> : null}
    {showReminder && waiting !== undefined ? <Typography.Text type="secondary">今日等待方 · {waiting}</Typography.Text> : null}
  </div>;
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return <Typography.Text><Typography.Text type="secondary">{label} </Typography.Text>{value}</Typography.Text>;
}

function NextFollowUp({ face }: { readonly face: RowFace }) {
  if (face.nextFollowUpAt === undefined) return null;
  return <div className="today-row-line">
    <Typography.Text>下次跟进 · {formatDateTime(face.nextFollowUpAt)}</Typography.Text>
    {face.nextFollowUpTarget === undefined ? null : <Typography.Text type="secondary">{face.nextFollowUpTarget}</Typography.Text>}
  </div>;
}

function RowActions({ card, copy, arrivalFocusId, onOpen, onQuick }: Pick<RowProps, 'copy' | 'arrivalFocusId' | 'onOpen' | 'onQuick'> & { readonly card: CardPresentation }) {
  const { primary, identity } = card;
  return <Flex className="today-touch today-row-actions" align="center" gap={space[0]} wrap>
    {primary.kind === 'receipt' ? <ReceiptAction memo={primary.memo} isFocused={arrivalFocusId === primary.memo.batchId} /> : null}
    {primary.kind === 'quick' ? <Button type="primary" icon={actionIcon(primary.action.kind)} onClick={() => onQuick(primary.action.kind)}>{primary.action.label}</Button> : null}
    {primary.kind === 'copy' ? <Button className="today-action-copy" type="primary" icon={<CopyOutlined aria-hidden />}
      disabled={primary.action.disabled} onClick={primary.action.run}>{primary.action.label}</Button> : null}
    <Button className="today-action-detail" type={primary.kind === 'detail' ? 'primary' : 'text'}
      onClick={onOpen} aria-label={`查看详情 ${identity}`}>查看详情</Button>
    <RowMenu actions={card.overflow} copy={primary.kind === 'copy' ? null : copy} identity={identity} onQuick={onQuick} />
  </Flex>;
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

function RowMenu({ actions, copy, identity, onQuick }: {
  readonly actions: readonly QuickAction[];
  readonly copy: CopyAction | null;
  readonly identity: string;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [isOpen, setOpen] = useState(false);
  function run(action: () => void) {
    setOpen(false);
    trigger.current?.focus();
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
  return <Dropdown trigger={['click']} autoFocus open={isOpen} onOpenChange={setOpen} menu={{ items: entries }}>
    <Button ref={trigger} className="today-action-more" type="text" aria-haspopup="menu" aria-expanded={isOpen}
      aria-label={`更多操作 ${identity}`} icon={<DownOutlined aria-hidden />} iconPlacement="end">更多</Button>
  </Dropdown>;
}
