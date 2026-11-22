import { Button, Tag, Typography } from 'antd';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { apiGet } from '../../shared/api/client.js';
import { BottleneckSummarySchema, type BottleneckSummary, type StuckCauseCounts } from '@sw/contracts';
import { BOTTLENECK_CAUSES, type BottleneckCause, type DashboardPatch } from '../../features/performance/index.js';
import { can } from '@sw/domain';
import { useActorRoles } from '../../shared/actor.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { space } from '../../theme/tokens.js';

const groupStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[1] };

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
      <SourceLinks from={props.from} to={props.to} />
    </div>
  );
}

function SourceLinks(props: { readonly from: string; readonly to: string }): ReactNode {
  const canOpenMaster = can({ roles: useActorRoles() }, 'master.review');
  const [categories, setCategories] = useState<BottleneckSummary['categories']>([]);
  useEffect(() => {
    let isActive = true;
    void apiGet(`/api/v1/dashboard/bottlenecks?from=${props.from}&to=${props.to}`, BottleneckSummarySchema)
      .then((value) => { if (isActive) setCategories(value.categories); })
      .catch(() => { if (isActive) setCategories([]); });
    return () => { isActive = false; };
  }, [props.from, props.to]);
  if (categories.length === 0) return null;
  const hasMasterSources = categories.some((category) => isMasterHref(category.href));
  return (
    <div role="group" aria-label="来源汇总" style={{ ...groupStyle, gap: space[2] }}>
      <Typography.Text strong>来源汇总</Typography.Text>
      <Typography.Text type="secondary">按各来源当前数据统计</Typography.Text>
      {categories.map((category) => {
        const label = `${category.label} ${formatQuantity(category.count)}`;
        return !canOpenMaster && isMasterHref(category.href)
          ? <span key={category.key}>{label}</span>
          : <Link key={category.key} to={category.href}>{label}</Link>;
      })}
      {!canOpenMaster && hasMasterSources ? <Typography.Text type="secondary">主数据项由审核人或管理员办理</Typography.Text> : null}
    </div>
  );
}

function isMasterHref(href: string): boolean {
  return href.split(/[?#]/, 1)[0] === '/master';
}
