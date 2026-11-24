import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Card, Checkbox, Flex, Input, Result, Select, Skeleton } from 'antd';
import { loadViews, presetViews, readDesk, writeDesk } from '../../../features/follow-up/index.js';
import { useShellViewport } from '../../../features/shell/index.js';
import { WorkbenchPage } from '../../../shared/ui/page.js';
import { ViewSwitch } from '../../../shared/ui/view-switch.js';
import { LineAlerts, LineBulkBar } from './actions.js';
import { loadDeskOwners } from './owners.js';
import { useDeskLoad } from './use-desk-load.js';
import { LineViewBar, readDensity, readHiddenColumns, type Density, type SavedView } from './view-bar.js';
import { LineResultSummary } from './line-summary.js';
import { useDeskScrollRestore } from './desk-scroll.js';
import { readFollowUpPreview, writeFollowUpPreview } from './follow-up-preview-url.js';
import { ArrivalDesk } from './arrival-desk.js';
import { FollowUpPreviewDrawer } from './FollowUpPreviewDrawer.js';
import { LineTable } from './line-table.js';
import { PartyPreviewDrawer } from './PartyPreviewDrawer.js';
import { closePartyPreview, openPartyPreview, readPartyPreview } from './party-preview.js';

export { LineTable, type LineTableProps } from './line-table.js';

type SearchSetter = ReturnType<typeof useSearchParams>[1];
type Desk = ReturnType<typeof readDesk>;
export function LineListPage() {
  const [params, setParams] = useSearchParams();
  const [users, setUsers] = useState<readonly { readonly id: string; readonly name: string }[]>([]);
  const [isOwnerVisible, setOwnerVisible] = useState(false);
  const [userId, setUserId] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [skips, setSkips] = useState<readonly string[]>([]);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [now] = useState(() => new Date());
  const search = params.toString(); const desk = readDesk(search);
  const preview = readFollowUpPreview(search); const party = readPartyPreview(search); const { density, hiddenKeys } = displayPrefs(search);
  const request = { query: desk.requestQuery, reload };
  const load = useDeskLoad(request);
  const { picked, setPicked } = useDeskSelection(request);
  const refresh = () => setReload((value) => value + 1);
  const rememberPreviewTrigger = usePreviewTrigger(preview !== null);
  useEffect(() => { void loadDeskOwners({ setUsers, setUserId, setOwnerVisible }); }, []);
  return (
    <WorkbenchPage title="跟进中心" action={<ArrivalDesk userId={userId} onMutated={refresh} />}>
      <LineTop search={search} desk={desk} setParams={setParams} views={viewChoices(userId)} userId={userId} setMessage={setMessage} picked={load.kind === 'ready' ? picked : []} users={users} isOwnerVisible={isOwnerVisible} buyerId={buyerId} setBuyerId={setBuyerId} onReload={refresh} setSkips={setSkips} density={density} hiddenKeys={hiddenKeys} />
      <LineAlerts skips={skips} setSkips={setSkips} message={message} />
      <LineResultSummary query={request.query} reload={reload} total={load.kind === 'ready' ? load.total : null} />
      <DeskBody
        load={load}
        desk={desk}
        searched={search}
        setParams={setParams}
        picked={picked}
        setPicked={setPicked}
        density={density}
        hiddenKeys={hiddenKeys}
        onPreviewTrigger={rememberPreviewTrigger}
        onRetry={refresh}
        now={now}
      />
      <LinePreviews preview={preview} party={party} search={search} setParams={setParams} />
    </WorkbenchPage>
  );
}

function usePreviewTrigger(isOpen: boolean) {
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = trigger.current;
    if (isOpen || element === null) return;
    trigger.current = null;
    const frame = window.requestAnimationFrame(() => element.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);
  return (element: HTMLElement) => { trigger.current = element; };
}

function useDeskSelection(request: Parameters<typeof useDeskLoad>[0]) {
  const [selection, setSelection] = useState<typeof request & { readonly picked: readonly string[] }>({ ...request, picked: [] });
  const isCurrent = selection.query === request.query && selection.reload === request.reload;
  if (!isCurrent) setSelection({ ...request, picked: [] });
  return {
    picked: isCurrent ? selection.picked : [],
    setPicked: (picked: readonly string[]) => setSelection({ ...request, picked }),
  };
}

function LinePreviews(props: {
  readonly preview: ReturnType<typeof readFollowUpPreview>;
  readonly party: ReturnType<typeof readPartyPreview>;
  readonly search: string;
  readonly setParams: SearchSetter;
}) {
  const [lastPreview, setLastPreview] = useState(props.preview);
  if (props.preview !== null && props.preview.lineId !== lastPreview?.lineId) setLastPreview(props.preview);
  const shownPreview = props.preview ?? lastPreview;
  return (
    <>
      {shownPreview === null ? null : <FollowUpPreviewDrawer
        key={shownPreview.lineId}
        lineId={shownPreview.lineId}
        search={shownPreview.preservedSearch}
        isOpen={props.preview !== null}
        onClose={() => keepPlace(props.setParams, writeFollowUpPreview({ search: props.search, session: null }))}
      />}
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
  readonly desk: Desk;
  readonly searched: string;
  readonly setParams: SearchSetter;
  readonly picked: readonly string[];
  readonly setPicked: (ids: readonly string[]) => void;
  readonly density: Density;
  readonly hiddenKeys: readonly string[];
  readonly onRetry: () => void;
  readonly onPreviewTrigger: (element: HTMLElement) => void;
  readonly now: Date;
}) {
  useDeskScrollRestore({ isReady: props.load.kind === 'ready', layoutKey: props.load.kind === 'ready' ? props.load.rows.length : 0 });
  if (props.load.kind === 'failed') return <DeskError message={props.load.message} onRetry={props.onRetry} />;
  if (props.load.kind === 'pending') return <>
    <p role="status">正在读取订单行…</p>
    <Skeleton active paragraph={{ rows: 10 }} />
  </>;
  return (
    <LineTable
      columns={props.desk.columns}
      rows={props.load.rows}
      picked={props.picked}
      setPicked={props.setPicked}
      page={props.desk.page}
      pageSize={props.desk.pageSize}
      total={props.load.total}
      search={props.searched}
      setParams={props.setParams}
      density={props.density}
      hiddenKeys={props.hiddenKeys}
      now={props.now}
      onPreviewTrigger={props.onPreviewTrigger}
      onOpenParty={(opened) => keepPlace(props.setParams, openPartyPreview({ search: props.searched, opened }))}
    />
  );
}

function DeskError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <Result
      status="error"
      title="订单行没有读出来"
      subTitle={<span role="alert">{message}</span>}
      extra={[
        <Button key="retry" autoInsertSpace={false} type="primary" onClick={onRetry}>重试</Button>,
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
  readonly onReload: () => void;
  readonly setSkips: (lines: readonly string[]) => void;
  readonly density: Density;
  readonly hiddenKeys: readonly string[];
}) {
  const isPhone = useShellViewport().band === 'phone';
  const hasSelection = props.picked.length > 0;
  const views = <LineViewBar search={props.search} query={props.desk.requestQuery} views={props.views} userId={props.userId} columns={props.desk.columns} density={props.density} hiddenKeys={props.hiddenKeys} setMessage={props.setMessage} setParams={props.setParams} />;
  const bulk = hasSelection ? <LineBulkBar users={props.users} isOwnerVisible={props.isOwnerVisible} buyerId={props.buyerId} setBuyerId={props.setBuyerId} picked={props.picked} onReload={props.onReload} setMessage={props.setMessage} setSkips={props.setSkips} /> : null;
  return <>
    <LineFilters search={props.search} desk={props.desk} setParams={props.setParams} />
    {isPhone ? <div style={{ display: 'grid' }}>
      <div inert={hasSelection} style={actionRowStyle(hasSelection)}>{views}</div>
      <div style={actionRowStyle(false)}>{bulk}</div>
    </div> : hasSelection ? bulk : views}
  </>;
}

function actionRowStyle(isHidden: boolean): CSSProperties {
  return { gridArea: '1 / 1', minWidth: 0, opacity: isHidden ? 0 : 1, visibility: isHidden ? 'hidden' : 'visible' };
}

function LineFilters(props: { readonly search: string; readonly desk: Desk; readonly setParams: SearchSetter }) {
  return (
    <search aria-label="跟进中心筛选">
      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
        <Flex align="center" wrap gap={8}>
          <div style={filterBoxStyle(200)}>
            <SearchTerm applied={props.desk.q} onSearch={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'text', value } }))} />
          </div>
          <ViewSwitch
            aria-label="订单线别"
            value={props.desk.lane}
            options={[{ label: '成品线', value: 'finished' }, { label: '物料线', value: 'material' }, { label: '全部线', value: 'all' }]}
            onChange={(value) => props.setParams(writeDesk({ search: props.search, change: { kind: 'lane', value } }))}
          />
          <div style={filterBoxStyle(152)}>
            <StageFilter search={props.search} desk={props.desk} setParams={props.setParams} />
          </div>
          <OverdueFilter search={props.search} isOverdue={props.desk.isOverdue} setParams={props.setParams} />
          <ImportScopeAction search={props.search} setParams={props.setParams} />
        </Flex>
      </Card>
    </search>
  );
}

function SearchTerm({ applied, onSearch }: { readonly applied: string; readonly onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState({ applied, value: applied });
  if (draft.applied !== applied) setDraft({ applied, value: applied });
  return <Input.Search
    aria-label="搜索单号、品名或编码"
    placeholder="搜索单号 / 品名 / 编码"
    value={draft.applied === applied ? draft.value : applied}
    onChange={(event) => setDraft({ applied, value: event.target.value })}
    onSearch={onSearch}
    allowClear
  />;
}

function ImportScopeAction({ search, setParams }: { readonly search: string; readonly setParams: SearchSetter }) {
  const params = new URLSearchParams(search);
  if (!params.has('importBatchId')) return null;
  return <Button onClick={() => {
    params.delete('importBatchId');
    params.delete('page');
    setParams(params);
  }}>退出本次导入范围</Button>;
}

function filterBoxStyle(basis: number): CSSProperties {
  return { flex: `1 1 ${basis}px`, maxWidth: 280, minWidth: 0 };
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

function partyDrawer(input: { readonly party: ReturnType<typeof readPartyPreview>; readonly search: string; readonly setParams: SearchSetter }) {
  if (input.party === null) return null;
  const opened = input.party.opened;
  return <PartyPreviewDrawer key={`${opened.role}:${opened.partyId}`} opened={opened} onClose={() => keepPlace(input.setParams, closePartyPreview(input.search))} />;
}

function keepPlace(setParams: SearchSetter, next: URLSearchParams): void {
  setParams(next, { preventScrollReset: true });
}
