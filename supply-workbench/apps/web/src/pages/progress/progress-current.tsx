import { Alert, Button, Empty, Result, Skeleton, Table, type TableColumnsType } from 'antd';
import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router';
import { type OrderLineRow, type ProcurementStore } from '@sw/contracts';
import { arrivalPaint, matchesProgressDrill, progressDrillKey, progressDrillLabel, progressInsights, readProgressDrill, rememberLocalNote, withProgressDrill, type LocalNote, type ProgressArrival, type ProgressDrill, type ProgressRow, type ProgressStay } from '../../features/progress/index.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { tablePagination } from '../../shared/ui/pagination.js';
import { MissingValue, StatusTag } from '../../shared/ui/widgets.js';
import { useShellViewport } from '../../features/shell/index.js';
import { ArrivalMemos } from '../../features/today/index.js';
import { fontSize, space, statusColor, text, topBar } from '../../theme/tokens.js';
import { ProgressNote } from './progress-note.js';
import { progressArrivalDate, progressMobileColumns, progressMobileDetails, type ProgressMobileInput } from './progress-mobile.js';
import { loadProgress, type ProgressData } from './progress-load.js';
export { noteBatches, pagesFor } from './progress-load.js';
import { ProgressOverview } from './progress-overview.js';
import { ProgressNextAction } from './progress-material-risk.js';
import { matchingOa, ProgressOaFilter, progressOrderRef, scopedLineLink, StoreGapSummary, StoreOrderDetails } from './store-order.js';

type ProgressScope = { readonly store: ProcurementStore; readonly isMine: boolean };

export function ProgressCurrent(scope: ProgressScope) {
  const { data, error, isLoaded, retry, ...notes } = useCurrentData(scope);
  const { oa, drill, setOa, setDrill, tableRef, ...table } = useCurrentFilter();
  const scopedRows = data.rows.filter((row) => matchingOa(data.lines.get(row.lineId), oa));
  const rows = scopedRows.filter((row) => matchesProgressDrill(row, drill));
  const emptyMessage = drill.kind !== 'all' ? '当前指标没有匹配的订单行。' : oa === null ? null : '这个 OA 没有进行中的成品订单行。';
  return (
    <>
      {isLoaded && data.rows.length > 0 ? <ProgressOaFilter lines={data.rows.map((row) => data.lines.get(row.lineId))} value={oa} onChange={setOa} /> : null}
      {isLoaded ? <ProgressSummary rows={scopedRows} lines={data.lines} drill={drill} onDrill={setDrill} /> : null}
      <div ref={tableRef} role="region" aria-label="当前进度表" tabIndex={-1} style={{ scrollMarginTop: topBar + space[2] }}>
        <SectionGroup title="当前进度" {...(isLoaded ? { meta: `${rows.length} 条` } : {})}>
          {drill.kind === 'all' ? null : <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
            <span>当前筛选 {progressDrillLabel(drill)}</span>
            <Button onClick={() => setDrill({ kind: 'all' })}>清除下钻</Button>
          </div>}
          <ProgressActionNotice message={data.actionNotice} hasRows={scopedRows.length > 0} isLoaded={isLoaded} onRetry={retry} />
          <ProgressBody rows={data.rows} error={error} isLoaded={isLoaded} onRetry={retry}>
            <ProgressTable {...notes} {...table} rows={rows} lines={data.lines} emptyMessage={emptyMessage} />
          </ProgressBody>
        </SectionGroup>
      </div>
      {isLoaded ? <ArrivalMemos memos={memosForOa(data, oa)} /> : null}
    </>
  );
}

function ProgressActionNotice(props: { readonly message: string; readonly hasRows: boolean; readonly isLoaded: boolean; readonly onRetry: () => void }) {
  if (!props.isLoaded || !props.hasRows || props.message === '') return null;
  return <Alert type="warning" showIcon title={props.message} action={<Button onClick={props.onRetry}>重试</Button>} />;
}

function useCurrentFilter() {
  const [params, setParams] = useSearchParams();
  const oa = params.get('oa');
  const drill = readProgressDrill(params.get('drill'));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const tableRef = useRef<HTMLDivElement>(null);
  return {
    oa, drill, tableRef, page, pageSize, setPage, setPageSize, search: params.toString(),
    setOa: (value: string | null) => { setPage(1); setParams(oaParams(params, value)); },
    setDrill: (value: ProgressDrill) => {
      const next: ProgressDrill = progressDrillKey(value) === progressDrillKey(drill) ? { kind: 'all' } : value;
      setPage(1);
      setParams(withProgressDrill(params, next), { preventScrollReset: true });
      tableRef.current?.focus();
    },
  };
}

function useCurrentData({ store, isMine }: ProgressScope) {
  const [data, setData] = useState<ProgressData>({ rows: [], lines: new Map(), arrivalMemos: [], actionNotice: '' });
  const [error, setError] = useState('');
  const [now] = useState(() => new Date());
  const [isLoaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [notes, setNotes] = useState<Readonly<Record<string, string>>>({});
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const generation = useRef(0);
  const localNotes = useRef<readonly LocalNote[]>([]);
  useEffect(() => {
    const current = ++generation.current;
    setLoaded(false);
    void loadProgress({ store, isMine, current, latest: () => generation.current, local: () => localNotes.current, setData, setNotes, setError })
      .finally(() => { if (current === generation.current) setLoaded(true); });
    return () => { generation.current++; };
  }, [reload, store, isMine]);
  return { data, error, isLoaded, notes, drafts, setDrafts, localNotes, generation, setNotes, setError, now, retry: () => setReload((value) => value + 1) };
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

function ProgressSummary({ rows, lines, drill, onDrill }: { readonly rows: readonly ProgressRow[]; readonly lines: ProgressData['lines']; readonly drill: ProgressDrill; readonly onDrill: (value: ProgressDrill) => void }) {
  return <>
    <StoreGapSummary lines={rows.map((row) => lines.get(row.lineId))} />
    {rows.length === 0 ? null : <ProgressOverview insight={progressInsights(rows)} drill={drill} onDrill={onDrill} />}
  </>;
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
  readonly search: string;
  readonly emptyMessage: string | null;
  readonly notes: Readonly<Record<string, string>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly setDrafts: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly localNotes: MutableRefObject<readonly LocalNote[]>;
  readonly generation: MutableRefObject<number>;
  readonly setNotes: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly setError: (message: string) => void;
  readonly now: Date;
  readonly page: number;
  readonly pageSize: number;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (size: number) => void;
};

function ProgressTable(props: ProgressTableProps) {
  const { notes, drafts, setDrafts, localNotes, generation, setNotes, setError } = props;
  const isPhone = useShellViewport().band === 'phone';
  const isNarrowPhone = isPhone && window.innerWidth <= 340;
  const mobileInput = progressMobileInput({ notes, drafts, setDrafts, localNotes, generation, setNotes, setError, now: props.now, isNarrowPhone });
  const expand = (row: ProgressRow) => (
    <>
      <StoreOrderDetails line={props.lines.get(row.lineId)} search={props.search} />
      {isPhone ? progressMobileDetails(row, mobileInput) : null}
    </>
  );
  return (
    <Table
      rowKey="lineId"
      size="small"
      dataSource={[...props.rows]}
      locale={{ emptyText: props.emptyMessage === null ? <Empty description="所选范围没有进行中的成品订单行。"><Button href="/imports">去导入</Button></Empty> : <Empty description={props.emptyMessage} /> }}
      expandable={{ expandedRowRender: expand }}
      {...(isPhone ? {} : { scroll: { x: 'max-content' as const } })}
      columns={isPhone ? progressMobileColumns(mobileInput) : progressColumns({ lines: props.lines, search: props.search, notes, drafts, setDrafts, localNotes, generation, setNotes, setError, now: props.now })}
      pagination={tablePagination({
        page: Math.min(props.page, Math.max(1, Math.ceil(props.rows.length / props.pageSize))),
        pageSize: props.pageSize,
        total: props.rows.length,
        onChange: props.setPage,
        onSizeChange: (size) => { props.setPageSize(size); props.setPage(1); },
      })}
    />
  );
}

function progressMobileInput(input: {
  readonly notes: Readonly<Record<string, string>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly setDrafts: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly localNotes: MutableRefObject<readonly LocalNote[]>;
  readonly generation: MutableRefObject<number>;
  readonly setNotes: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly setError: (message: string) => void;
  readonly now: Date;
  readonly isNarrowPhone: boolean;
}): ProgressMobileInput {
  return {
    notes: input.notes,
    drafts: input.drafts,
    setDrafts: input.setDrafts,
    onSaved: (lineId, text) => {
      input.localNotes.current = rememberLocalNote(input.localNotes.current, { lineId, generation: input.generation.current, text });
      input.setNotes((current) => ({ ...current, [lineId]: text }));
    },
    setError: input.setError,
    now: input.now,
    isNarrowPhone: input.isNarrowPhone,
  };
}

function progressColumns(input: {
  readonly lines: ReadonlyMap<string, OrderLineRow>;
  readonly search: string;
  readonly notes: Readonly<Record<string, string>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly setDrafts: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly localNotes: MutableRefObject<readonly LocalNote[]>;
  readonly generation: MutableRefObject<number>;
  readonly setNotes: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly setError: (message: string) => void;
  readonly now: Date;
}): TableColumnsType<ProgressRow> {
  const { notes, drafts, setDrafts, localNotes, generation, setNotes, setError } = input;
  return [
    { title: 'OA 需求', render: (_value: unknown, row: ProgressRow) => progressOrderRef(input.lines.get(row.lineId)) },
    { title: '单号', dataIndex: 'po' },
    { title: '品名', dataIndex: 'title', render: (title: string, row: ProgressRow) => <a href={scopedLineLink(row.lineId, { search: input.search, store: input.lines.get(row.lineId)?.storeProgress?.store })}>{title}</a> },
    { title: '供应商', dataIndex: 'supplierLabel' },
    { title: '阶段', dataIndex: 'stageLabel' },
    { title: '停留天数', align: 'right', render: (_value: unknown, row: ProgressRow) => <StayDays row={row} /> },
    { title: '确认到货日', render: (_value: unknown, row: ProgressRow) => progressArrivalDate({ arrival: row.arrival, now: input.now }) },
    { title: '状态', render: (_value: unknown, row: ProgressRow) => <ArrivalTag arrival={row.arrival} /> },
    { title: '下一步', render: (_value: unknown, row: ProgressRow) => <ProgressNextAction row={row} /> },
    noteColumn({ notes, drafts, setDrafts, localNotes, generation, setNotes, setError }),
  ];
}

function noteColumn(input: {
  readonly notes: Readonly<Record<string, string>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly setDrafts: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly localNotes: MutableRefObject<readonly LocalNote[]>;
  readonly generation: MutableRefObject<number>;
  readonly setNotes: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  readonly setError: (message: string) => void;
}) {
  return {
    title: '进度说明',
    render: (_value: unknown, row: ProgressRow) => (
      <ProgressNote
        lineId={row.lineId}
        saved={input.notes[row.lineId] ?? ''}
        draft={input.drafts[row.lineId] ?? ''}
        onDraft={(text) => input.setDrafts({ ...input.drafts, [row.lineId]: text })}
        onSaved={(text) => {
          input.localNotes.current = rememberLocalNote(input.localNotes.current, { lineId: row.lineId, generation: input.generation.current, text });
          input.setNotes((current) => ({ ...current, [row.lineId]: text }));
        }}
        onError={input.setError}
      />
    ),
  };
}

const STAY_PAINT: Record<ProgressStay, { readonly fontSize: number; readonly fontWeight: number; readonly color: string }> = {
  '0-3': { fontSize: fontSize.table, fontWeight: 400, color: text.tertiary },
  '4-7': { fontSize: fontSize.body, fontWeight: 400, color: text.secondary },
  '8-14': { fontSize: fontSize.section, fontWeight: 600, color: text.primary },
  '15+': { fontSize: fontSize.page, fontWeight: 600, color: text.primary },
};

function StayDays({ row }: { readonly row: ProgressRow }) {
  const paint = STAY_PAINT[row.stay];
  const shared: CSSProperties = {
    fontSize: paint.fontSize,
    fontWeight: paint.fontWeight,
    fontVariantNumeric: 'tabular-nums',
  };
  switch (row.arrival.kind) {
    case 'overdue':
      return (
        <span style={{ ...shared, color: statusColor.danger.text, background: statusColor.danger.bg, paddingInline: space[0] }}>
          {row.dayText}
        </span>
      );
    case 'missing':
    case 'dated':
      return <span style={{ ...shared, color: paint.color }}>{row.dayText}</span>;
    default: {
      const unchecked: never = row.arrival;
      return unchecked;
    }
  }
}

export function ArrivalTag({ arrival }: { readonly arrival: ProgressArrival }) {
  const paint = arrivalPaint(arrival.kind);
  switch (paint.kind) {
    case 'status':
      return <StatusTag status={paint.status} />;
    case 'missing':
      return <MissingValue reason={paint.reason} />;
    default: {
      const unchecked: never = paint;
      return unchecked;
    }
  }
}
