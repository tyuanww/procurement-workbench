import { Alert, Button, Card, Empty, Flex, Popconfirm, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import {
  FactoryLinkCountsSchema,
  RelinkFactoryRowsResultSchema,
  RelinkScheduleCellsResultSchema,
  SupplierBackfillResultSchema,
  UnmatchedFactoryRowViewSchema,
  type FactoryLinkCounts,
  type RelinkFactoryRowsResult,
  type RelinkScheduleCellsResult,
  type UnmatchedFactoryRowView,
} from '@sw/contracts';
import { apiErrorMessage, apiGetWithSignal, apiSend } from '../../shared/api/client.js';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { space, statusColor } from '../../theme/tokens.js';
import type { LoadState } from './OwnerMapTab.js';
import { FactoryReadError, FactoryRowsPage, factoryRowsReader } from './FactoryRowsPage.js';
import { UnlinkedRows, type RowAction } from './UnlinkedFactoryRows.js';
import type { TabNotice } from './notice.js';

const base = '/api/v1/factory-links';
const diagnosticReaders = {
  active: factoryRowsReader(`${base}/unmatched?scope=active`, UnmatchedFactoryRowViewSchema),
  historical: factoryRowsReader(`${base}/unmatched?scope=historical`, UnmatchedFactoryRowViewSchema),
};

type Scope = 'actionable' | keyof typeof diagnosticReaders;
type BulkAction = 'relink' | 'schedule' | 'backfill';
type Action = BulkAction | RowAction;

export function factoryLinkScopeOf(value: string | null): Scope {
  return value === 'active' || value === 'historical' ? value : 'actionable';
}

export function FactoryLinkTab({ scope, refreshReviewQueue }: { readonly scope: Scope; readonly refreshReviewQueue: () => Promise<void> }): ReactNode {
  if (scope !== 'actionable') return <UnmatchedFactoryRows key={scope} scope={scope} />;
  return <FactoryLinkQueue refreshReviewQueue={refreshReviewQueue} />;
}

function FactoryLinkQueue({ refreshReviewQueue }: { readonly refreshReviewQueue: () => Promise<void> }): ReactNode {
  const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<TabNotice | null>(null);
  const run = (next: Action, write: () => Promise<string>) => {
    setAction(next);
    setNotice(null);
    void write().then((message) => {
      setNotice({ kind: 'success', text: message });
      setRevision((current) => current + 1);
      void refreshReviewQueue();
    }).catch((error: unknown) => {
      setNotice({ kind: 'error', text: apiErrorMessage(error) ?? '操作没有完成，请稍后重试。' });
    }).finally(() => setAction(null));
  };
  return (
    <Space orientation="vertical" size={space[4]} style={{ width: '100%' }}>
      {notice === null ? null : <Alert type={notice.kind} showIcon title={notice.text} />}
      <UnlinkedRows revision={revision} busy={action !== null} pending={typeof action === 'object' ? action : null} onAction={run} />
      <FactoryLinkSummary key={revision} />
      <FactoryLinkActions action={action} onRelink={() => run('relink', async () => relinkResultText(await relinkFactoryRows()))}
        onSchedule={() => run('schedule', async () => scheduleRelinkText(await relinkSchedule()))}
        onBackfill={() => run('backfill', async () => backfillResultText(await backfillSupplierParties()))} />
    </Space>
  );
}

function FactoryLinkSummary(): ReactNode {
  const [state, setState] = useState<LoadState<FactoryLinkCounts>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadFactoryLinkCounts(setState, controller.signal);
    return () => controller.abort();
  }, [attempt]);
  if (state.kind === 'loading') return <Skeleton active paragraph={{ rows: 2 }} />;
  if (state.kind === 'error') return <FactoryReadError message={state.message} onRetry={() => {
    setState({ kind: 'loading' });
    setAttempt((current) => current + 1);
  }} />;
  return <FactoryLinkCountsCards counts={state.value} />;
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
        未建关联的订单行计入未关联。
      </Typography.Paragraph>
    </SectionGroup>
  );
}

export function FactoryLinkActions(input: {
  readonly action: Action | null;
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
    </SectionGroup>
  );
}

function UnmatchedFactoryRows({ scope }: { readonly scope: keyof typeof diagnosticReaders }): ReactNode {
  const title = scope === 'active' ? '当前关联诊断' : '历史关联诊断';
  return (
    <FactoryRowsPage title={title} read={diagnosticReaders[scope]}>
      {(rows) => rows.length === 0 ? <Empty description={`没有${title}记录。`} /> : <UnmatchedFactoryRowList rows={rows} />}
    </FactoryRowsPage>
  );
}

export function UnmatchedFactoryRowList({ rows }: { readonly rows: readonly UnmatchedFactoryRowView[] }): ReactNode {
  return <div>{rows.map((row) => <UnmatchedFactoryRow key={`${row.kind}:${row.rowId}`} row={row} />)}</div>;
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

export async function loadFactoryLinkCounts(setState: (state: LoadState<FactoryLinkCounts>) => void, signal?: AbortSignal): Promise<void> {
  try {
    const value = await apiGetWithSignal({ path: `${base}/counts`, schema: FactoryLinkCountsSchema, ...(signal === undefined ? {} : { signal }) });
    if (signal?.aborted !== true) setState({ kind: 'ready', value });
  } catch {
    if (signal?.aborted !== true) setState({ kind: 'error', message: '工厂关联概览没有读出来。' });
  }
}

function relinkSchedule(): Promise<RelinkScheduleCellsResult> {
  return apiSend({ path: `${base}/relink-schedule`, method: 'POST', body: {}, schema: RelinkScheduleCellsResultSchema });
}

export function relinkFactoryRows(): Promise<RelinkFactoryRowsResult> {
  return apiSend({ path: `${base}/relink`, method: 'POST', body: {}, schema: RelinkFactoryRowsResultSchema });
}

export async function backfillSupplierParties(): Promise<number> {
  const result = await apiSend({ path: `${base}/backfill-suppliers`, method: 'POST', body: {}, schema: SupplierBackfillResultSchema });
  return result.updated;
}
