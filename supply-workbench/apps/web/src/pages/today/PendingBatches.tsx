import { useEffect, useRef, useState } from 'react';
import { rowStyle, TodayOrderLink } from '../../features/today/index.js';
import { Button, Card, Flex, Pagination, Typography } from 'antd';
import { HintBatchResultSchema, type TodayResponse } from '@sw/contracts';
import { useCanWrite } from '../../shared/actor.js';
import { apiErrorMessage, apiSend } from '../../shared/api/client.js';
import { MissingValue } from '../../shared/ui/widgets.js';
import { space } from '../../theme/tokens.js';
import { workspaceRowId } from './today-focus.js';

type PendingBatch = NonNullable<TodayResponse['pendingBatch']>[number];
const PAGE_SIZE = 50;
export const PENDING_BATCH_TARGET = 'today-pending-batches';
const jumpTarget = { id: PENDING_BATCH_TARGET, className: 'today-jump-target', tabIndex: -1 };

const missingLabels = {
  quantity: '计划数量',
  unit: '计划单位',
  receiver: '收货方',
} satisfies Record<PendingBatch['missingFields'][number], string>;

type PendingBatchesProps = {
  readonly rows: readonly PendingBatch[];
  readonly focusId: string | null;
  readonly canFocus: boolean;
  readonly onChanged: (() => Promise<boolean>) | undefined;
};

export function usePendingBatches({ rows, focusId, canFocus, onChanged }: PendingBatchesProps) {
  const canWrite = useCanWrite('lines.write');
  const [posting, setPosting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const focusIndex = rows.findIndex((row) => row.orderLineId === focusId);
  const [page, setPage] = useState(() => focusIndex < 0 ? 1 : Math.floor(focusIndex / PAGE_SIZE) + 1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  if (currentPage !== page) setPage(currentPage);
  const start = (currentPage - 1) * PAGE_SIZE;

  async function create(orderLineId: string) {
    if (onChanged === undefined) return;
    setPosting(orderLineId);
    setNotice('');
    try {
      const message = await createFirstBatch(orderLineId);
      const isRefreshed = await onChanged();
      setNotice(isRefreshed ? message : `${message}。今日清单未刷新，可打开订单核对。`);
    } catch (error) {
      setNotice(apiErrorMessage(error) ?? '暂时无法生成首批次。请重试或打开订单核对。');
    } finally {
      setPosting(null);
    }
  }

  return {
    rows: rows.slice(start, start + PAGE_SIZE), total: rows.length, currentPage, setPage, focusId, canFocus, notice, posting,
    onCreate: canWrite && onChanged !== undefined ? create : undefined,
  };
}

type PendingBatchView = ReturnType<typeof usePendingBatches>;

export function pendingBatchRowId(orderLineId: string): string {
  return `pending:${orderLineId}`;
}

export function pendingBatchCards(view: PendingBatchView, focus: string | null) {
  return view.rows.map((row, index) => {
    const id = pendingBatchRowId(row.orderLineId);
    return (
      <li key={id} className="today-jump-target" {...(index === 0 ? jumpTarget : {})}>
        <article><Card className="today-row today-work-card" size="small" style={rowStyle({ isFocused: focus === id, isFading: false })}>
          <PendingBatchItem row={row} view={view} />
        </Card></article>
      </li>
    );
  });
}

export function PendingBatchPagination({ view, isCompact = false }: { readonly view: PendingBatchView; readonly isCompact?: boolean }) {
  if (view.total <= PAGE_SIZE) return null;
  return (
    <nav aria-label="待建批次分页" style={isCompact ? undefined : { marginTop: space[2] }}>
      <Pagination align={isCompact ? 'start' : 'end'} current={view.currentPage} pageSize={PAGE_SIZE} total={view.total} onChange={view.setPage}
        size="small" simple={isCompact} showSizeChanger={false} />
    </nav>
  );
}

async function createFirstBatch(orderLineId: string): Promise<string> {
  const result = await apiSend({
    path: '/api/v1/lines/bulk/hint-batches',
    method: 'POST',
    body: { lineIds: [orderLineId], includeCompleted: false, source: 'today' },
    schema: HintBatchResultSchema,
  });
  return result.created > 0 ? '已生成首批次' : result.skipped[0]?.reason ?? '请在订单详情核对';
}

function PendingBatchItem({ row, view }: {
  readonly row: PendingBatch;
  readonly view: PendingBatchView;
}) {
  const { focusId, canFocus, posting, onCreate } = view;
  const shouldFocus = canFocus && row.orderLineId === focusId;
  const orderLink = useRef<HTMLAnchorElement>(null);
  const restoredFocus = useRef(false);
  useEffect(() => {
    if (!shouldFocus || restoredFocus.current) return;
    restoredFocus.current = true;
    orderLink.current?.focus();
  }, [shouldFocus]);
  const canCreate = row.action === 'create' && onCreate !== undefined;
  const actions = (
    <Flex className="today-touch today-row-actions today-pending-actions" align="center" gap={space[0]} wrap>
      {canCreate ? (
        <Button type="primary" size="small" loading={posting === row.orderLineId} disabled={posting !== null} onClick={() => { void onCreate(row.orderLineId); }}>
          生成首批次
        </Button>
      ) : null}
      <TodayOrderLink id={workspaceRowId(pendingBatchRowId(row.orderLineId))} order={{ lineId: row.orderLineId }} isPending focusRef={orderLink} primary={!canCreate}>查看订单</TodayOrderLink>
    </Flex>
  );
  const facts = <>
      <div style={{ overflowWrap: 'anywhere' }}><Typography.Text strong>{row.nameRaw || '品名未填写'}</Typography.Text>{' · '}{row.poRaw || <MissingValue reason="not_provided" />}</div>
      <Typography.Text type="secondary">
        订单数量 {row.qtyOrdered === null ? <MissingValue reason="not_provided" /> : row.qtyOrdered.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}{row.unit === null ? '' : ` ${row.unit}`}
        {nextStep(row)}
      </Typography.Text>
  </>;
  return <div className="today-row-layout">
    <div className="today-row-facts">
      <Typography.Text type="secondary">待建批次</Typography.Text>
      {facts}
    </div>
    {actions}
  </div>;
}

function nextStep(row: PendingBatch) {
  if (row.missingFields.length > 0) return ` · 待补${row.missingFields.map((field) => missingLabels[field]).join('、')}`;
  return row.action === 'detail' ? ' · 在订单详情确认收货方' : '';
}
