import { Alert, Button, Flex, Select, Typography } from 'antd';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { BottleneckSummarySchema, type BottleneckSummary, type StuckCauseCounts, type StuckDashboard } from '@sw/contracts';
import { BOTTLENECK_CAUSES, type BottleneckCause, type DashboardPatch } from '../../features/performance/index.js';
import { useCan } from '../../shared/actor.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { space } from '../../theme/tokens.js';

const groupStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[1] };
const BOTTLENECK_SUMMARY_PATH = '/api/v1/dashboard/bottlenecks';

type SourceState =
  | { readonly kind: 'loading' | 'empty' }
  | { readonly kind: 'ready'; readonly categories: BottleneckSummary['categories'] }
  | { readonly kind: 'error'; readonly message: string };

export const CAUSE_LABEL: Record<BottleneckCause, string> = {
  missing_owner: '缺负责人',
  missing_factory: '缺工厂关联',
  supplier_pending: '供应商别名待审',
  bom_missing: '产品缺 BOM',
  factory_demand_unlinked: '工厂出货未关联',
  missing_date: '缺确认日期',
  exception_open: '异常未关闭',
  aged_15: '停留 15 天以上',
};

export function CauseFilter(props: {
  readonly counts: StuckCauseCounts;
  readonly cause: BottleneckCause | null;
  readonly onSearch: (patch: DashboardPatch) => void;
}): ReactNode {
  const options = [
    { value: '', label: '全部原因' },
    ...BOTTLENECK_CAUSES.map((cause) => ({ value: cause, label: `${CAUSE_LABEL[cause]} ${formatQuantity(props.counts[cause])}` })),
  ];
  return (
    <Flex vertical align="start" gap={space[1]} role="group" aria-label="当前卡点清单">
      <Select<BottleneckCause | ''> aria-label="卡点原因" value={props.cause ?? ''} virtual={false}
        options={options} style={{ minWidth: 168 }} onChange={(cause) => props.onSearch({ cause: cause === '' ? null : cause })} />
      <Typography.Text type="secondary">按当前阶段、停留天数和逾期筛选的全部批次统计</Typography.Text>
    </Flex>
  );
}

export function SourceLinks({ asOf }: { readonly asOf: StuckDashboard['asOf'] }): ReactNode {
  const [state, setState] = useState<SourceState>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ from: asOf, to: asOf });
    void apiGetWithSignal({
      path: `${BOTTLENECK_SUMMARY_PATH}?${params}`, schema: BottleneckSummarySchema, signal: controller.signal,
    }).then(
      ({ categories }) => {
        if (controller.signal.aborted) return;
        setState(categories.length === 0 ? { kind: 'empty' } : { kind: 'ready', categories });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = readFailureOf(error);
        setState({ kind: 'error', message: failure === null ? '请重试。' : failureText(failure) });
      },
    );
    return () => controller.abort();
  }, [asOf, revision]);
  const retry = () => {
    setState({ kind: 'loading' });
    setRevision((value) => value + 1);
  };
  return (
    <div role="group" aria-label="来源汇总" aria-busy={state.kind === 'loading'} style={{ display: 'grid', gap: space[1] }}>
      <div style={{ ...groupStyle, gap: space[2] }}>
        <Typography.Text strong>来源汇总</Typography.Text>
        <Typography.Text type="secondary">按各来源当前数据统计</Typography.Text>
        {state.kind === 'loading' ? <Typography.Text type="secondary">正在读取来源汇总…</Typography.Text> : null}
        {state.kind === 'empty' ? <Typography.Text type="secondary">暂无来源数据</Typography.Text> : null}
        {state.kind === 'ready' ? <SourceCategories categories={state.categories} /> : null}
      </div>
      {state.kind === 'error' ? <Alert type="error" showIcon title="来源汇总没有读出来" description={state.message}
        action={<Button size="small" onClick={retry}>重试来源汇总</Button>} /> : null}
    </div>
  );
}

function SourceCategories({ categories }: { readonly categories: BottleneckSummary['categories'] }): ReactNode {
  const canOpenMaster = useCan('master.read');
  const canOpenData = useCan('data.read');
  const canOpenProducts = useCan('products.read');
  const accessible = {
    '/master': canOpenMaster, '/lines': canOpenData, '/progress': canOpenData, '/products': canOpenProducts,
  };
  const hasMasterSources = categories.some((category) => isMasterHref(category.href));
  return <>
    {categories.map((category) => {
      const label = `${category.label} ${formatQuantity(category.count)}`;
      const href = category.href.split(/[?#]/, 1)[0];
      const isAccessible = Object.entries(accessible).some(([path, isAllowed]) => path === href && isAllowed);
      return isAccessible ? <Link key={category.key} to={category.href}>{label}</Link> : <span key={category.key}>{label}</span>;
    })}
    {!canOpenMaster && hasMasterSources ? <Typography.Text type="secondary">主数据项由审核人或管理员办理</Typography.Text> : null}
  </>;
}

function isMasterHref(href: string): boolean {
  return href.split(/[?#]/, 1)[0] === '/master';
}
