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
  readonly orderNo: string | undefined;
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
    <RowFacts card={card} face={face} receipt={props.receipt} headingLevel={props.headingLevel} />
    <RowActions {...props} card={card} />
    <RowFollowUp face={face} receipt={props.receipt} isScheduled={props.isScheduled} />
  </div>;
  return props.isCard
    ? <article><Card className="today-row today-work-card" size="small" style={style}>{content}</Card></article>
    : <div className="today-row today-work-card today-grouped-row" style={style}>{content}</div>;
}

function presentRow({ row, batchSeq, receipt, copy, isScheduled }: RowProps, actions: readonly QuickAction[]): CardPresentation {
  const { face } = row;
  const orderNo = face.orderNo === '—' ? undefined : face.orderNo;
  const productName = face.productName === '—' ? undefined : face.productName;
  const batch = batchSeq === undefined ? undefined : `第 ${batchSeq} 批`;
  const primary = choosePrimary({ actions, receipt, copy, isScheduled });
  return {
    title: productName ?? '品名待补充',
    orderNo,
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

function RowFacts({ card, face, receipt, headingLevel }: Pick<RowProps, 'receipt' | 'headingLevel'> & { readonly card: CardPresentation; readonly face: RowFace }) {
  return <div className="today-row-facts">
    <Typography.Title level={headingLevel} className="today-row-title">{card.title}</Typography.Title>
    <div className="today-row-line today-row-identifiers">
      {card.orderNo === undefined ? null : <Typography.Text type="secondary">单号 {card.orderNo}</Typography.Text>}
      {card.batch === undefined ? null : <Typography.Text type="secondary">{card.batch}</Typography.Text>}
    </div>
    {receipt === undefined ? <div className="today-row-line">
      <Typography.Text>{face.reason}</Typography.Text>
      {face.overdueTone === 'danger' ? <StatusTag status="overdue" label={face.overdue} /> : null}
      {face.date === '—' ? null : <Typography.Text type="secondary">采购确认到仓日 {face.date}</Typography.Text>}
    </div> : <ReceiptFacts receipt={receipt} />}
    <div className="today-row-line today-row-quantities">
      {face.remaining === undefined ? null : <Typography.Text>{face.remaining}</Typography.Text>}
      {card.inTransit === undefined ? null : <Typography.Text>{card.inTransit}</Typography.Text>}
    </div>
  </div>;
}

function ReceiptFacts({ receipt }: { readonly receipt: ReceiptWork }) {
  const isLate = receipt.status === 'overdue';
  return <div className="today-row-line today-row-receipt-facts">
    <StatusTag status={isLate ? 'overdue' : 'due_today'} label={isLate ? '到仓逾期' : '今日应到'} />
    <Typography.Text><Typography.Text type="secondary">采购确认到仓日 </Typography.Text>{receipt.confirmedDate ?? '未确认'}</Typography.Text>
    <Typography.Text><Typography.Text type="secondary">收货方 </Typography.Text>{receipt.warehouse ?? '未命名'}</Typography.Text>
  </div>;
}

function RowFollowUp({ face, receipt, isScheduled }: { readonly face: RowFace; readonly receipt: ReceiptWork | undefined; readonly isScheduled: boolean }) {
  const followUp = face.nextFollowUpAt === undefined ? null : formatDateTime(face.nextFollowUpAt);
  return <div className="today-row-follow-up">
    <div className="today-row-line">
      {followUp === null ? null : <Typography.Text>下次跟进 · {followUp}</Typography.Text>}
      {receipt === undefined ? null : <ReceiptFollowUp face={face} receipt={receipt} />}
      {face.waiting === undefined ? null : <Typography.Text type="secondary">{receipt === undefined ? '等待方' : '跟进等待方'} · {face.waiting}</Typography.Text>}
      {face.isUnassigned === true ? <Typography.Text type="secondary">未分配</Typography.Text> : null}
    </div>
    {isScheduled ? <ScheduledNotes face={face} /> : null}
  </div>;
}

function ReceiptFollowUp({ face, receipt }: { readonly face: RowFace; readonly receipt: ReceiptWork }) {
  const hasOtherDate = face.date !== '—' && face.date !== receipt.confirmedDate;
  return <>
    <Typography.Text type="secondary">{face.reason}</Typography.Text>
    {hasOtherDate ? <Typography.Text type="secondary">待办日期 {face.date}</Typography.Text> : null}
  </>;
}

function ScheduledNotes({ face }: { readonly face: RowFace }) {
  return <>
    {face.latestFollowUp === undefined ? null : <Typography.Text type="secondary">最近跟进 · {face.latestFollowUp}</Typography.Text>}
    {face.latestPromise === undefined ? null : <Typography.Text type="secondary">最近承诺 · {face.latestPromise}</Typography.Text>}
  </>;
}

function RowActions({ card, copy, arrivalFocusId, onOpen, onQuick }: Pick<RowProps, 'copy' | 'arrivalFocusId' | 'onOpen' | 'onQuick'> & { readonly card: CardPresentation }) {
  const { primary, identity } = card;
  const copyAction = primary.kind === 'copy' ? primary.action : copy;
  return <Flex className="today-touch today-row-actions" align="center" gap={space[0]} wrap>
    {primary.kind === 'receipt' ? <ReceiptAction memo={primary.memo} isFocused={arrivalFocusId === primary.memo.batchId} /> : null}
    {primary.kind === 'quick' ? <Button type="primary" size="small" icon={actionIcon(primary.action.kind)} onClick={() => onQuick(primary.action.kind)}>{primary.action.label}</Button> : null}
    {copyAction === null ? null : <CopyButton copy={copyAction} primary={primary.kind === 'copy'} />}
    <Button type={primary.kind === 'detail' ? 'primary' : 'text'} size="small" onClick={onOpen} aria-label={`查看详情 ${identity}`}>查看详情</Button>
    <RowMenu actions={card.overflow} identity={identity} onQuick={onQuick} />
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

function RowMenu({ actions, identity, onQuick }: {
  readonly actions: readonly QuickAction[];
  readonly identity: string;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [isOpen, setOpen] = useState(false);
  if (actions.length === 0) return null;
  return <Dropdown trigger={['click']} autoFocus open={isOpen} onOpenChange={setOpen} menu={{ items: actions.map((action) => ({
    key: action.kind, label: action.label, icon: actionIcon(action.kind),
    onClick: () => { trigger.current?.focus(); onQuick(action.kind); },
  })) }}>
    <Button ref={trigger} type="text" size="small" aria-haspopup="menu" aria-expanded={isOpen} aria-label={`更多操作 ${identity}`} icon={<DownOutlined aria-hidden />} iconPlacement="end">更多</Button>
  </Dropdown>;
}

function CopyButton({ copy, primary }: { readonly copy: CopyAction; readonly primary: boolean }) {
  return <Button type={primary ? 'primary' : 'text'} size="small" icon={<CopyOutlined aria-hidden />} disabled={copy.disabled} onClick={copy.run}>{copy.label}</Button>;
}
