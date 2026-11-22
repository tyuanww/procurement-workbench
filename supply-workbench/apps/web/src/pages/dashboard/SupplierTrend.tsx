import { Alert, Button, Drawer, Flex, Select, Skeleton, Table, Typography } from 'antd';
import { addDays, LOW_SAMPLE_THRESHOLD, parseLocalDate, type LocalDate } from '@sw/domain';
import { useEffect, useState } from 'react';
import type { DashboardLoad, DashboardQuery } from '../../features/performance/index.js';
import { fetchSupplierWeek } from '../../shared/api/catalog.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { Sparkline } from '../../shared/ui/analytics.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';

type Supplier = DashboardLoad['suppliers'][number];
type Week = Supplier['weekly'][number];
type Lane = DashboardQuery['lane'];
type BatchResult = NonNullable<Awaited<ReturnType<typeof fetchSupplierWeek>>['detail']>[number];
type Detail = { readonly kind: 'loading' } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'ready'; readonly rows: readonly BatchResult[] };

export function SupplierTrend({ suppliers, lane }: { readonly suppliers: readonly Supplier[]; readonly lane: Lane }) {
  const [partyId, setPartyId] = useState<string>();
  const [weekStart, setWeekStart] = useState<LocalDate>();
  const supplier = suppliers.find((item) => item.partyId === partyId) ?? suppliers[0];
  if (supplier === undefined) return null;
  return <SectionGroup title="近 8 周准时率">
    <Flex align="center" wrap gap={space[2]}>
      <Select aria-label="趋势供应商" value={supplier.partyId} options={suppliers.map((item) => ({ value: item.partyId, label: item.displayName ?? item.partyId }))}
        onChange={(id) => { setPartyId(id); setWeekStart(undefined); }} style={{ minWidth: 140, maxWidth: '100%' }} />
      <Typography.Text type="secondary">按首次确认日归周 · 纵轴 0% 至 100%</Typography.Text>
    </Flex>
    <Sparkline ariaLabel="供应商逐周准时率折线" values={supplier.weekly.map(plotRate)} labels={supplier.weekly.map(weekCaption)} />
    <Flex wrap gap={space[1]} aria-label="周准时率和明细">
      {supplier.weekly.map((week) => (
        <Button key={week.weekStart} disabled={week.n === 0} onClick={() => {
          const parsed = parseLocalDate(week.weekStart);
          if (parsed.ok) setWeekStart(parsed.value);
        }}>{weekCaption(week)}</Button>
      ))}
    </Flex>
    {weekStart === undefined ? null : <WeekResults key={JSON.stringify([supplier.partyId, lane, weekStart])}
      supplier={supplier} lane={lane} week={weekStart} onClose={() => setWeekStart(undefined)} />}
  </SectionGroup>;
}

function plotRate(week: Week): number | null {
  return week.n < LOW_SAMPLE_THRESHOLD ? null : week.rate;
}

function weekCaption(week: Week): string {
  const label = week.weekStart.slice(5);
  if (week.rate === null || week.n === 0) return `${label} · 无样本`;
  const ratio = `${Math.round(week.rate * week.n)}/${week.n} 批`;
  const rate = plotRate(week) === null ? '样本少' : `${Math.round(week.rate * 100)}%`;
  return `${label} · ${rate} · ${ratio}`;
}

function WeekResults({ supplier, lane, week, onClose }: { readonly supplier: Supplier; readonly lane: Lane; readonly week: LocalDate; readonly onClose: () => void }) {
  const [detail, setDetail] = useState<Detail>({ kind: 'loading' });
  const partyId = supplier.partyId;
  const end = addDays(week, 6);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ from: week, to: end, partyId });
    if (lane !== 'all') params.set('lane', lane);
    fetchSupplierWeek(params, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setDetail(value.detail === undefined
          ? { kind: 'error', message: '没有可用的周批次明细。' }
          : { kind: 'ready', rows: value.detail });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = readFailureOf(error);
        setDetail({ kind: 'error', message: failure === null ? '请检查连接后重试。' : failureText(failure) });
      },
    );
    return () => controller.abort();
  }, [partyId, week, end, lane]);
  return <Drawer open title={`${supplier.displayName ?? partyId} · ${week} 至 ${end}`} onClose={onClose} size="large">
    <WeekTable detail={detail} />
  </Drawer>;
}

function WeekTable({ detail }: { readonly detail: Detail }) {
  if (detail.kind === 'loading') return <Skeleton active />;
  if (detail.kind === 'error') return <Alert type="error" showIcon title={detail.message} />;
  return <Table<BatchResult> size="small" rowKey="batchId" dataSource={detail.rows} scroll={{ x: 'max-content' }} columns={[
    { title: '采购单', render: (_, row) => row.orderLineId === null ? row.poRaw ?? '—'
      : <a href={`/lines/${encodeURIComponent(row.orderLineId)}?focusBatch=${encodeURIComponent(row.batchId)}`}>{row.poRaw ?? '打开订单'}</a> },
    { title: '品名', dataIndex: 'nameRaw', render: (name: string | null) => name ?? '—' },
    { title: '首次确认日', dataIndex: 'firstConfirmedDate', render: (date: string | null) => date ?? '—' },
    { title: '最后实收日', dataIndex: 'lastReceivedOn', render: (date: string | null) => date ?? '—' },
    { title: '结论', dataIndex: 'onTime', render: (onTime: boolean) => onTime ? '准时' : '未按期' },
  ]} />;
}
