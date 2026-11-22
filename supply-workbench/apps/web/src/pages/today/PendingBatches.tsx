import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Flex, Pagination, Typography } from 'antd';
import { HintBatchResultSchema, type TodayResponse } from '@sw/contracts';
import { useCanWrite } from '../../shared/actor.js';
import { apiErrorMessage, apiSend } from '../../shared/api/client.js';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { MissingValue } from '../../shared/ui/widgets.js';
import { space } from '../../theme/tokens.js';

type PendingBatch = NonNullable<TodayResponse['pendingBatch']>[number];
const PAGE_SIZE = 50;

const missingLabels = {
  quantity: '计划数量',
  unit: '计划单位',
  receiver: '收货方',
} satisfies Record<PendingBatch['missingFields'][number], string>;

export function PendingBatches({ rows, onChanged }: {
  readonly rows: readonly PendingBatch[];
  readonly onChanged: (() => Promise<boolean>) | undefined;
}) {
  const canWrite = useCanWrite('lines.write');
  const [posting, setPosting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  if (currentPage !== page) setPage(currentPage);
  if (rows.length === 0 && notice === '') return null;
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

  return (
    <SectionGroup title="待建批次" meta={`${rows.length} 行`}>
      <div role="status">{notice}</div>
      {rows.slice(start, start + PAGE_SIZE).map((row) => (
        <PendingBatchItem key={row.orderLineId} row={row} posting={posting} onCreate={canWrite && onChanged !== undefined ? create : undefined} />
      ))}
      <Pagination align="end" current={currentPage} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage}
        size="small" hideOnSinglePage showSizeChanger={false} style={{ marginTop: space[2] }} />
    </SectionGroup>
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

function PendingBatchItem({ row, posting, onCreate }: {
  readonly row: PendingBatch;
  readonly posting: string | null;
  readonly onCreate: ((orderLineId: string) => Promise<void>) | undefined;
}) {
  return (
    <SectionRow action={
      <Flex align="center" gap="small" wrap onKeyDown={(event) => event.stopPropagation()}>
        <Link to={`/lines/${encodeURIComponent(row.orderLineId)}`}>查看订单</Link>
        {row.action === 'create' && onCreate !== undefined ? (
          <Button size="small" loading={posting === row.orderLineId} disabled={posting !== null} onClick={() => { void onCreate(row.orderLineId); }}>
            生成首批次
          </Button>
        ) : null}
      </Flex>
    }>
      <div style={{ overflowWrap: 'anywhere' }}><Typography.Text strong>{row.nameRaw || '品名未填写'}</Typography.Text>{' · '}{row.poRaw || <MissingValue reason="not_provided" />}</div>
      <Typography.Text type="secondary">
        订单数量 {row.qtyOrdered === null ? <MissingValue reason="not_provided" /> : row.qtyOrdered.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}{row.unit === null ? '' : ` ${row.unit}`}
        {row.missingFields.length > 0 ? ` · 待补${row.missingFields.map((field) => missingLabels[field]).join('、')}` : (row.action === 'detail' ? ' · 在订单详情确认收货方' : '')}
      </Typography.Text>
    </SectionRow>
  );
}
