import { Alert, Button, Empty, Result, Skeleton, Table, type TableColumnsType } from 'antd';
import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router';
import { type OrderLineRow, type ProcurementStore } from '@sw/contracts';
import { arrivalPaint, progressInsights, rememberLocalNote, type LocalNote, type ProgressArrival, type ProgressRow, type ProgressStay } from '../../features/progress/index.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { tablePagination } from '../../shared/ui/pagination.js';
import { MissingValue, StatusTag } from '../../shared/ui/widgets.js';
import { useShellViewport } from '../../features/shell/index.js';
import { ArrivalMemos } from '../../features/today/index.js';
import { fontSize, space, statusColor, text } from '../../theme/tokens.js';
import { ProgressNote } from './progress-note.js';
import { progressArrivalDate, progressMobileColumns, progressMobileDetails, type ProgressMobileInput } from './progress-mobile.js';
import { loadProgress, type ProgressData } from './progress-load.js';
export { noteBatches, pagesFor } from './progress-load.js';
import { ProgressOverview } from './progress-overview.js';
import { matchingOa, ProgressOaFilter, progressOrderRef, scopedLineLink, StoreGapSummary, StoreOrderDetails } from './store-order.js';

export function ProgressCurrent({ store, isMine }: { readonly store: ProcurementStore; readonly isMine: boolean }) {
  const [params, setParams] = useSearchParams();
  const oa = params.get('oa');
  const [data, setData] = useState<ProgressData>({ rows: [], lines: new Map(), arrivalMemos: [] });
  const rows = data.rows.filter((row) => matchingOa(data.lines.get(row.lineId), oa));
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
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
  return (
    <>
      {isLoaded && data.rows.length > 0 ? (
        <ProgressOaFilter lines={data.rows.map((row) => data.lines.get(row.lineId))} value={oa} onChange={(value) => {
          setPage(1);
          setParams(oaParams(params, value));
        }} />
      ) : null}
      {isLoaded ? <ProgressSummary rows={rows} lines={data.lines} /> : null}
      <SectionGroup title="当前进度" {...(isLoaded ? { meta: `${rows.length} 条` } : {})}>
        <ProgressBody rows={data.rows} error={error} isLoaded={isLoaded} onRetry={() => setReload((value) => value + 1)}>
          <ProgressTable rows={rows} lines={data.lines} search={params.toString()} filtered={oa !== null} notes={notes} drafts={drafts} setDrafts={setDrafts} localNotes={localNotes} generation={generation} setNotes={setNotes} setError={setError} now={now} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
        </ProgressBody>
      </SectionGroup>
      {isLoaded ? <ArrivalMemos memos={memosForOa(data, oa)} /> : null}
    </>
  );
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

function ProgressSummary({ rows, lines }: { readonly rows: readonly ProgressRow[]; readonly lines: ProgressData['lines'] }) {
  return <>
    <StoreGapSummary lines={rows.map((row) => lines.get(row.lineId))} />
    {rows.length === 0 ? null : <ProgressOverview insight={progressInsights(rows)} />}
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
      {props.error === '' ? null : <Alert style={{ marginBottom: 12 }} type="error" showIcon title={props.error} />}
      {props.children}
    </>
  );
}

type ProgressTableProps = {
  readonly rows: readonly ProgressRow[];
  readonly lines: ReadonlyMap<string, OrderLineRow>;
  readonly search: string;
  readonly filtered: boolean;
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
      locale={{ emptyText: props.filtered ? <Empty description="这个 OA 没有进行中的成品订单行。" /> : <Empty description="所选范围没有进行中的成品订单行。"><Button href="/imports">去导入</Button></Empty> }}
      expandable={{ expandedRowRender: expand }}
      {...(isPhone ? {} : { scroll: { x: 'max-content' as const } })}
      columns={isPhone ? progressMobileColumns(mobileInput) : progressColumns({ lines: props.lines, search: props.search, notes, drafts, setDrafts, localNotes, generation, setNotes, setError, now: props.now })}
      pagination={tablePagination({
        page: props.page,
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
    { title: '下一步', dataIndex: 'nextLabel' },
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
