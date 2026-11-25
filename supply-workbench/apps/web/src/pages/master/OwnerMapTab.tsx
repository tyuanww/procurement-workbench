import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Alert, Button, Card, Empty, Flex, Popconfirm, Select, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import {
  OwnerCoverageSchema,
  OwnerUpdatedSchema,
  PendingOwnerListSchema,
  UserViewSchema,
  type OwnerAssignmentSource,
  type OwnerCoverage,
  type PendingOwnerView,
  type UserView,
} from '@sw/contracts';
import { can } from '@sw/domain';
import { apiErrorMessage, apiGet, apiSend, asArray } from '../../shared/api/client.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { space, statusColor } from '../../theme/tokens.js';
import { isForbidden, type TabNotice } from './notice.js';

export type LoadState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'error'; readonly message: string };

export type CoverageState = LoadState<OwnerCoverage> | { readonly kind: 'forbidden' };

export type ResolversState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly users: readonly UserView[] }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'error' };

export function OwnerMapTab(): ReactNode {
  const [coverage, setCoverage] = useState<CoverageState>({ kind: 'loading' });
  const [pending, setPending] = useState<LoadState<readonly PendingOwnerView[]>>({ kind: 'loading' });
  const [resolvers, setResolvers] = useState<ResolversState>({ kind: 'loading' });
  const [busyName, setBusyName] = useState<string | null>(null);
  const [notice, setNotice] = useState<TabNotice | null>(null);
  const reload = () => { void loadOwnerCoverage(setCoverage); void loadPendingOwners(setPending); };
  const retry = () => { reload(); void loadResolvers(setResolvers); };
  useEffect(() => { reload(); void loadResolvers(setResolvers); }, []);
  const resolve = (row: PendingOwnerView, owner: UserView) => {
    setBusyName(row.nameRaw);
    setNotice(null);
    void resolveOwnerMapping({ nameRaw: row.nameRaw, owner, onUpdated: (updated) => {
      setNotice({ kind: 'success', text: `已把「${row.nameRaw}」指定给「${owner.name}」，更新 ${updated} 条订单行。` });
      reload();
    } }).catch((error: unknown) => {
      setNotice({ kind: 'error', text: apiErrorMessage(error) ?? '负责人映射没有写成功，请稍后重试。' });
    }).finally(() => setBusyName(null));
  };
  return (
    <Space orientation="vertical" size={space[4]} style={{ width: '100%' }}>
      {notice === null ? null : <Alert type={notice.kind} showIcon title={notice.text} />}
      <OwnerCoverageSection state={coverage} onRetry={reload} />
      <PendingOwnerList state={pending} resolvers={resolvers} busyName={busyName} onResolve={resolve} onRetry={retry} />
    </Space>
  );
}

export function OwnerCoverageSection(input: { readonly state: CoverageState; readonly onRetry: () => void }): ReactNode {
  if (input.state.kind === 'loading') return <Skeleton active paragraph={{ rows: 2 }} />;
  if (input.state.kind === 'forbidden') return <Alert type="info" showIcon title="覆盖统计需要采购或管理员权限。当前账号可以查看待审核负责人，指定负责人请管理员操作。" />;
  if (input.state.kind === 'error') return <ReadError message={input.state.message} onRetry={input.onRetry} />;
  return <OwnerCoverageCards coverage={input.state.value} />;
}

export function OwnerCoverageCards({ coverage }: { readonly coverage: OwnerCoverage }): ReactNode {
  return (
    <SectionGroup title="负责人覆盖" action={<ProcurementCutoff />} meta="订单行当前归属">
      <Flex wrap gap={space[3]}>
        {coverageStats(coverage).map((item) => (
          <Card key={item.key} size="small" style={{ flex: '1 1 140px', minWidth: 140 }}>
            <Statistic title={item.label} value={item.value} />
          </Card>
        ))}
      </Flex>
      <Typography.Paragraph type="secondary" style={{ marginTop: space[2], marginBottom: 0 }}>
        口径：按订单行当前负责人归属统计；来源分别是采购单导入、映射导入和手工指定。未匹配的名称进入待审核，界面不显示假负责人。
      </Typography.Paragraph>
    </SectionGroup>
  );
}

export type PendingOwnerListProps = {
  readonly state: LoadState<readonly PendingOwnerView[]>;
  readonly resolvers: ResolversState;
  readonly busyName: string | null;
  readonly onResolve: (row: PendingOwnerView, owner: UserView) => void;
  readonly onRetry: () => void;
};

export function PendingOwnerList(input: PendingOwnerListProps): ReactNode {
  if (input.state.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (input.state.kind === 'error') return <ReadError message={input.state.message} onRetry={input.onRetry} />;
  const canResolve = input.resolvers.kind === 'ready';
  return (
    <SectionGroup title="待审核负责人" meta={`${input.state.value.length} 条`}>
      <ResolverHint state={input.resolvers} onRetry={input.onRetry} />
      {input.state.value.length === 0
        ? <Empty description="没有待审核的负责人。下一步：导入带采购负责人列的 PO 总表，或由管理员手工指派。" />
        : <div>{input.state.value.map((row) => (
            <PendingOwnerRow key={row.id} row={row} users={canResolve ? input.resolvers.users : []} mode={resolverMode(input.resolvers)} isBusy={input.busyName === row.nameRaw} onResolve={input.onResolve} />
          ))}</div>}
    </SectionGroup>
  );
}

function PendingOwnerRow(input: {
  readonly row: PendingOwnerView;
  readonly users: readonly UserView[];
  readonly mode: 'resolve' | 'readonly' | 'loading';
  readonly isBusy: boolean;
  readonly onResolve: (row: PendingOwnerView, owner: UserView) => void;
}): ReactNode {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = input.users.find((user) => user.id === selectedId);
  return (
    <SectionRow action={<PendingOwnerAction row={input.row} users={input.users} mode={input.mode} isBusy={input.isBusy} selected={selected} onSelect={setSelectedId} onResolve={input.onResolve} />}>
      <Space orientation="vertical" size={4}>
        <Space wrap>
          <Typography.Text strong>{input.row.nameRaw}</Typography.Text>
          <Tag style={sourceTagStyle(input.row.source)}>{ownerSourceLabel(input.row.source)}</Tag>
        </Space>
        <Typography.Text type="secondary">订单行 {input.row.lineId} · 登记于 {formatDateTime(input.row.effectiveAt) ?? input.row.effectiveAt}</Typography.Text>
      </Space>
    </SectionRow>
  );
}

function PendingOwnerAction(input: {
  readonly row: PendingOwnerView;
  readonly users: readonly UserView[];
  readonly mode: 'resolve' | 'readonly' | 'loading';
  readonly isBusy: boolean;
  readonly selected: UserView | undefined;
  readonly onSelect: (id: string | null) => void;
  readonly onResolve: (row: PendingOwnerView, owner: UserView) => void;
}): ReactNode {
  if (input.mode !== 'resolve') return <Tag>{input.mode === 'readonly' ? '只读' : '读取中'}</Tag>;
  const isDisabled = input.isBusy || input.selected === undefined;
  return (
    <Space wrap>
      <Select
        aria-label={`负责人 ${input.row.nameRaw}`}
        placeholder="选择负责人"
        style={{ width: 160 }}
        value={input.selected?.id ?? null}
        options={input.users.map((user) => ({ value: user.id, label: user.name }))}
        onChange={(value: string) => input.onSelect(value)}
      />
      <Popconfirm
        title={`确认把「${input.row.nameRaw}」下的待审核订单行指定给「${input.selected?.name ?? ''}」？`}
        description="同一原始名称的所有待审核订单行会一起更新，来源记为映射导入。"
        okText="确认指定"
        cancelText="取消"
        disabled={isDisabled}
        onConfirm={() => { if (input.selected !== undefined) input.onResolve(input.row, input.selected); }}
      >
        <Button type="primary" loading={input.isBusy} disabled={isDisabled}>指定负责人</Button>
      </Popconfirm>
    </Space>
  );
}

function ResolverHint(input: { readonly state: ResolversState; readonly onRetry: () => void }): ReactNode {
  if (input.state.kind === 'forbidden') return <Alert type="info" showIcon title="当前账号只能查看待审核负责人。下一步：管理员在「设置 → 用户」确认在职负责人后，在这里指定。" />;
  if (input.state.kind === 'error') return <ReadError message="负责人选择列表没有读出来，暂不能指定。" onRetry={input.onRetry} />;
  return null;
}

function ReadError(input: { readonly message: string; readonly onRetry: () => void }): ReactNode {
  return (
    <Space orientation="vertical" size={space[2]} style={{ width: '100%' }}>
      <Alert type="error" showIcon title={input.message} />
      <Button onClick={input.onRetry}>重试</Button>
    </Space>
  );
}

function resolverMode(state: ResolversState): 'resolve' | 'readonly' | 'loading' {
  if (state.kind === 'ready') return 'resolve';
  if (state.kind === 'loading') return 'loading';
  return 'readonly';
}

export function coverageStats(coverage: OwnerCoverage): readonly { readonly key: string; readonly label: string; readonly value: number }[] {
  return [
    { key: 'total', label: '订单行总数', value: coverage.total },
    { key: 'assigned', label: '已归属', value: coverage.assigned },
    { key: 'unassigned', label: '未归属', value: coverage.unassigned },
    { key: 'pending', label: '待审核', value: coverage.pending },
  ];
}

export function ownerSourceLabel(source: OwnerAssignmentSource): string {
  if (source === 'po_master') return '采购单导入';
  if (source === 'mapping_import') return '映射导入';
  return '手工指定';
}

function sourceTagStyle(source: OwnerAssignmentSource): { readonly color: string; readonly background: string; readonly borderColor: string } {
  const tone = source === 'po_master' ? statusColor.info : source === 'mapping_import' ? statusColor.attention : statusColor.success;
  return { color: tone.text, background: tone.bg, borderColor: tone.border };
}

export async function loadOwnerCoverage(setState: (state: CoverageState) => void): Promise<void> {
  try {
    setState({ kind: 'ready', value: await apiGet('/api/v1/owners/coverage', OwnerCoverageSchema) });
  } catch (error) {
    setState(isForbidden(error) ? { kind: 'forbidden' } : { kind: 'error', message: '负责人覆盖统计没有读出来。' });
  }
}

export async function loadPendingOwners(setState: (state: LoadState<readonly PendingOwnerView[]>) => void): Promise<void> {
  try {
    const listed = await apiGet('/api/v1/owners/pending', PendingOwnerListSchema);
    setState({ kind: 'ready', value: listed.items });
  } catch {
    setState({ kind: 'error', message: '待审核负责人没有读出来。' });
  }
}

export async function loadResolvers(setState: (state: ResolversState) => void): Promise<void> {
  try {
    const users = await apiGet('/api/v1/users', asArray(UserViewSchema));
    setState({ kind: 'ready', users: users.filter((user) => user.active && can(user, 'lines.write')) });
  } catch (error) {
    setState(isForbidden(error) ? { kind: 'forbidden' } : { kind: 'error' });
  }
}

export async function resolveOwnerMapping(input: {
  readonly nameRaw: string;
  readonly owner: UserView;
  readonly onUpdated: (updated: number) => void;
}): Promise<void> {
  const result = await apiSend({
    path: '/api/v1/owners/resolve-pending',
    method: 'POST',
    body: { ownerNameRaw: input.nameRaw, ownerUserId: input.owner.id },
    schema: OwnerUpdatedSchema,
  });
  input.onUpdated(result.updated);
}
