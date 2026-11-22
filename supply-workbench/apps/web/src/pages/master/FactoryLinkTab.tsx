import { Alert, Button, Card, Empty, Flex, Popconfirm, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import {
  FactoryLinkCountsSchema,
  RelinkFactoryRowsResultSchema,
  RelinkScheduleCellsResultSchema,
  SupplierBackfillResultSchema,
  UnmatchedFactoryRowListSchema,
  type FactoryLinkCounts,
  type RelinkFactoryRowsResult,
  type RelinkScheduleCellsResult,
  type UnmatchedFactoryRowView,
} from '@sw/contracts';
import { apiErrorMessage, apiGet, apiSend } from '../../shared/api/client.js';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { space, statusColor } from '../../theme/tokens.js';
import type { LoadState } from './OwnerMapTab.js';
import type { TabNotice } from './notice.js';

const UNMATCHED_LIMIT = 200;

type Action = 'relink' | 'schedule' | 'backfill' | null;

export function FactoryLinkTab(): ReactNode {
  const [counts, setCounts] = useState<LoadState<FactoryLinkCounts>>({ kind: 'loading' });
  const [unmatched, setUnmatched] = useState<LoadState<readonly UnmatchedFactoryRowView[]>>({ kind: 'loading' });
  const [action, setAction] = useState<Action>(null);
  const [notice, setNotice] = useState<TabNotice | null>(null);
  const reload = () => { void loadFactoryLinkCounts(setCounts); void loadUnmatchedFactoryRows(setUnmatched); };
  useEffect(() => { reload(); }, []);
  const relink = () => {
    setAction('relink');
    setNotice(null);
    void relinkFactoryRows({ onResult: (result) => {
      setNotice({ kind: 'success', text: relinkResultText(result) });
      reload();
    } }).catch((error: unknown) => {
      setNotice({ kind: 'error', text: apiErrorMessage(error) ?? '重跑工厂关联没有完成，请稍后重试。' });
    }).finally(() => setAction(null));
  };
  const backfill = () => {
    setAction('backfill');
    setNotice(null);
    void backfillSupplierParties({ onResult: (updated) => {
      setNotice({ kind: 'success', text: backfillResultText(updated) });
      reload();
    } }).catch((error: unknown) => {
      setNotice({ kind: 'error', text: apiErrorMessage(error) ?? '供应商回填没有完成，请稍后重试。' });
    }).finally(() => setAction(null));
  };
  return (
    <Space orientation="vertical" size={space[4]} style={{ width: '100%' }}>
      {notice === null ? null : <Alert type={notice.kind} showIcon title={notice.text} />}
      <FactoryLinkCountsSection state={counts} onRetry={reload} />
      <FactoryLinkActions action={action} onRelink={relink} onSchedule={() => { void runSchedule({ setAction, setNotice, reload }); }} onBackfill={backfill} />
      <UnmatchedFactoryRows state={unmatched} onRetry={reload} />
    </Space>
  );
}

export function FactoryLinkCountsSection(input: { readonly state: LoadState<FactoryLinkCounts>; readonly onRetry: () => void }): ReactNode {
  if (input.state.kind === 'loading') return <Skeleton active paragraph={{ rows: 2 }} />;
  if (input.state.kind === 'error') return <ReadError message={input.state.message} onRetry={input.onRetry} />;
  return <FactoryLinkCountsCards counts={input.state.value} />;
}

export function FactoryLinkCountsCards({ counts }: { readonly counts: FactoryLinkCounts }): ReactNode {
  return (
    <SectionGroup title="工厂关联概览" meta="订单行当前关联状态">
      <Flex wrap gap={space[3]}>
        {linkCountStats(counts).map((item) => (
          <Card key={item.key} size="small" style={{ flex: '1 1 140px', minWidth: 140 }}>
            <Statistic title={item.label} value={item.value} />
          </Card>
        ))}
      </Flex>
      <Typography.Paragraph type="secondary" style={{ marginTop: space[2], marginBottom: 0 }}>
        来源：line_factory_links 与工厂进度行的当前关联；未建关联的订单行计入未关联，接口不返回假 0。
      </Typography.Paragraph>
    </SectionGroup>
  );
}

export function FactoryLinkActions(input: {
  readonly action: Action;
  readonly onRelink: () => void;
  readonly onSchedule: () => void;
  readonly onBackfill: () => void;
}): ReactNode {
  const isBusy = input.action !== null;
  return (
    <SectionGroup title="工厂关联操作" meta="写入前先确认">
      <Space wrap>
        <Popconfirm
          title="确认重跑工厂关联？"
          description="会按 PO、品号、条码重新计算工厂行与订单行的关联，手工关联保持不变；可重复执行。"
          okText="确认重跑"
          cancelText="取消"
          disabled={isBusy}
          onConfirm={input.onRelink}
        >
          <Button type="primary" loading={input.action === 'relink'} disabled={isBusy}>重跑工厂关联</Button>
        </Popconfirm>
        <ScheduleRelinkButton isBusy={isBusy} isLoading={input.action === 'schedule'} onSchedule={input.onSchedule} />
        <Popconfirm
          title="确认回填供应商主体？"
          description="只给供应商主体为空的采购单补值，来源是已审批的供应商别名；不覆盖已有主体，可重复执行。"
          okText="确认回填"
          cancelText="取消"
          disabled={isBusy}
          onConfirm={input.onBackfill}
        >
          <Button loading={input.action === 'backfill'} disabled={isBusy}>回填供应商主体</Button>
        </Popconfirm>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: space[2], marginBottom: 0 }}>
        两项操作都会写审计。重跑完成后刷新概览和未匹配列表；回填只改采购单供应商主体。
      </Typography.Paragraph>
    </SectionGroup>
  );
}

export function UnmatchedFactoryRows(input: {
  readonly state: LoadState<readonly UnmatchedFactoryRowView[]>;
  readonly onRetry: () => void;
}): ReactNode {
  if (input.state.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (input.state.kind === 'error') return <ReadError message={input.state.message} onRetry={input.onRetry} />;
  const rows = input.state.value;
  return (
    <SectionGroup title="未匹配工厂行" meta={`${rows.length} 条（最多 ${UNMATCHED_LIMIT}）`}>
      {rows.length === 0
        ? <Empty description="没有未匹配工厂行。下一步：导入工厂进度文件，或先跑一次工厂关联。" />
        : <div>{rows.map((row) => <UnmatchedFactoryRow key={row.rowId} row={row} />)}</div>}
    </SectionGroup>
  );
}

function UnmatchedFactoryRow({ row }: { readonly row: UnmatchedFactoryRowView }): ReactNode {
  return (
    <SectionRow action={<Tag style={{ color: statusColor.warning.text, background: statusColor.warning.bg, borderColor: statusColor.warning.border }}>{row.suggestedAction}</Tag>}>
      <Space orientation="vertical" size={4}>
        <Space wrap>
          <Tag>{factoryKindLabel(row.kind)}</Tag>
          <Typography.Text>单号 {row.poRaw ?? '—'} · 品号 {row.itemCodeRaw ?? '—'} · 条码 {row.barcodeRaw ?? '—'}</Typography.Text>
        </Space>
        <Typography.Text type="secondary">原因：{unmatchedReasonLabel(row.reason)} · 工厂行 {row.rowId}</Typography.Text>
      </Space>
    </SectionRow>
  );
}

function ReadError(input: { readonly message: string; readonly onRetry: () => void }): ReactNode {
  return (
    <Space orientation="vertical" size={space[2]} style={{ width: '100%' }}>
      <Alert type="error" showIcon title={input.message} />
      <Button onClick={input.onRetry}>重试</Button>
    </Space>
  );
}

export function linkCountStats(counts: FactoryLinkCounts): readonly { readonly key: string; readonly label: string; readonly value: number }[] {
  return [
    { key: 'linked', label: '已关联', value: counts.linked },
    { key: 'manual', label: '手工关联', value: counts.manual },
    { key: 'unlinked', label: '未关联', value: counts.unlinked },
  ];
}

export function unmatchedReasonLabel(reason: string): string {
  if (reason === 'NO_CANDIDATE_LINE') return '没有候选订单行';
  if (reason === 'FACTORY_LINK_CONFLICT') return '匹配到多个订单行';
  if (reason === 'LINE_LINK_IS_MANUAL') return '订单行是手工工厂关联';
  if (reason === 'NO_FACTORY_ROW_MATCH') return '没有匹配到工厂行';
  return reason;
}

export function factoryKindLabel(kind: string): string {
  if (kind === 'shipment') return '成品出货';
  if (kind === 'in_transit') return '在途订单';
  if (kind === 'stock') return '库存汇总';
  if (kind === 'schedule') return '排产计划';
  if (kind === 'packaging_combo') return '包材组合';
  if (kind === 'customer_supplied') return '客供原料';
  if (kind === 'demand') return '物料需求';
  return kind;
}

function ScheduleRelinkButton(input: { readonly isBusy: boolean; readonly isLoading: boolean; readonly onSchedule: () => void }): ReactNode {
  return (
    <Popconfirm
      title="确认重跑排产关联？"
      description="只重算活动快照里的排产格。已关联的格子不改订单行；对不上时仍关联并标待复核。手工关联保持不变。"
      okText="确认重跑"
      cancelText="取消"
      disabled={input.isBusy}
      onConfirm={input.onSchedule}
    >
      <Button loading={input.isLoading} disabled={input.isBusy}>重跑排产关联</Button>
    </Popconfirm>
  );
}

export function scheduleRelinkText(result: RelinkScheduleCellsResult): string {
  return `已重跑排产关联：排产格 ${result.scheduleCells} 条，已关联 ${result.linked}，未关联 ${result.unlinked}，歧义 ${result.ambiguous}，手工 ${result.manual}，仍关联但待复核 ${result.review}。`;
}

export function relinkResultText(result: RelinkFactoryRowsResult): string {
  return `已重跑工厂关联：工厂行 ${result.factoryRows} 条，已关联 ${result.factoryLinked}，手工 ${result.factoryManual}，未关联 ${result.factoryUnlinked}，冲突 ${result.conflicts}；订单行已关联 ${result.linesLinked} 条。`;
}

export function backfillResultText(updated: number): string {
  return `已回填 ${updated} 条采购单的供应商主体（只补空值，可重复执行）。`;
}

export async function loadFactoryLinkCounts(setState: (state: LoadState<FactoryLinkCounts>) => void): Promise<void> {
  try {
    setState({ kind: 'ready', value: await apiGet('/api/v1/factory-links/counts', FactoryLinkCountsSchema) });
  } catch {
    setState({ kind: 'error', message: '工厂关联概览没有读出来。' });
  }
}

export async function loadUnmatchedFactoryRows(setState: (state: LoadState<readonly UnmatchedFactoryRowView[]>) => void): Promise<void> {
  try {
    const listed = await apiGet(`/api/v1/factory-links/unmatched?limit=${UNMATCHED_LIMIT}`, UnmatchedFactoryRowListSchema);
    setState({ kind: 'ready', value: listed.items });
  } catch {
    setState({ kind: 'error', message: '未匹配工厂行没有读出来。' });
  }
}

async function runSchedule(input: { readonly setAction: (action: Action) => void; readonly setNotice: (notice: TabNotice | null) => void; readonly reload: () => void }): Promise<void> {
  input.setAction('schedule');
  input.setNotice(null);
  try {
    const result = await apiSend({ path: '/api/v1/factory-links/relink-schedule', method: 'POST', body: {}, schema: RelinkScheduleCellsResultSchema });
    input.setNotice({ kind: 'success', text: scheduleRelinkText(result) });
    input.reload();
  } catch (error: unknown) {
    input.setNotice({ kind: 'error', text: apiErrorMessage(error) ?? '重跑排产关联没有完成，请稍后重试。' });
  } finally {
    input.setAction(null);
  }
}

export async function relinkFactoryRows(input: { readonly onResult: (result: RelinkFactoryRowsResult) => void }): Promise<void> {
  const result = await apiSend({ path: '/api/v1/factory-links/relink', method: 'POST', body: {}, schema: RelinkFactoryRowsResultSchema });
  input.onResult(result);
}

export async function backfillSupplierParties(input: { readonly onResult: (updated: number) => void }): Promise<void> {
  const result = await apiSend({ path: '/api/v1/factory-links/backfill-suppliers', method: 'POST', body: {}, schema: SupplierBackfillResultSchema });
  input.onResult(result.updated);
}
