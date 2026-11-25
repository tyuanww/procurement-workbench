import { Alert, Button, Empty, Result, Skeleton, Table } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { matchingOa, scopedLineLink, StoreGapSummary, StoreOrderDetails } from './store-order.js';
import { progressPagination, resetProgressPagination, withProgressPagination } from './store-query.js';

type ProgressScope = { readonly store: ProcurementStore; readonly isMine: boolean };
const emptyProgress: ProgressData = { rows: [], lines: new Map(), batchFacts: new Map(), arrivalMemos: [], actionNotice: '' };

export function ProgressCurrent({ filters, ...scope }: ProgressScope & { readonly filters: ReactNode }) {
  const { data, error, isLoaded, notes, now, retry } = useCurrentData(scope);
  const { oa, stay, drill, setOa, setStay, setDrill, tableRef, ...table } = useCurrentFilter();
  const oaRows = data.rows.filter((row) => matchingOa(data.lines.get(row.lineId), oa));
  const scopedRows = stay === null ? oaRows : oaRows.filter((row) => row.stay === stay);
  const rows = scopedRows.filter((row) => matchesProgressDrill(row, drill));
  const insight = progressInsights(scopedRows);
  const emptyMessage = currentEmptyMessage({ drill, oa, stay });
  const showMatchCount = isLoaded && drill.kind !== 'all' && (error === '' || data.rows.length > 0);
  useProgressRowFocus({ tableRef, search: table.search, isLoaded });
  return (
    <>
      <ProgressFilters filters={filters} lines={data.rows.map((row) => data.lines.get(row.lineId))}
        oa={oa} stay={stay} drill={drill} overdue={isLoaded ? insight.overdue : null}
        onOa={setOa} onStay={setStay} onDrill={setDrill} />
      {insight.total === 0 ? null : <ProgressBreakdown insight={insight} drill={drill} onDrill={setDrill} />}
      <div ref={tableRef} role="region" aria-label="当前进度表" tabIndex={-1} style={{ scrollMarginTop: topBar + space[2] }}>
        <SectionGroup title="订单清单" meta={<span role="status">{showMatchCount ? `匹配 ${formatQuantity(rows.length)} 行` : ''}</span>}>
          <ProgressActionNotice message={data.actionNotice} hasRows={scopedRows.length > 0} isLoaded={isLoaded} onRetry={retry} />
          <ProgressBody rows={data.rows} error={error} isLoaded={isLoaded} onRetry={retry}>
            <ProgressTable notes={notes} now={now} {...table} rows={rows} lines={data.lines} batchFacts={data.batchFacts} emptyMessage={emptyMessage} />
          </ProgressBody>
        </SectionGroup>
      </div>
      {isLoaded ? <StoreGapSummary lines={oaRows.map((row) => data.lines.get(row.lineId))} /> : null}
      {isLoaded ? <ArrivalMemos memos={memosForOa(data, oa)} /> : null}
    </>
  );
}

function useProgressRowFocus({ tableRef, search, isLoaded }: {
  readonly tableRef: { readonly current: HTMLDivElement | null };
  readonly search: string;
  readonly isLoaded: boolean;
}) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(search).get('focusLine');
    if (!isLoaded || id === null || last.current === search) return;
    const row = [...(tableRef.current?.querySelectorAll('tr[data-row-key]') ?? [])].find((element) => element.getAttribute('data-row-key') === id);
    row?.querySelector('a')?.focus();
    if (row !== undefined) last.current = search;
  }, [isLoaded, search, tableRef]);
}

function currentEmptyMessage({ drill, oa, stay }: { readonly drill: ProgressDrill; readonly oa: string | null; readonly stay: ProgressStay | null }) {
  if (drill.kind !== 'all') return '当前指标没有匹配的订单行。';
  if (stay !== null) return '所选停留天数没有匹配的订单行。';
  return oa === null ? null : '这个 OA 没有进行中的成品订单行。';
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
  return { data: isLoaded ? data : emptyProgress, error, isLoaded, notes, now, retry: () => setReload((value) => value + 1) };
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
  readonly notes: Readonly<Record<string, string>>;
  readonly now: Date;
  readonly page: number;
  readonly pageSize: number;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (size: number) => void;
};

function EmptyProgress({ message }: { readonly message: string | null }) {
  const canReadImports = useCan('imports.read');
  return <Empty description={message ?? '所选范围没有进行中的成品订单行。'}>{message === null && canReadImports ? <Button href="/imports">去导入</Button> : null}</Empty>;
}

function ProgressTable(props: ProgressTableProps) {
  const { lines, notes, now, search } = props;
  const isPhone = useShellViewport().band === 'phone';
  const isNarrowPhone = isPhone && window.innerWidth <= 340;
  const lineOf = (lineId: string) => lines.get(lineId);
  const lineHref = (lineId: string, focusBatch?: string) => scopedLineLink(lineId, {
    search, store: lineOf(lineId)?.storeProgress?.store, focusLine: lineId, ...(focusBatch === undefined ? {} : { focusBatch }),
  });
  const overdueHref = (row: ProgressRow) => {
    const due = lineOf(row.lineId)?.nextDue;
    return row.arrival.kind === 'overdue' && due != null ? lineHref(row.lineId, due.batchId) : undefined;
  };
  const note = (lineId: string) => <ProgressNote href={lineHref(lineId)} saved={notes[lineId]} />;
  const expand = (row: ProgressRow) => <ProgressExpandedRow row={row} line={lineOf(row.lineId)} facts={props.batchFacts.get(row.lineId)} search={search} note={isPhone ? note(row.lineId) : null} />;
  return (
    <Table
      rowKey="lineId"
      size="small"
      dataSource={[...props.rows]}
      locale={{ emptyText: <EmptyProgress message={props.emptyMessage} /> }}
      expandable={{ expandedRowRender: expand, ...(isPhone ? { columnWidth: 34 } : {}) }}
      {...(isPhone ? {} : { sticky: { offsetHeader: topBar } })}
      tableLayout="fixed"
      columns={isPhone ? progressMobileColumns({ isNarrowPhone, lineOf, lineHref, overdueHref, now }) : progressColumns({ lines, lineHref, overdueHref, note, now })}
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

function ProgressExpandedRow({ row, line, facts, search, note }: {
  readonly row: ProgressRow;
  readonly line: OrderLineRow | undefined;
  readonly facts: StoreBatchFacts | undefined;
  readonly search: string;
  readonly note: ReactNode;
}) {
  return <>
    {note === null ? null : progressMobileDetails({ row, line, note })}
    <StoreBatchQuantities facts={facts} />
    <StoreOrderDetails line={line} search={search} />
  </>;
}
