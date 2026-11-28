import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Button, Card, Drawer, Empty, Flex, Pagination, Skeleton, Typography } from 'antd';
import { ArrivalDetailSchema, ArrivalListSchema, ArrivalSchema, type Arrival, type ArrivalCandidate, type RegisterArrivalInput, type ReviseArrivalInput } from '@sw/contracts';
import { loadPartyOptions } from '../../../features/master-data/index.js';
import { useFollowUpSearch } from '../../../features/follow-up/index.js';
import { useCanWrite } from '../../../shared/actor.js';
import { ApiError, apiErrorMessage, apiGet, apiGetWithSignal, apiSend } from '../../../shared/api/client.js';
import { writeUrlState } from '../../../shared/hooks/url-state.js';
import { ViewSwitch } from '../../../shared/ui/view-switch.js';
import { AllocateArrivalForm, arrivalCandidateSource, RegisterArrivalForm, RollbackArrivalForm, type Warehouse } from './arrival-forms.js';

const base = '/api/v1/receipts/arrivals';
const invalidFields = '请检查凭据字段与数量，数量须大于 0，最多 4 位小数。';

export function ArrivalDesk({ userId, onMutated }: { readonly userId: string; readonly onMutated: () => void }) {
  const [params, setParams] = useFollowUpSearch();
  const canWrite = useCanWrite('records.write');
  const isAdmin = useCanWrite('admin');
  if (!canWrite) return null;
  const selection = params.get('arrival');
  const select = (value: string | null) => setParams(new URLSearchParams(writeUrlState(params.toString(), { arrival: value })), { replace: true });
  return <>
    <Button onClick={() => select('list')}>到仓待归单</Button>
    {selection === null ? null : <Drawer open title="到仓待归单" size="large" onClose={() => select(null)}>
      <ArrivalContent selection={selection} select={select} userId={userId} isAdmin={isAdmin} onMutated={onMutated} />
    </Drawer>}
  </>;
}

function ArrivalContent({ selection, select, userId, isAdmin, onMutated }: {
  readonly selection: string;
  readonly select: (value: string) => void;
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly onMutated: () => void;
}) {
  const [warehouses, setWarehouses] = useState<readonly Warehouse[]>([]);
  const [warehouseError, setWarehouseError] = useState('');
  useEffect(() => {
    let isActive = true;
    void loadPartyOptions({ role: 'own_warehouse' }).then((result) => {
      if (isActive) setWarehouses(result.items);
    }).catch((error: unknown) => {
      if (isActive) setWarehouseError(apiErrorMessage(error) ?? '仓库读取失败');
    });
    return () => { isActive = false; };
  }, []);
  if (selection === 'list') return <ArrivalList warehouses={warehouses} select={select} />;
  return <Flex vertical gap={16}>
    <div><Button onClick={() => select('list')}>返回到仓列表</Button></div>
    {warehouseError === '' ? null : <Alert showIcon type="error" title={warehouseError} />}
    {selection === 'register'
      ? <RegisterPane warehouses={warehouses} select={select} />
      : <ArrivalDetail key={selection} id={selection} warehouses={warehouses} userId={userId} isAdmin={isAdmin} onMutated={onMutated} />}
  </Flex>;
}

type ArrivalListResult = Awaited<ReturnType<typeof readArrivalList>>;
function readArrivalList({ filter, page, signal }: { readonly filter: 'pending' | 'all'; readonly page: number; readonly signal: AbortSignal }) {
  return apiGetWithSignal({ path: `${base}?filter=${filter}&page=${page}`, schema: ArrivalListSchema, signal });
}

function ArrivalList({ warehouses, select }: { readonly warehouses: readonly Warehouse[]; readonly select: (value: string) => void }) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ArrivalListResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void readArrivalList({ filter, page, signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted) setResult(next);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(apiErrorMessage(caught) ?? '到仓记录读取失败');
    });
    return () => controller.abort();
  }, [filter, page]);
  return <Flex vertical gap={12}>
    <Flex justify="space-between" wrap="wrap" gap={8}>
      <ViewSwitch aria-label="到仓记录范围" value={filter} options={[{ label: '待归单', value: 'pending' }, { label: '全部记录', value: 'all' }]}
        onChange={(value) => { setError(''); setResult(null); setPage(1); setFilter(value); }} />
      <Button type="primary" onClick={() => select('register')}>登记到仓</Button>
    </Flex>
    {error === '' ? null : <Alert showIcon type="error" title={error} />}
    {result === null && error === '' ? <Skeleton active /> : null}
    {result?.items.length === 0 ? <Empty description="暂无到仓记录" /> : null}
    {result?.items.map((row) => <Card key={row.id} size="small" title={referenceText(row.source)} extra={<Button type="link" onClick={() => select(row.id)}>查看凭据</Button>}>
      <ArrivalSummary row={row} warehouses={warehouses} />
    </Card>)}
    {result === null || result.page.total <= result.page.pageSize ? null : <Pagination current={page} pageSize={result.page.pageSize} total={result.page.total}
      showSizeChanger={false} onChange={(next) => { setError(''); setResult(null); setPage(next); }} />}
  </Flex>;
}

function RegisterPane({ warehouses, select }: { readonly warehouses: readonly Warehouse[]; readonly select: (value: string) => void }) {
  const { error, isSaving, save, invalidate } = useSave({ path: base, onSaved: (row) => select(row.id) });
  return <>
    {error === '' ? null : <Alert showIcon type="error" title={error} />}
    <RegisterArrivalForm warehouses={warehouses} isSaving={isSaving} onSubmit={save} onInvalid={invalidate} />
  </>;
}

type DetailResult = Awaited<ReturnType<typeof readDetail>>;
function readDetail(id: string) {
  return apiGet(`${base}/${encodeURIComponent(id)}`, ArrivalDetailSchema);
}

function ArrivalDetail({ id, warehouses, userId, isAdmin, onMutated }: {
  readonly id: string;
  readonly warehouses: readonly Warehouse[];
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly onMutated: () => void;
}) {
  const [detail, setDetail] = useState<DetailResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let isActive = true;
    void readDetail(id).then((result) => {
      if (isActive) setDetail(result);
    }).catch((caught: unknown) => {
      if (isActive) setError(apiErrorMessage(caught) ?? '到仓凭据读取失败');
    });
    return () => { isActive = false; };
  }, [id]);
  if (error !== '') return <Alert showIcon type="error" title={error} />;
  if (detail === null) return <Skeleton active />;
  const { arrival, candidates } = detail;
  return <Flex vertical gap={16}>
    <Card size="small" title={referenceText(arrival.source)}>
      <ArrivalSummary row={arrival} warehouses={warehouses} />
    </Card>
    {arrival.allocation === null
      ? <Alert showIcon type="info" title="待核对仓库点收和逐 PO 行归批依据"
          description="请核对点收单号和行号、有效实收量及单位，以及每笔对应的 PO 明细和要货批次。点收量有差异或单位不同时，补充对应的点收、换算或复点依据。" />
      : <ActiveAllocations row={arrival.allocation} />}
    <CandidateLines candidates={candidates} />
    {(arrival.allocation === null || arrival.allocation.by === userId || isAdmin)
      ? <AllocationActions key={arrival.revision} arrival={arrival} candidates={candidates} onSaved={(row) => { setDetail({ arrival: row, candidates }); onMutated(); }} />
      : <Typography.Text type="secondary">本次分配可由登记人或管理员更正。</Typography.Text>}
  </Flex>;
}

function ArrivalSummary({ row, warehouses }: { readonly row: Arrival; readonly warehouses: readonly Warehouse[] }) {
  const warehouse = warehouses.find((party) => party.id === row.warehouseId)?.displayName ?? row.warehouseId;
  return <Typography.Text>{row.receivedOn} · {warehouse} · {row.itemCode} · {row.qty} {row.unit} · {row.allocation === null ? '待归单' : '已归单'}</Typography.Text>;
}

function ActiveAllocations({ row }: { readonly row: NonNullable<Arrival['allocation']> }) {
  return <Card size="small" title="有效分配">
    <Typography.Paragraph>{referenceText(row.count.document)} · 已核实点收 {row.count.qty} {row.count.unit}
      {row.count.conversionEvidence === null ? '' : ` · ${row.count.conversionEvidence}`}</Typography.Paragraph>
    <ul>
      {row.rows.map((line) => <li key={line.receiptId}>
        <Link to={`/lines/${encodeURIComponent(line.lineId)}`}>{line.poNumber} · 明细 {line.poLine}</Link>
        {' · '}{line.qty} {row.count.unit}{' · '}{line.evidence}
      </li>)}
    </ul>
  </Card>;
}

function CandidateLines({ candidates }: { readonly candidates: readonly ArrivalCandidate[] }) {
  return <Card size="small" title="候选订单行">
    {candidates.length === 0 ? <Typography.Text type="secondary">未找到同商品、同仓库的订单行。</Typography.Text> : <ul>
      {candidates.map((row) => <li key={row.batch?.id ?? row.lineId}>
        <Link to={`/lines/${encodeURIComponent(row.lineId)}`} target="_blank" rel="noopener">{row.poNumber ?? '未填写 PO'} · {arrivalCandidateSource(row)}</Link>
        {row.itemName === null ? '' : ` · ${row.itemName}`}
        {row.batch === null ? ' · 无同仓批次' : ` · 批次 ${row.batch.seq} · ${row.batch.canAllocate ? `确认到仓 ${row.batch.confirmedOn ?? ''}` : '批次待核'}`}
      </li>)}
    </ul>}
  </Card>;
}

function AllocationActions({ arrival, candidates, onSaved }: {
  readonly arrival: Arrival;
  readonly candidates: readonly ArrivalCandidate[];
  readonly onSaved: (row: Arrival) => void;
}) {
  const [mode, setMode] = useState<'allocate' | 'rollback' | null>(null);
  const { error, isSaving, save, invalidate } = useSave({ path: `${base}/${encodeURIComponent(arrival.id)}/revise`, onSaved });
  if (mode === null) return <Flex gap={8} wrap="wrap">
    <Button type="primary" disabled={!candidates.some((row) => row.batch?.canAllocate === true)} onClick={() => setMode('allocate')}>
      {arrival.allocation === null ? '补齐凭据并分配' : '更正分配'}
    </Button>
    {arrival.allocation === null ? null : <Button danger onClick={() => setMode('rollback')}>撤销分配</Button>}
  </Flex>;
  return <Card size="small" title={mode === 'rollback' ? '撤销分配' : arrival.allocation === null ? '核实凭据并分配' : '更正分配'}
    extra={<Button disabled={isSaving} onClick={() => setMode(null)}>取消</Button>}>
    {error === '' ? null : <Alert showIcon type="error" title={error} />}
    {mode === 'rollback'
      ? <RollbackArrivalForm arrival={arrival} isSaving={isSaving} onSubmit={save} onInvalid={invalidate} />
      : <AllocateArrivalForm arrival={arrival} candidates={candidates} isSaving={isSaving} onSubmit={save} onInvalid={invalidate} />}
  </Card>;
}

function useSave({ path, onSaved }: { readonly path: string; readonly onSaved: (row: Arrival) => void }) {
  const [error, setError] = useState('');
  const [isSaving, setSaving] = useState(false);
  return {
    error, isSaving, invalidate: () => setError(invalidFields),
    save(body: RegisterArrivalInput | ReviseArrivalInput) {
      setError('');
      setSaving(true);
      void apiSend({ path, method: 'POST', body, schema: ArrivalSchema }).then(onSaved).catch((caught: unknown) => {
        const reason = caught instanceof ApiError ? caught.details : null;
        setError(typeof reason === 'object' && reason !== null && 'reason' in reason && typeof reason.reason === 'string'
          ? reason.reason : apiErrorMessage(caught) ?? '凭据保存失败');
      }).finally(() => setSaving(false));
    },
  };
}

function referenceText(ref: Arrival['source']): string {
  return `${ref.source} · ${ref.number} · ${ref.row}`;
}
