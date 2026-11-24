import { Alert, Button, Tag, Typography } from 'antd';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { BottleneckSummarySchema, type BottleneckSummary, type StuckCauseCounts } from '@sw/contracts';
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
  readonly from: string;
  readonly to: string;
  readonly cause: BottleneckCause | null;
  readonly onSearch: (patch: DashboardPatch) => void;
}): ReactNode {
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      <div role="group" aria-label="当前卡点清单" style={groupStyle}>
        <Typography.Text strong>当前卡点清单</Typography.Text>
        <Typography.Text type="secondary">按当前阶段、停留天数和逾期筛选的全部批次统计</Typography.Text>
        {BOTTLENECK_CAUSES.map((cause) => (
          <Tag.CheckableTag
            key={cause}
            checked={props.cause === cause}
            onChange={() => props.onSearch({ cause: props.cause === cause ? null : cause })}
          >
            {CAUSE_LABEL[cause]} {formatQuantity(props.counts[cause])}
          </Tag.CheckableTag>
        ))}
        {props.cause === null ? null : <Button type="link" onClick={() => props.onSearch({ cause: null })}>清除原因</Button>}
      </div>
      <SourceLinks key={`${props.from}:${props.to}`} from={props.from} to={props.to} />
    </div>
  );
}

function SourceLinks({ from, to }: { readonly from: string; readonly to: string }): ReactNode {
  const canOpenMaster = useCan('master.review');
  const [state, setState] = useState<SourceState>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ from, to });
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
  }, [from, to, revision]);
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
        {state.kind === 'ready' ? <SourceCategories categories={state.categories} canOpenMaster={canOpenMaster} /> : null}
      </div>
      {state.kind === 'error' ? <Alert type="error" showIcon title="来源汇总没有读出来" description={state.message}
        action={<Button size="small" onClick={retry}>重试来源汇总</Button>} /> : null}
    </div>
  );
}

function SourceCategories({ categories, canOpenMaster }: {
  readonly categories: BottleneckSummary['categories']; readonly canOpenMaster: boolean;
}): ReactNode {
  const hasMasterSources = categories.some((category) => isMasterHref(category.href));
  return <>
    {categories.map((category) => {
      const label = `${category.label} ${formatQuantity(category.count)}`;
      return !canOpenMaster && isMasterHref(category.href)
        ? <span key={category.key}>{label}</span>
        : <Link key={category.key} to={category.href}>{label}</Link>;
    })}
    {!canOpenMaster && hasMasterSources ? <Typography.Text type="secondary">主数据项由审核人或管理员办理</Typography.Text> : null}
  </>;
}

function isMasterHref(href: string): boolean {
  return href.split(/[?#]/, 1)[0] === '/master';
}
