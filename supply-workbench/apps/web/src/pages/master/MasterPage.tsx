import { Alert, Button, Empty, Flex, Input, Result, Skeleton, Space, Tabs, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { FactoryReportRowViewSchema, MultiNameViewSchema, OrderLineDetailSchema, PartyAliasViewSchema, PartyDetailSchema, listResponseSchema, type FactoryReportRowView, type MultiNameView, type PartyAliasView, type PartyDetail } from '@sw/contracts';
import { apiErrorMessage, apiGet, apiSend } from '../../shared/api/client.js';
import { multiNameChoice, roleChoice } from '../../features/master-data/index.js';
import { useRefreshReviewQueue } from '../../features/shell/index.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { ImportReviewNav } from '../../shared/ui/import-review-nav.js';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { AliasReviewDrawer, type AliasRoles } from './AliasReviewDrawer.js';
import { FactoryLinkTab } from './FactoryLinkTab.js';
import { MASTER_TABS, masterTabOf, writeMasterTab, type MasterTabKey } from './master-tabs.js';
import { OwnerMapTab } from './OwnerMapTab.js';
import { readPartyAliasDrawer, writePartyAliasDrawer } from './party-alias-drawer-url.js';
import { unlinkedRowText } from './unlinked-row-text.js';

type LoadState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'error'; readonly message: string };

export function MasterPage() {
  const refresh = useRefreshReviewQueue();
  const [message, setMessage] = useState('');
  const [params, setParams] = useSearchParams();
  const tab = masterTabOf(params.get('tab'));
  const contents: Record<MasterTabKey, ReactNode> = {
    aliases: <AliasReviewQueue refresh={refresh} />,
    multi: <MultiNameReview refresh={refresh} setMessage={setMessage} />,
    unlinked: <UnlinkedRows refresh={refresh} setMessage={setMessage} />,
    'owner-map': <OwnerMapTab />,
    'factory-link': <FactoryLinkTab />,
  };
  return (
    <WorkbenchPage title="主数据">
      <ImportReviewNav />
      {message === '' ? null : <Alert type="error" showIcon title={message} />}
      <Tabs
        activeKey={tab}
        onChange={(key) => setParams(writeMasterTab(params.toString(), masterTabOf(key)))}
        items={MASTER_TABS.map((item) => ({ key: item.key, label: item.label, children: contents[item.key] }))}
      />
    </WorkbenchPage>
  );
}

function AliasReviewQueue({ refresh }: { readonly refresh: () => Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<LoadState<readonly PartyAliasView[]>>({ kind: 'loading' });
  const load = () => { setState({ kind: 'loading' }); void loadAliases(setState); };
  useEffect(load, []);
  const aliases = state.kind === 'ready' ? state.value : [];
  const openedAliasId = readPartyAliasDrawer(params.toString());
  const openedAlias = openedAliasId === null ? undefined : aliases.find((alias) => alias.id === openedAliasId);
  return (
    <>
      <AliasReviewList state={state} onRetry={load} onOpen={(aliasId) => setParams(writePartyAliasDrawer({ search: params.toString(), aliasId, isOpen: true }))} />
      {openedAlias === undefined ? null : <ActiveAliasDrawer key={openedAlias.id} alias={openedAlias} open refresh={refresh} onDone={() => { setParams(writePartyAliasDrawer({ search: params.toString(), aliasId: openedAlias.id, isOpen: false })); setState({ kind: 'loading' }); void loadAliases(setState); }} onClose={() => setParams(writePartyAliasDrawer({ search: params.toString(), aliasId: openedAlias.id, isOpen: false }))} />}
    </>
  );
}

function AliasReviewList(props: { readonly state: LoadState<readonly PartyAliasView[]>; readonly onRetry: () => void; readonly onOpen: (aliasId: string) => void }) {
  if (props.state.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (props.state.kind === 'error') return <Result status="error" title="待审核别名没有读出来。" subTitle={props.state.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  if (props.state.value.length === 0) return <Empty description="没有待审核的别名。下一步：去导入总表。"><Button href="/imports">去导入</Button></Empty>;
  return <SectionGroup title="待审核别名" meta={`${props.state.value.length} 条`}><div>{props.state.value.map((alias) => <AliasReview key={alias.id} alias={alias} onOpen={() => props.onOpen(alias.id)} />)}</div></SectionGroup>;
}

function AliasReview({ alias, onOpen }: { readonly alias: PartyAliasView; readonly onOpen: () => void }) {
  return (
    <SectionRow action={<Button onClick={onOpen}>审核</Button>}>
      <Space orientation="vertical" size={4}>
        <Typography.Text strong>{alias.rawName}</Typography.Text>
        <Typography.Text type="secondary">出现 {alias.seenCount} 次</Typography.Text>
      </Space>
    </SectionRow>
  );
}

function ActiveAliasDrawer(props: {
  readonly alias: PartyAliasView;
  readonly open: boolean;
  readonly refresh: () => Promise<void>;
  readonly onDone: () => void;
  readonly onClose: () => void;
}) {
  const [roles, setRoles] = useState<AliasRoles>({ isSupplier: true, isFactory: false });
  const [partyId, setPartyId] = useState('');
  const [isConfirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  return (
    <AliasReviewDrawer
      alias={props.alias}
      open={props.open}
      partyId={partyId}
      roles={roles}
      confirmed={isConfirmed}
      isSubmitting={isSubmitting}
      error={error}
      onParty={(value) => { setPartyId(value); setConfirmed(false); setError(''); }}
      onRoles={(value) => { setRoles(value); setError(''); }}
      onConfirm={() => setConfirmed(true)}
      onSubmit={() => {
        const selectedRoles = roleChoice(roles);
        setSubmitting(true);
        setError('');
        void approveAlias({ alias: props.alias, partyId, roles: selectedRoles, confirmed: isConfirmed, refresh: props.refresh, onDone: props.onDone, setMessage: setError }).finally(() => setSubmitting(false));
      }}
      onClose={props.onClose}
    />
  );
}

async function loadAliases(setState: (state: LoadState<readonly PartyAliasView[]>) => void) {
  try {
    const listed = await apiGet('/api/v1/master/aliases?status=pending&pageSize=200', listResponseSchema(PartyAliasViewSchema));
    setState({ kind: 'ready', value: listed.items });
  } catch {
    setState({ kind: 'error', message: '待审核别名没有读出来。' });
  }
}

export async function approveAlias(input: { readonly alias: PartyAliasView; readonly partyId: string; readonly roles: { readonly isSupplier: boolean; readonly isFactory: boolean } | null; readonly confirmed: boolean; readonly refresh: () => Promise<void>; readonly onDone: () => void; readonly setMessage: (message: string) => void }) {
  const body = input.partyId === ''
    ? { createParty: { displayName: input.alias.rawName, isSupplier: input.roles?.isSupplier === true, isFactory: input.roles?.isFactory === true } }
    : { partyId: input.partyId, ...(input.confirmed ? { confirmForbiddenPair: true } : {}) };
  try {
    await apiSend({ path: `/api/v1/master/aliases/${encodeURIComponent(input.alias.id)}/approve`, method: 'POST', body, schema: PartyAliasViewSchema });
    await input.refresh();
  } catch {
    input.setMessage(`${input.alias.rawName} 没有通过。`);
    return;
  }
  input.setMessage('');
  input.onDone();
}

function MultiNameReview({ refresh, setMessage }: { readonly refresh: () => Promise<void>; readonly setMessage: (message: string) => void }) {
  const [state, setState] = useState<LoadState<readonly MultiNameView[]>>({ kind: 'loading' });
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const [pending, setPending] = useState<string | null>(null);
  const load = () => { setState({ kind: 'loading' }); void loadMultiName(setState); };
  useEffect(() => { load(); }, []);
  if (state.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (state.kind === 'error') return <Result status="error" title="一号多名没有读出来。" subTitle={state.message} extra={<Button type="primary" onClick={load}>重试</Button>} />;
  if (state.value.length === 0) return <Empty description="没有一号多名记录。下一步：去导入总表。"><Button href="/imports">去导入</Button></Empty>;
  return (
    <SectionGroup title="一号多名" meta={`${state.value.length} 条`}>
      {state.value.map((row) => {
        const isRowPending = pending === row.codeId;
        return <SectionRow key={row.codeId} action={<Space wrap>
          <Button loading={isRowPending} disabled={pending !== null || (names[row.codeId] ?? '').trim() === ''} onClick={() => {
            setPending(row.codeId);
            void resolveName({ codeId: row.codeId, body: multiNameChoice('same_item', names[row.codeId] ?? ''), refresh, setRows: (rows) => setState({ kind: 'ready', value: rows }) }).catch((error: unknown) => { report(setMessage, error); }).finally(() => setPending(null));
          }}>当成同一物料</Button>
          <Button loading={isRowPending} disabled={pending !== null} onClick={() => {
            setPending(row.codeId);
            void resolveName({ codeId: row.codeId, body: multiNameChoice('shared_code', ''), refresh, setRows: (rows) => setState({ kind: 'ready', value: rows }) }).catch((error: unknown) => { report(setMessage, error); }).finally(() => setPending(null));
          }}>共用编码</Button>
        </Space>}>
          <Space orientation="vertical" size={4}>
            <Typography.Text strong>{row.codeRaw}</Typography.Text>
            <Typography.Text type="secondary">{row.names.map((item) => item.nameRaw).join(' / ')}</Typography.Text>
            <Input value={names[row.codeId] ?? ''} onChange={(event) => setNames((current) => ({ ...current, [row.codeId]: event.target.value }))} placeholder="统一名称" style={{ width: 200 }} />
          </Space>
        </SectionRow>;
      })}
    </SectionGroup>
  );
}

async function loadMultiName(setState: (state: LoadState<readonly MultiNameView[]>) => void): Promise<void> {
  try {
    const listed = await apiGet('/api/v1/master/multi-name', listResponseSchema(MultiNameViewSchema));
    setState({ kind: 'ready', value: listed.items });
  } catch {
    setState({ kind: 'error', message: '一号多名没有读出来。' });
  }
}

const UNLINKED_READ_ERROR = '未关联上报没有读出来。';

export async function readUnlinked(): Promise<{ readonly rows: readonly FactoryReportRowView[]; readonly error: string }> {
  try {
    const listed = await apiGet('/api/v1/factory-reports/unlinked', listResponseSchema(FactoryReportRowViewSchema));
    return { rows: listed.items, error: '' };
  } catch {
    return { rows: [], error: UNLINKED_READ_ERROR };
  }
}

function UnlinkedRows({ refresh, setMessage }: { readonly refresh: () => Promise<void>; readonly setMessage: (message: string) => void }) {
  const [state, setState] = useState<LoadState<readonly FactoryReportRowView[]>>({ kind: 'loading' });
  const [q, setQ] = useState('');
  const [lineId, setLineId] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const load = () => { setState({ kind: 'loading' }); void readUnlinked().then((loaded) => loaded.error === '' ? setState({ kind: 'ready', value: loaded.rows }) : setState({ kind: 'error', message: loaded.error })); };
  useEffect(() => { load(); }, []);
  if (state.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (state.kind === 'error') return <Result status="error" title="未关联上报没有读出来。" subTitle={state.message} extra={<Button type="primary" onClick={load}>重试</Button>} />;
  const visible = state.value.filter((row) => q === '' || row.sheetName.includes(q) || String(row.rowNo).includes(q));
  return (
    <SectionGroup title="未关联上报" meta={`${visible.length} 条`}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索表名或行号" style={{ width: 200 }} />
        <Input value={lineId} onChange={(event) => setLineId(event.target.value)} placeholder="订单行编号" style={{ width: 200 }} />
      </Space>
      {visible.length === 0 ? <Empty description="没有未关联上报。下一步：去代工厂进度。"><Button href="/imports">去导入</Button></Empty> : null}
      {visible.map((row) => {
        const isRowPending = pending === row.id;
        return <SectionRow key={row.id} action={<Space wrap>
          <Button loading={isRowPending} disabled={lineId === '' || tableName(row.kind) === null || pending !== null} onClick={() => {
            const table = tableName(row.kind);
            if (table === null) return;
            setPending(row.id);
            void linkReport({ table, rowId: row.id, orderLineId: lineId, refresh, setRows: (rows) => setState({ kind: 'ready', value: rows }) }).catch((error: unknown) => { report(setMessage, error); }).finally(() => setPending(null));
          }}>挂接</Button>
          {row.kind === 'in_transit' ? <Button loading={isRowPending} disabled={pending !== null} onClick={() => {
            setPending(row.id);
            void createLine({ rowId: row.id, refresh }).then(load).catch((error: unknown) => { report(setMessage, error); }).finally(() => setPending(null));
          }}>建成订单行</Button> : null}
        </Space>}>
          <Typography.Text>{unlinkedRowText(row)}</Typography.Text>
        </SectionRow>;
      })}
    </SectionGroup>
  );
}

async function resolveName(input: { readonly codeId: string; readonly body: { readonly mode: 'same_item'; readonly displayName: string } | { readonly mode: 'shared_code' }; readonly refresh: () => Promise<void>; readonly setRows: (rows: readonly MultiNameView[]) => void }) {
  await apiSend({ path: `/api/v1/master/multi-name/${encodeURIComponent(input.codeId)}/resolve`, method: 'POST', body: input.body, schema: MultiNameViewSchema });
  await input.refresh();
  const listed = await apiGet('/api/v1/master/multi-name', listResponseSchema(MultiNameViewSchema));
  input.setRows(listed.items);
}

async function linkReport(input: { readonly table: string; readonly rowId: string; readonly orderLineId: string; readonly refresh: () => Promise<void>; readonly setRows: (rows: readonly FactoryReportRowView[]) => void }) {
  await apiSend({ path: `/api/v1/factory-reports/${input.table}/${encodeURIComponent(input.rowId)}/link`, method: 'POST', body: { orderLineId: input.orderLineId }, schema: FactoryReportRowViewSchema });
  await input.refresh();
  const listed = await apiGet('/api/v1/factory-reports/unlinked', listResponseSchema(FactoryReportRowViewSchema));
  input.setRows(listed.items);
}

async function createLine(input: { readonly rowId: string; readonly refresh: () => Promise<void> }): Promise<void> {
  await apiSend({ path: `/api/v1/factory-reports/in-transit/${encodeURIComponent(input.rowId)}/create-line`, method: 'POST', body: {}, schema: OrderLineDetailSchema });
  await input.refresh();
}

function report(setMessage: (message: string) => void, error: unknown): void {
  setMessage(apiErrorMessage(error) ?? '操作没有完成，请稍后重试。');
}

function tableName(kind: FactoryReportRowView['kind']): string | null {
  if (kind === 'in_transit') return 'in-transit';
  if (kind === 'packaging_combo') return 'packaging-combo';
  if (kind === 'customer_supplied') return null;
  return kind;
}

export function PartyPage() {
  const params = useParams();
  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tab, setTab] = useState<'aliases' | 'kpis'>('aliases');
  const load = () => {
    if (params.id === undefined) {
      setLoadState('error');
      return;
    }
    setLoadState('loading');
    void apiGet(`/api/v1/parties/${encodeURIComponent(params.id)}`, PartyDetailSchema)
      .then((value) => { setDetail(value); setLoadState('ready'); })
      .catch(() => { setDetail(null); setLoadState('error'); });
  };
  useEffect(() => { load(); }, [params.id]);
  if (loadState === 'loading') return <WorkbenchPage title="主体"><Skeleton active paragraph={{ rows: 6 }} /></WorkbenchPage>;
  if (loadState === 'error' || detail === null) return <WorkbenchPage title="主体"><Result status="error" title="主体详情没有读出来" extra={<Button type="primary" onClick={load}>重试</Button>} /></WorkbenchPage>;
  const partyName = detail.party.displayName;
  return (
    <WorkbenchPage title={`主体 ${partyName}`} action={<PartyOrderLinks partyId={detail.party.id} />}>
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key === 'kpis' ? 'kpis' : 'aliases')}
        items={[
          { key: 'aliases', label: '别名', children: <PartyAliases detail={detail} /> },
          { key: 'kpis', label: '指标', children: <PartyKpis detail={detail} /> },
        ]}
      />
    </WorkbenchPage>
  );
}

function PartyOrderLinks({ partyId }: { readonly partyId: string }) {
  const supplierOrders = new URLSearchParams({ lane: 'all', supplierPartyId: partyId });
  const factoryOrders = new URLSearchParams({ lane: 'all', factoryPartyId: partyId });
  return (
    <Flex gap="small" justify="flex-end" wrap>
      <Button href={`/lines?${supplierOrders}`}>查看供应商订单</Button>
      <Button href={`/lines?${factoryOrders}`}>查看代工厂相关订单</Button>
    </Flex>
  );
}

function PartyAliases({ detail }: { readonly detail: PartyDetail }) {
  return <ul>{detail.aliases.map((alias) => <li key={alias.id}>{alias.rawName}</li>)}</ul>;
}

function PartyKpis({ detail }: { readonly detail: PartyDetail }) {
  const due = detail.kpis.dueBatches.n;
  const onTime = detail.kpis.onTime.n;
  const { from, to } = detail.kpiWindow;
  return <Typography.Text id="kpis">应到 {due} · 准时样本 {onTime} · 近一个月 {from} 至 {to}</Typography.Text>;
}
