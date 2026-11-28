import { Alert, Button, Empty, Result, Skeleton, Table } from 'antd';
import { useEffect, useRef, useState, type Key, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { type OrderLineRow, type ProcurementStore } from '@sw/contracts';
import { matchesProgressDrill, PROGRESS_STAYS, progressDrillKey, progressInsights, readProgressDrill, withProgressDrill, type ProgressDrill, type ProgressRow, type ProgressStay } from '../../features/progress/index.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { useCan } from '../../shared/actor.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { tablePagination } from '../../shared/ui/pagination.js';
import { useShellViewport } from '../../features/shell/index.js';
import { ArrivalMemos } from '../../features/today/index.js';
import { space, topBar } from '../../theme/tokens.js';
import { ProgressNote } from './progress-note.js';
import type { StoreBatchFacts } from './progress-batch-facts.js';
import { progressMobileColumns, progressMobileDetails, StoreBatchQuantities } from './progress-mobile.js';
import { loadProgress, type ProgressData } from './progress-load.js';
export { noteBatches, pagesFor } from './progress-load.js';
import { ProgressBreakdown, ProgressFilters } from './progress-overview.js';
export { ArrivalTag } from './progress-columns.js';
import { progressColumns } from './progress-columns.js';
import { matchingOa, scopedLineLink, StoreGapSummary, StoreOrderDetails, type ProgressOrderOrigin } from './store-order.js';
import { progressPagination, resetProgressPagination, withProgressPagination } from './store-query.js';
import { useDeliveryDetailLinks, useDeliveryReturnFocus, type ProgressOrderLinkProps } from './delivery-detail-link.js';

type ProgressScope = { readonly store: ProcurementStore; readonly isMine: boolean };
const emptyProgress: ProgressData = { rows: [], lines: new Map(), batchFacts: new Map(), arrivalMemos: [], actionNotice: '' };

export function ProgressCurrent({ filters, origin = 'progress', ...scope }: ProgressScope & {
  readonly filters: ReactNode;
  readonly origin?: ProgressOrderOrigin;
}) {
  const { data, error, isLoaded, hasLoadedResults, notes, now, retry } = useCurrentData(scope);
  const { oa, stay, drill, setOa, setStay, setDrill, clearFilters, tableRef, ...table } = useCurrentFilter();
  const isDelivery = origin === 'delivery';
  const oaRows = data.rows.filter((row) => matchingOa(data.lines.get(row.lineId), oa));
  const scopedRows = stay === null ? oaRows : oaRows.filter((row) => row.stay === stay);
  const rows = scopedRows.filter((row) => matchesProgressDrill(row, drill));
  const insight = progressInsights(scopedRows);
  const emptyMessage = currentEmptyMessage({ drill, oa, stay });
  const isSourceMissing = useDeliveryReturnFocus({ search: table.search, isReady: isDelivery && hasLoadedResults, region: tableRef });
  useProgressRowFocus({ tableRef, search: table.search, isLoaded, isDelivery });
  return (
    <>
      <ProgressFilters filters={filters} lines={data.rows.map((row) => data.lines.get(row.lineId))}
        oa={oa} stay={stay} drill={drill} overdue={isLoaded ? insight.overdue : null}
        onOa={setOa} onStay={setStay} onDrill={setDrill} isDelivery={isDelivery} />
      {insight.total === 0 ? null : <ProgressBreakdown insight={insight} drill={drill} onDrill={setDrill} />}
      <div ref={tableRef} role="region" aria-label={isDelivery ? '按店铺交付结果' : '当前进度表'} tabIndex={-1} style={{ scrollMarginTop: topBar + space[2] }}>
        <SectionGroup title="订单清单" meta={<ProgressMatchCount count={rows.length} drill={drill} hasRows={data.rows.length > 0} error={error} isLoaded={isLoaded} />}>
          {isSourceMissing ? <p role="status">当前页找不到原记录入口，已保留筛选。</p> : null}
          <ProgressActionNotice message={data.actionNotice} hasRows={scopedRows.length > 0} isLoaded={isLoaded} onRetry={retry} />
          <ProgressBody rows={data.rows} error={error} isLoaded={isLoaded} onRetry={retry}>
            <ProgressTable notes={notes} now={now} {...table} rows={rows} lines={data.lines} batchFacts={data.batchFacts} emptyMessage={emptyMessage} origin={origin} clearFilters={clearFilters} />
          </ProgressBody>
        </SectionGroup>
      </div>
      {isLoaded ? <StoreGapSummary lines={oaRows.map((row) => data.lines.get(row.lineId))} /> : null}
      {isLoaded ? <ArrivalMemos memos={memosForOa(data, oa)} /> : null}
    </>
  );
}

function useProgressRowFocus({ tableRef, search, isLoaded, isDelivery }: {
  readonly tableRef: { readonly current: HTMLDivElement | null };
  readonly search: string;
  readonly isLoaded: boolean;
  readonly isDelivery: boolean;
}) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(search).get('focusLine');
    if (!isLoaded || id === null || last.current === search) return;
    if (isDelivery && document.activeElement !== document.body) return;
    const row = tableRef.current?.querySelector(`tr[data-row-key="${CSS.escape(id)}"]`);
    row?.querySelector('a')?.focus();
    if (row != null) last.current = search;
  }, [isLoaded, search, tableRef, isDelivery]);
}

function currentEmptyMessage({ drill, oa, stay }: { readonly drill: ProgressDrill; readonly oa: string | null; readonly stay: ProgressStay | null }) {
  if (drill.kind !== 'all') return '当前指标没有匹配的订单行。';
  if (stay !== null) return '所选停留天数没有匹配的订单行。';
  return oa === null ? null : '这个 OA 没有进行中的成品订单行。';
}

function ProgressMatchCount({ count, drill, hasRows, error, isLoaded }: {
  readonly count: number;
  readonly drill: ProgressDrill;
  readonly hasRows: boolean;
  readonly error: string;
  readonly isLoaded: boolean;
}) {
  const shouldShow = isLoaded && drill.kind !== 'all' && (error === '' || hasRows);
  return <span role="status">{shouldShow ? `匹配 ${formatQuantity(count)} 行` : ''}</span>;
}

function ProgressActionNotice(props: { readonly message: string; readonly hasRows: boolean; readonly isLoaded: boolean; readonly onRetry: () => void }) {
  if (!props.isLoaded || !props.hasRows || props.message === '') return null;
  return <Alert type="warning" showIcon title={props.message} action={<Button onClick={props.onRetry}>重试</Button>} />;
}

function useCurrentFilter() {
  const [params, setParams] = useSearchParams();
  const oa = params.get('oa');
  const savedDrill = readProgressDrill(params.get('drill'));
  const savedStay = PROGRESS_STAYS.find(({ bucket }) => bucket === params.get('stay'));
  const stay = savedStay?.bucket ?? (savedDrill.kind === 'stay' ? savedDrill.bucket : null);
  const drill: ProgressDrill = savedDrill.kind === 'stay' ? { kind: 'all' } : savedDrill;
  const { page, pageSize } = progressPagination(params);
  const tableRef = useRef<HTMLDivElement>(null);
  const writePage = (nextPage: number, nextSize: number) => setParams(
    withProgressPagination(params, { page: nextPage, pageSize: nextSize }), { preventScrollReset: true },
  );
  const writeFilters = (nextDrill: ProgressDrill, nextStay: ProgressStay | null) => {
    const next = withProgressDrill(resetProgressPagination(params), nextDrill);
    if (nextStay === null) next.delete('stay');
    else next.set('stay', nextStay);
    setParams(next, { preventScrollReset: true });
  };
  return {
    oa, stay, drill, tableRef, page, pageSize, search: params.toString(),
    expanded: params.getAll('openLine'),
    setExpanded: (keys: readonly Key[]) => setParams(expandedLineParams(params, keys), { replace: true, preventScrollReset: true }),
    clearFilters: () => {
      const next = oaParams(withProgressDrill(resetProgressPagination(params), { kind: 'all' }), null);
      next.delete('stay');
      setParams(next, { preventScrollReset: true });
    },
    setPage: (value: number) => writePage(value, pageSize),
    setPageSize: (value: number) => writePage(1, value),
    setOa: (value: string | null) => setParams(oaParams(resetProgressPagination(params), value), { preventScrollReset: true }),
    setStay: (value: ProgressStay | null) => writeFilters(drill, value),
    setDrill: (value: ProgressDrill) => {
      if (value.kind === 'all' && drill.kind === 'all') return;
      const next: ProgressDrill = progressDrillKey(value) === progressDrillKey(drill) ? { kind: 'all' } : value;
      writeFilters(next, stay);
    },
  };
}

function useCurrentData({ store, isMine }: ProgressScope) {
  const [data, setData] = useState(emptyProgress);
  const [error, setError] = useState('');
  const [now] = useState(() => new Date());
  const [loadedScope, setLoadedScope] = useState<ProgressScope | null>(null);
  const [reload, setReload] = useState(0);
  const [notes, setNotes] = useState<Readonly<Record<string, string>>>({});
  const generation = useRef(0);
  const requestedScope = useRef<ProgressScope>({ store, isMine });
  useEffect(() => {
    const current = ++generation.current;
    setLoadedScope(null);
    if (store !== requestedScope.current.store || isMine !== requestedScope.current.isMine) {
      requestedScope.current = { store, isMine };
      setData(emptyProgress);
      setNotes({});
      setError('');
    }
    void loadProgress({ store, isMine, current, latest: () => generation.current, setData, setNotes, setError })
      .finally(() => { if (current === generation.current) setLoadedScope({ store, isMine }); });
    return () => { generation.current++; };
  }, [reload, store, isMine]);
  const isLoaded = loadedScope?.store === store && loadedScope.isMine === isMine;
  return { data: isLoaded ? data : emptyProgress, error, isLoaded, hasLoadedResults: isLoaded && error === '', notes, now,
    retry: () => setReload((value) => value + 1) };
}

function memosForOa({ lines, arrivalMemos }: ProgressData, oa: string | null) {
  const visibleIds = new Set<string>();
  for (const line of lines.values()) {
    if (!matchingOa(line, oa)) continue;
    visibleIds.add(line.id);
    for (const material of line.storeProgress?.materials ?? []) visibleIds.add(material.id);
  }
  return arrivalMemos.filter((memo) => visibleIds.has(memo.line.id));
}

function expandedLineParams(params: URLSearchParams, keys: readonly Key[]): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('openLine');
  next.delete('focusLine');
  for (const key of keys) next.append('openLine', String(key));
  return next;
}

function oaParams(params: URLSearchParams, value: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null) next.delete('oa');
  else next.set('oa', value);
  return next;
}

function ProgressBody(props: { readonly rows: readonly ProgressRow[]; readonly error: string; readonly isLoaded: boolean; readonly onRetry: () => void; readonly children: ReactNode }) {
  if (!props.isLoaded) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (props.error !== '' && props.rows.length === 0) {
    return (
      <Result
        status="error"
        title="进度没有读出来"
        subTitle={props.error}
        extra={[
          <Button key="retry" type="primary" onClick={props.onRetry}>重试</Button>,
          <Button key="back" onClick={() => window.history.back()}>返回</Button>,
        ]}
      />
    );
  }
  return (
    <>
      {props.error === '' ? null : <Alert style={{ marginBottom: 12 }} type="error" showIcon title={props.error} action={<Button onClick={props.onRetry}>重试</Button>} />}
      {props.children}
    </>
  );
}

type ProgressTableProps = {
  readonly rows: readonly ProgressRow[];
  readonly lines: ReadonlyMap<string, OrderLineRow>;
  readonly batchFacts: ProgressData['batchFacts'];
  readonly search: string;
  readonly emptyMessage: string | null;
  readonly origin: ProgressOrderOrigin;
  readonly expanded: readonly string[];
  readonly setExpanded: (keys: readonly Key[]) => void;
  readonly clearFilters: () => void;
  readonly notes: Readonly<Record<string, string>>;
  readonly now: Date;
  readonly page: number;
  readonly pageSize: number;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (size: number) => void;
};

function EmptyProgress({ message, clear }: { readonly message: string | null; readonly clear?: () => void }) {
  const canReadImports = useCan('imports.read');
  return <Empty description={message ?? '所选范围没有进行中的成品订单行。'}>
    {message !== null && clear !== undefined ? <Button onClick={clear}>清空筛选</Button> : null}
    {message === null && canReadImports ? <Button href="/imports">去导入</Button> : null}
  </Empty>;
}

function ProgressTable(props: ProgressTableProps) {
  const { lines, notes, now, search, origin } = props;
  const isPhone = useShellViewport().band === 'phone';
  const isNarrowPhone = isPhone && window.innerWidth <= 340;
  const lineOf = (lineId: string) => lines.get(lineId);
  const orderLink = useProgressOrderLink({ lines, search, origin });
  const lineLink = (lineId: string) => orderLink(lineId, { action: 'order' });
  const overdueLink = (row: ProgressRow) => {
    const due = lineOf(row.lineId)?.nextDue;
    return row.arrival.kind === 'overdue' && due != null ? orderLink(row.lineId, { action: 'overdue', focusBatch: due.batchId }) : undefined;
  };
  const note = (lineId: string) => <ProgressNote link={orderLink(lineId, { action: 'note' })} saved={notes[lineId]} />;
  const expand = (row: ProgressRow) => <ProgressExpandedRow row={row} line={lineOf(row.lineId)} facts={props.batchFacts.get(row.lineId)} search={search} origin={origin} note={isPhone ? note(row.lineId) : null} />;
  return (
    <Table
      rowKey="lineId"
      size="small"
      dataSource={[...props.rows]}
      locale={{ emptyText: <EmptyProgress message={props.emptyMessage} {...(origin === 'delivery' ? { clear: props.clearFilters } : {})} /> }}
      expandable={{ expandedRowRender: expand, ...(isPhone ? { columnWidth: 34 } : {}),
        ...(origin === 'delivery' ? { expandedRowKeys: props.expanded, onExpandedRowsChange: props.setExpanded } : {}),
      }}
      {...(isPhone ? {} : { sticky: { offsetHeader: topBar } })}
      tableLayout="fixed"
      columns={isPhone ? progressMobileColumns({ isNarrowPhone, lineOf, lineLink, overdueLink, now, showFullIdentity: origin === 'delivery' }) : progressColumns({ lines, lineLink, overdueLink, note, now })}
      pagination={tablePagination({
        page: Math.min(props.page, Math.max(1, Math.ceil(props.rows.length / props.pageSize))),
        pageSize: props.pageSize,
        total: props.rows.length,
        showTotal: false,
        onChange: props.setPage,
        onSizeChange: props.setPageSize,
      })}
    />
  );
}

function useProgressOrderLink({ lines, search, origin }: Pick<ProgressTableProps, 'lines' | 'search' | 'origin'>) {
  const deliveryLink = useDeliveryDetailLinks();
  return (lineId: string, { action, focusBatch }: { readonly action: 'order' | 'overdue' | 'note'; readonly focusBatch?: string }): ProgressOrderLinkProps => {
    const store = lines.get(lineId)?.storeProgress?.store;
    if (origin === 'delivery') {
      const focusKey = JSON.stringify(['delivery', action, lineId, focusBatch ?? null]);
      return deliveryLink({ id: lineId, search, store, focusKey, focusBatch });
    }
    return { to: scopedLineLink(lineId, { search, store, focusLine: lineId, ...(focusBatch === undefined ? {} : { focusBatch }) }) };
  };
}

function ProgressExpandedRow({ row, line, facts, search, origin, note }: {
  readonly row: ProgressRow;
  readonly line: OrderLineRow | undefined;
  readonly facts: StoreBatchFacts | undefined;
  readonly search: string;
  readonly origin: ProgressOrderOrigin;
  readonly note: ReactNode;
}) {
  return <>
    {note === null ? null : progressMobileDetails({ row, line, note })}
    <StoreBatchQuantities facts={facts} />
    <StoreOrderDetails line={line} search={search} origin={origin} />
  </>;
}
