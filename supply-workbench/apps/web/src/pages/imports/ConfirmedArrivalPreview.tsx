import { useEffect, useState } from 'react';
import { Alert, Button, Card, Flex, Skeleton, Table, Typography, type TableProps } from 'antd';
import { ConfirmedArrivalPayloadSchema, ImportRowViewSchema, listResponseSchema, type ImportBatchSummary, type ImportRowView } from '@sw/contracts';
import { importActionLabel } from '@sw/domain';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { space } from '../../theme/tokens.js';
import { ImportPagination } from './ImportPagination.js';
import { ImportSourceButton, ImportSourceDrawer, sourceText, UnavailableImportSource, type ImportSourceRecord } from './ImportSourceDrawer.js';
import { ARRIVAL_SOURCE_PAGE_SIZE, importSourceKey, importSourceQuery, previewPage, readArrivalImportSource, useImportSource, type ImportSourceState } from './import-source.js';

const rowsSchema = listResponseSchema(ImportRowViewSchema);
type Row = ReturnType<typeof readRow>;
type ArrivalDate = ReturnType<typeof ConfirmedArrivalPayloadSchema.parse>['date'];
type Load =
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly rows: readonly Row[] };

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

function columns(source: ImportSourceState): NonNullable<TableProps<Row>['columns']> {
  return [
  { title: '原行', key: 'source', render: (_, row) => <ImportSourceButton source={source} recordKey={importSourceKey('arrival', row)}
    label={`查看来源 ${[row.payload?.po, row.payload?.sequence && `第 ${row.payload.sequence} 批`, sourceText(row)].filter(Boolean).join(' · ')}`} /> },
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
}

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

export function ConfirmedArrivalPreview({ summary }: { readonly summary: ImportBatchSummary }) {
  const source = useImportSource();
  const page = previewPage(source.params, importSourceQuery.arrival);
  const readPage = readArrivalImportSource(source.sourceKey)?.page ?? page;
  const { load, total, retry } = useArrivalRows({ id: summary.id, revision: summary.revision, page: readPage });
  const { selected, visiblePage, isOutside, isUnavailable, canShowPage } = arrivalSelection({ load, total, page, readPage, sourceKey: source.sourceKey });
  const drawerSource = {
    ...source,
    close: () => source.update({ drawer: null, source: null, ...arrivalPagePatch(visiblePage) }, true),
  };
  useEffect(() => {
    if (isOutside) changeArrivalPage(source, visiblePage);
  }, [isOutside, source, visiblePage]);
  return (
    <Card title="确认到货日预览">
      {isUnavailable ? <UnavailableImportSource onClear={source.close} /> : null}
      {canShowPage ? <>
        <ArrivalResults load={isOutside ? null : load} source={source} onRetry={retry} />
        <ImportPagination label="确认到货日明细分页" page={visiblePage} pageSize={ARRIVAL_SOURCE_PAGE_SIZE} total={total}
          onChange={(value) => changeArrivalPage(source, value)} />
      </> : null}
      <ImportSourceDrawer source={drawerSource} fileName={summary.file.originalName} record={selected === undefined ? null : arrivalSource(selected, summary.status)} />
    </Card>
  );
}

function arrivalSelection({ load, total, page, readPage, sourceKey }: {
  readonly load: Load | null; readonly total: number; readonly page: number; readonly readPage: number; readonly sourceKey: string | null;
}) {
  const isReady = load?.kind === 'ready';
  const selected = isReady ? load.rows.find((row) => importSourceKey('arrival', row) === sourceKey) : undefined;
  const visiblePage = Math.min(selected === undefined ? page : readPage, Math.max(1, Math.ceil(total / ARRIVAL_SOURCE_PAGE_SIZE)));
  const isUnavailable = isReady && sourceKey !== null && selected === undefined;
  return { selected, visiblePage, isOutside: isReady && page !== visiblePage, isUnavailable, canShowPage: !isUnavailable || readPage === page };
}

function useArrivalRows({ id, revision, page }: Pick<ImportBatchSummary, 'id' | 'revision'> & { readonly page: number }) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([revision, page, attempt]);
  const [response, setResponse] = useState<{ readonly key: string; readonly load: Load; readonly total: number }>();
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), pageSize: String(ARRIVAL_SOURCE_PAGE_SIZE) });
    void apiGetWithSignal({ path: `/api/v1/imports/${encodeURIComponent(id)}/rows?${query}`, schema: rowsSchema, signal: controller.signal })
      .then(({ items, page: result }) => {
        if (!controller.signal.aborted) setResponse({ key: requestKey, load: { kind: 'ready', rows: items.map(readRow) }, total: result.total });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResponse((previous) => ({ key: requestKey, load: { kind: 'failed' }, total: previous?.total ?? 0 }));
      });
    return () => controller.abort();
  }, [id, page, requestKey]);
  return {
    load: response?.key === requestKey ? response.load : null,
    total: response?.total ?? 0,
    retry: () => setAttempt((value) => value + 1),
  };
}

function changeArrivalPage(source: ImportSourceState, page: number) {
  source.update(arrivalPagePatch(page), true);
}

function arrivalPagePatch(page: number) {
  return { [importSourceQuery.arrival]: page === 1 ? null : String(page) };
}

function ArrivalResults({ load, source, onRetry }: {
  readonly load: Load | null;
  readonly source: ImportSourceState;
  readonly onRetry: () => void;
}) {
  if (load === null) return <div role="status" aria-label="正在读取确认到货日明细"><Skeleton active /></div>;
  if (load.kind === 'failed') return <Alert type="error" title="确认到货日预览没有读出来。"
    action={<Flex gap="small" wrap>
      <Button onClick={onRetry}>重试</Button>
      {source.sourceKey === null ? null : <Button onClick={source.close}>清除来源定位</Button>}
    </Flex>} />;
  return (
    <div className="confirmed-arrival-preview">
      <style>{previewCss}</style>
      <Typography.Paragraph type="secondary" id="arrival-preview-scroll" style={{ marginBottom: space[2] }}>
        横向滚动可查看完整明细。
      </Typography.Paragraph>
      <div role="region" aria-label="确认到货日明细" aria-describedby="arrival-preview-scroll" tabIndex={0} style={{ overflowX: 'auto' }}>
        <Table<Row> dataSource={load.rows} columns={columns(source)} rowKey="id" size="small" pagination={false} />
      </div>
    </div>
  );
}

function arrivalSource(row: Row, status: ImportBatchSummary['status']): ImportSourceRecord {
  const { payload } = row;
  return {
    key: importSourceKey('arrival', row), location: row,
    items: [
      { key: 'po', label: 'PO 单号', children: payload?.po ?? '未填' },
      { key: 'seq', label: '要货批次序号', children: payload?.sequence ?? '未填' },
      { key: 'dates', label: '导出时与本次确认到货日', children: `${row.before} → ${row.after}` },
      { key: 'result', label: '处理结果', children: row.result },
    ],
    result: arrivalTarget(row, status),
  };
}

function arrivalTarget({ action, payload }: Row, status: ImportBatchSummary['status']): ImportSourceRecord['result'] {
  if (status === 'committed' && (action === 'update' || action === 'unchanged') &&
    payload !== null && payload.exportedLineId !== null) {
    return { kind: 'batch', lineId: payload.exportedLineId, batchId: payload.batchId };
  }
  return { kind: 'local', text: '这条记录仅供当前导入核对。' };
}

function readRow(row: ImportRowView) {
  const parsed = ConfirmedArrivalPayloadSchema.safeParse(row.parsed);
  const payload = parsed.success ? parsed.data : null;
  const issues = row.issues.map((issue) => issue.message);
  const explanation = issues.length === 0 ? row.skipReason : issues.join('。');
  return {
    id: row.id,
    sheetName: row.sheetName,
    rowNo: row.rowNo,
    action: row.action,
    payload,
    before: dateText(payload?.exportedDate),
    after: dateText(payload?.date),
    result: explanation === null ? importActionLabel(row.action) : `${importActionLabel(row.action)} · ${explanation}`,
  };
}

function dateText(date: ArrivalDate | undefined): string {
  return (date?.value ?? date?.raw) || '—';
}
