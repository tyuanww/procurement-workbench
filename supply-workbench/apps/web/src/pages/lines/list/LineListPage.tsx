import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, Button, Checkbox, Collapse, Input, Result, Segmented, Select, Skeleton } from 'antd';
import type { OrderLineRow } from '@sw/contracts';
import { loadViews, presetViews, readDesk, writeDesk } from '../../../features/follow-up/index.js';
import { useShellViewport } from '../../../features/shell/index.js';
import { WorkbenchPage } from '../../../shared/ui/page.js';
import { LineAlerts, LineBulkBar, createListGate, type ListGate } from './actions.js';
import { loadDeskOwners } from './owners.js';
import { useDeskLoad } from './use-desk-load.js';
import { LineViewBar, readDensity, readHiddenColumns, type Density, type SavedView } from './view-bar.js';
import { LineSummaryStrip } from './line-summary.js';
import { useLineSummary } from './use-line-summary.js';
import { isSummarySettled, useDeskScrollRestore } from './desk-scroll.js';
import { readFollowUpPreview, writeFollowUpPreview } from './follow-up-preview-url.js';
import { ArrivalDesk } from './arrival-desk.js';
import { FollowUpPreviewDrawer } from './FollowUpPreviewDrawer.js';
import { LineTable } from './line-table.js';
import { PartyPreviewDrawer } from './PartyPreviewDrawer.js';
import { closePartyPreview, openPartyPreview, readPartyPreview } from './party-preview.js';

export { createListGate, hintBatches, loadDeskList } from './actions.js';
export type { ListGate } from './actions.js';
export { LineTable, type LineTableProps } from './line-table.js';

type SearchSetter = ReturnType<typeof useSearchParams>[1];
type Desk = ReturnType<typeof readDesk>;
export function LineListPage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<readonly OrderLineRow[]>([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<readonly { readonly id: string; readonly name: string }[]>([]);
  const [isOwnerVisible, setOwnerVisible] = useState(false);
  const [userId, setUserId] = useState('');
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [buyerId, setBuyerId] = useState('');
  const [skips, setSkips] = useState<readonly string[]>([]);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [now] = useState(() => new Date());
  const search = params.toString(); const desk = readDesk(search);
  const preview = readFollowUpPreview(search); const party = readPartyPreview(search); const { density, hiddenKeys } = displayPrefs(search);
  const views = viewChoices(userId); const listGate = useRef<ListGate>(createListGate());
  const load = useDeskLoad({ query: desk.requestQuery, gate: listGate.current, setRows, setTotal, reload });
  useEffect(() => { void loadDeskOwners({ setUsers, setUserId, setOwnerVisible }); }, []);
  const summary = useLineSummary(desk.requestQuery);
  return (
    <WorkbenchPage title="跟进台" {...(load.hasLoaded ? { secondary: `${total} 行` } : {})} action={<ArrivalDesk userId={userId} onMutated={() => setReload((value) => value + 1)} />}>
      <LineTop search={search} desk={desk} setParams={setParams} views={views} userId={userId} setMessage={setMessage} picked={picked} users={users} isOwnerVisible={isOwnerVisible} buyerId={buyerId} setBuyerId={setBuyerId} gate={listGate.current} setRows={setRows} setTotal={setTotal} setSkips={setSkips} density={density} hiddenKeys={hiddenKeys} />
      <LineExtras summary={summary} skips={skips} setSkips={setSkips} message={message} preview={preview} party={party} search={search} setParams={setParams} isListReady={load.hasLoaded} rowCount={rows.length} />
      <DeskBody
        load={load}
        rows={rows}
        total={total}
        desk={desk}
        searched={search}
        setParams={setParams}
        picked={picked}
        setPicked={setPicked}
        density={density}
        hiddenKeys={hiddenKeys}
        onRetry={() => setReload((value) => value + 1)}
        now={now}
      />
    </WorkbenchPage>
  );
}

function LineExtras(props: {
  readonly summary: ReturnType<typeof useLineSummary>;
  readonly skips: readonly string[];
  readonly setSkips: (value: readonly string[]) => void;
  readonly message: string;
  readonly preview: ReturnType<typeof readFollowUpPreview>;
  readonly party: ReturnType<typeof readPartyPreview>;
  readonly search: string;
  readonly setParams: SearchSetter;
  readonly isListReady: boolean;
  readonly rowCount: number;
}) {
  const isPhone = useShellViewport().band === 'phone';
  useDeskScrollRestore({ isReady: props.isListReady && isSummarySettled(props.summary), layoutKey: props.rowCount });
  return (
    <>
      {props.summary.summary === null ? null : isPhone
        ? <Collapse ghost size="small" items={[{
          key: 'summary',
          label: '筛选结果概览',
          children: <LineSummaryStrip summary={props.summary.summary} />,
        }]} />
        : <LineSummaryStrip summary={props.summary.summary} />}
      {props.summary.error === '' ? null : <Alert type="error" showIcon title="订单汇总没有读出来" description={props.summary.error} />}
      <LineAlerts skips={props.skips} setSkips={props.setSkips} message={props.message} />
      {previewDrawer({ preview: props.preview, search: props.search, setParams: props.setParams })}
      {partyDrawer({ party: props.party, search: props.search, setParams: props.setParams })}
    </>
  );
}

function displayPrefs(search: string): { readonly density: Density; readonly hiddenKeys: readonly string[] } {
  return { density: readDensity(search), hiddenKeys: readHiddenColumns(search) };
}

function viewChoices(userId: string): readonly SavedView[] {
  if (userId === '') return presetViews();
  return [...presetViews(), ...loadViews(window.localStorage, userId)];
}

function DeskBody(props: {
  readonly load: ReturnType<typeof useDeskLoad>;
  readonly rows: readonly OrderLineRow[];
  readonly total: number;
  readonly desk: Desk;
  readonly searched: string;
  readonly setParams: SearchSetter;
  readonly picked: readonly string[];
  readonly setPicked: (ids: readonly string[]) => void;
  readonly density: Density;
  readonly hiddenKeys: readonly string[];
  readonly onRetry: () => void;
  readonly now: Date;
}) {
  if (props.load.loadError !== '' && props.rows.length === 0) return <DeskError message={props.load.loadError} onRetry={props.onRetry} />;
  if (!props.load.hasLoaded) return <Skeleton active paragraph={{ rows: 10 }} />;
  return (
    <LineTable
      columns={props.desk.columns}
      rows={props.rows}
      picked={props.picked}
      setPicked={props.setPicked}
      page={props.desk.page}
      pageSize={props.desk.pageSize}
      total={props.total}
      search={props.searched}
      setParams={props.setParams}
      isUpdating={props.load.isUpdating}
      density={props.density}
      hiddenKeys={props.hiddenKeys}
      now={props.now}
      onOpenParty={(opened) => keepPlace(props.setParams, openPartyPreview({ search: props.searched, opened }))}
    />
  );
}

function DeskError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <Result
      status="error"
      title="订单行没有读出来"
      subTitle={message}
      extra={[
        <Button key="retry" type="primary" onClick={onRetry}>重试</Button>,
        <Button key="back" onClick={() => window.history.back()}>返回</Button>,
      ]}
    />
  );
}

function LineTop(props: {
  readonly search: string;
  readonly desk: Desk;
  readonly setParams: SearchSetter;
  readonly views: readonly SavedView[];
  readonly userId: string;
  readonly setMessage: (message: string) => void;
  readonly picked: readonly string[];
  readonly users: readonly { readonly id: string; readonly name: string }[];
  readonly isOwnerVisible: boolean;
  readonly buyerId: string;
  readonly setBuyerId: (id: string) => void;
  readonly gate: ListGate;
  readonly setRows: (rows: readonly OrderLineRow[]) => void;
  readonly setTotal: (total: number) => void;
  readonly setSkips: (lines: readonly string[]) => void;
  readonly density: Density;
  readonly hiddenKeys: readonly string[];
}) {
  const isPhone = useShellViewport().band === 'phone';
  const hasSelection = props.picked.length > 0;
  const views = <LineViewBar search={props.search} query={props.desk.requestQuery} views={props.views} userId={props.userId} columns={props.desk.columns} density={props.density} hiddenKeys={props.hiddenKeys} setMessage={props.setMessage} setParams={props.setParams} />;
  const bulk = <LineBulkBar users={props.users} isOwnerVisible={props.isOwnerVisible} buyerId={props.buyerId} setBuyerId={props.setBuyerId} picked={props.picked} query={props.desk.requestQuery} gate={props.gate} setRows={props.setRows} setTotal={props.setTotal} setMessage={props.setMessage} setSkips={props.setSkips} />;
  return <>
    <LineFilters search={props.search} desk={props.desk} setParams={props.setParams} />
    {isPhone ? <div style={{ display: 'grid' }}>
      <div inert={hasSelection} style={actionRowStyle(hasSelection)}>{views}</div>
      <div inert={!hasSelection} style={actionRowStyle(!hasSelection)}>{bulk}</div>
    </div> : hasSelection ? bulk : views}
  </>;
}

function actionRowStyle(isHidden: boolean): CSSProperties {
  return { gridArea: '1 / 1', minWidth: 0, opacity: isHidden ? 0 : 1, visibility: isHidden ? 'hidden' : 'visible' };
}

function LineFilters(props: { readonly search: string; readonly desk: Desk; readonly setParams: SearchSetter }) {
  return (
    <div style={filterRowStyle()}>
      <Segmented
        aria-label="订单线别"
        value={props.desk.lane}
        options={[{ label: '成品线', value: 'finished' }, { label: '物料线', value: 'material' }, { label: '全部线', value: 'all' }]}
        onChange={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'lane', value } }))}
      />
      <div style={filterBoxStyle()}>
        <Input.Search
          key={props.desk.q}
          aria-label="搜索单号、品名或编码"
          placeholder="搜索单号 / 品名 / 编码"
          defaultValue={props.desk.q}
          allowClear
          onSearch={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'text', value } }))}
          style={{ width: '100%' }}
        />
      </div>
      <div style={filterBoxStyle()}>
        <StageFilter search={props.search} desk={props.desk} setParams={props.setParams} />
      </div>
      <OverdueFilter search={props.search} isOverdue={props.desk.isOverdue} setParams={props.setParams} />
    </div>
  );
}

function filterRowStyle(): CSSProperties {
  return { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 };
}

function filterBoxStyle(): CSSProperties {
  return { flex: '1 1 200px', maxWidth: 280, minWidth: 0 };
}

function StageFilter(props: { readonly search: string; readonly desk: Desk; readonly setParams: SearchSetter }) {
  const inputId = useId();
  const selected = props.desk.stageChoices.find((choice) => choice.value === props.desk.stage.value)?.label ?? props.desk.stage.value;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <label htmlFor={inputId} style={{ flexShrink: 0 }}>阶段</label>
    <Select<string>
      id={inputId}
      aria-describedby={`${inputId}-value`}
      value={props.desk.stage.value}
      options={props.desk.stageChoices.map((choice) => ({ value: choice.value, label: choice.label }))}
      onChange={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'stage', value } }))}
      style={{ flex: 1, minWidth: 0 }}
    />
    <span id={`${inputId}-value`} hidden>{selected}</span>
  </div>;
}

function OverdueFilter(props: { readonly search: string; readonly isOverdue: boolean; readonly setParams: SearchSetter }) {
  return (
    <Checkbox
      checked={props.isOverdue}
      onChange={(event) => props.setParams(writeDesk({ search: props.search, change: { kind: 'overdue', value: event.target.checked } }))}
    >
      只看逾期
    </Checkbox>
  );
}

function previewDrawer(input: { readonly preview: ReturnType<typeof readFollowUpPreview>; readonly search: string; readonly setParams: SearchSetter }) {
  if (input.preview === null) return null;
  return <FollowUpPreviewDrawer key={input.preview.lineId} lineId={input.preview.lineId} onClose={() => input.setParams(writeFollowUpPreview({ search: input.search, session: null }))} />;
}

function partyDrawer(input: { readonly party: ReturnType<typeof readPartyPreview>; readonly search: string; readonly setParams: SearchSetter }) {
  if (input.party === null) return null;
  const opened = input.party.opened;
  return <PartyPreviewDrawer key={`${opened.role}:${opened.partyId}`} opened={opened} onClose={() => keepPlace(input.setParams, closePartyPreview(input.search))} />;
}

function keepPlace(setParams: SearchSetter, next: URLSearchParams): void {
  setParams(next, { preventScrollReset: true });
}
