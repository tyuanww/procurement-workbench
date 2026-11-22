import { useEffect, useState } from 'react';
import { Alert, Card, Table, Typography, type TableProps } from 'antd';
import { ConfirmedArrivalPayloadSchema, ImportRowViewSchema, listResponseSchema, type ImportRowView } from '@sw/contracts';
import { importActionLabel } from '@sw/domain';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { space } from '../../theme/tokens.js';
import { ImportPagination } from './ImportPagination.js';

const PAGE_SIZE = 20;
const rowsSchema = listResponseSchema(ImportRowViewSchema);
type Row = ReturnType<typeof readRow>;
type ArrivalDate = ReturnType<typeof ConfirmedArrivalPayloadSchema.parse>['date'];
type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly rows: readonly Row[]; readonly total: number };

const compactOnly = 'confirmed-arrival-compact';
const wideOnly = 'confirmed-arrival-wide';
const previewCss = `
  .confirmed-arrival-preview { container-type: inline-size; }
  .confirmed-arrival-preview .ant-table-wrapper { min-inline-size: max-content; }
  .confirmed-arrival-preview .confirmed-arrival-compact { display: none; }
  @container (width < 620px) {
    .confirmed-arrival-preview .confirmed-arrival-compact { display: table-cell; }
    .confirmed-arrival-preview .confirmed-arrival-wide { display: none; }
  }
`;

const columns: NonNullable<TableProps<Row>['columns']> = [
  { title: '批次核对', key: 'check', className: compactOnly, render: (_, row) => <BatchCheck row={row} /> },
  { title: '行号', dataIndex: 'rowNo', className: wideOnly },
  { title: 'PO 单号', key: 'po', className: wideOnly, render: (_, row) => row.payload?.po ?? '—' },
  { title: '品名', key: 'name', render: (_, row) => row.payload?.name ?? '—' },
  { title: '批次序号', key: 'sequence', className: wideOnly, render: (_, row) => row.payload?.sequence ?? '—' },
  { title: '仓库', key: 'warehouse', render: (_, row) => row.payload?.warehouse ?? '—' },
  { title: '导出时确认到货日', key: 'exportedDate', className: wideOnly, render: (_, row) => row.before },
  { title: '采购确认到货日', key: 'date', className: wideOnly, render: (_, row) => row.after },
  { title: '改期原因', key: 'reason', render: (_, row) => row.payload?.reason ?? '—' },
  { title: '处理结果', dataIndex: 'result', className: wideOnly },
  { title: '要货批次 ID', key: 'batchId', render: (_, row) => row.payload?.batchId ?? '—' },
];

function BatchCheck({ row }: { readonly row: Row }) {
  const sequence = row.payload?.sequence ?? '—';
  const values = [
    ['批次序号', `${sequence} · 第 ${row.rowNo} 行`],
    ['PO 单号', row.payload?.po ?? '—'],
    ['导出时', row.before],
    ['本次确认', row.after],
    ['处理结果', row.result],
  ];
  return (
    <dl style={{ width: 192, margin: 0, overflowWrap: 'anywhere' }}>
      {values.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '4em minmax(0, 1fr)', gap: space[1] }}>
          <dt>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ConfirmedArrivalPreview({ id, revision }: { readonly id: string; readonly revision: number }) {
  const [page, setPage] = useState(1);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    void apiGetWithSignal({ path: `/api/v1/imports/${encodeURIComponent(id)}/rows?${query}`, schema: rowsSchema, signal: controller.signal })
      .then(({ items, page: result }) => { if (!controller.signal.aborted) setLoad({ kind: 'ready', rows: items.map(readRow), total: result.total }); })
      .catch(() => { if (!controller.signal.aborted) setLoad({ kind: 'failed' }); });
    return () => controller.abort();
  }, [id, page, revision]);
  return (
    <Card title="确认到货日预览" loading={load.kind === 'loading'}>
      {load.kind === 'failed' ? <Alert type="error" title="读取确认到货日预览失败，请刷新重试。" /> : null}
      {load.kind === 'ready' ? (
        <div className="confirmed-arrival-preview">
          <style>{previewCss}</style>
          <Typography.Paragraph type="secondary" id="arrival-preview-scroll" style={{ marginBottom: space[2] }}>
            横向滚动可查看完整明细。
          </Typography.Paragraph>
          <div role="region" aria-label="确认到货日明细" aria-describedby="arrival-preview-scroll" tabIndex={0} style={{ overflowX: 'auto' }}>
            <Table<Row> dataSource={load.rows} columns={columns} rowKey="id" size="small" pagination={false} />
          </div>
          <ImportPagination label="确认到货日明细分页" page={page} pageSize={PAGE_SIZE} total={load.total} onChange={setPage} />
        </div>
      ) : null}
    </Card>
  );
}

function readRow(row: ImportRowView) {
  const parsed = ConfirmedArrivalPayloadSchema.safeParse(row.parsed);
  const payload = parsed.success ? parsed.data : null;
  const issues = row.issues.map((issue) => issue.message);
  const explanation = issues.length === 0 ? row.skipReason : issues.join('。');
  return {
    id: row.id,
    rowNo: row.rowNo,
    payload,
    before: dateText(payload?.exportedDate),
    after: dateText(payload?.date),
    result: explanation === null ? importActionLabel(row.action) : `${importActionLabel(row.action)} · ${explanation}`,
  };
}

function dateText(date: ArrivalDate | undefined): string {
  return (date?.value ?? date?.raw) || '—';
}
