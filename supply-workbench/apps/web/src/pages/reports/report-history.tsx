import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Button, Card, Empty, Flex, Select, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { useState } from 'react';
import type { WeeklyReportListItem } from '@sw/contracts';
import { SectionGroup } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';

const VERSION_OPTIONS = [
  { label: '全部版本', value: 'all' },
  { label: '当前版本', value: 'current' },
  { label: '历史版本', value: 'history' },
] as const;
type ReportVersion = typeof VERSION_OPTIONS[number]['value'];

export function ReportHistory({ items, onFocusWeek }: { readonly items: readonly WeeklyReportListItem[]; readonly onFocusWeek?: () => void }) {
  const [week, setWeek] = useState<string | null>(null);
  const [version, setVersion] = useState<ReportVersion>('all');
  if (items.length === 0) return <SectionGroup title="已生成周报" action={<ProcurementCutoff />}>
    <Empty description={onFocusWeek === undefined ? '还没有周报。' : '还没有周报。下一步：填写周一后生成。'}>
      {onFocusWeek === undefined ? null : <Button onClick={onFocusWeek}>去填周一</Button>}
    </Empty>
  </SectionGroup>;
  const weeks = [...new Map(items.map((item) => [item.weekStart, item.weekEnd])).entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([value, end]) => ({ value, label: `${value} 至 ${end}` }));
  const filtered = items.filter((item) => (week === null || week === item.weekStart)
    && (version === 'all' || (item.supersededBy === null) === (version === 'current')));
  return <SectionGroup title="已生成周报" meta={`${filtered.length} 份`}>
    <Flex vertical gap={space[2]}>
      <Card size="small">
        <Flex wrap align="center" gap={space[2]}>
          <Select<string> aria-label="报告周" allowClear placeholder="全部报告周" value={week} options={weeks}
            onChange={(value) => setWeek(value ?? null)} style={{ minWidth: 194, maxWidth: '100%' }} />
          <Select<ReportVersion> aria-label="周报版本" value={version} options={[...VERSION_OPTIONS]} onChange={setVersion} style={{ minWidth: 112 }} />
          <ProcurementCutoff />
        </Flex>
      </Card>
      <Table<WeeklyReportListItem> key={JSON.stringify([week, version])} rowKey="id" size="small" dataSource={filtered}
        scroll={{ x: 'max-content' }} pagination={{ defaultPageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所选报告周和版本没有匹配的周报" /> }}
        columns={historyColumns}
      />
    </Flex>
  </SectionGroup>;
}

const historyColumns: TableColumnsType<WeeklyReportListItem> = [
  { title: '报告周', rowScope: 'row', render: (_, item) => <Flex vertical>
    <Typography.Text strong id={`report-week-${item.id}`}>{item.weekStart} 至 {item.weekEnd}</Typography.Text>
    <Typography.Text type="secondary">全店</Typography.Text>
  </Flex> },
  { title: '生成时间', dataIndex: 'generatedAt', sorter: (left, right) => left.generatedAt.localeCompare(right.generatedAt),
    render: (value: string) => new Date(value).toLocaleString('zh-CN') },
  { title: '版本', render: (_, item) => item.supersededBy === null ? <Tag color="success">当前版本</Tag> : <Tag>历史版本</Tag> },
  { title: '操作', render: (_, item) => <Flex gap={space[1]} wrap>
    <Button href={`/reports/${encodeURIComponent(item.id)}`} aria-describedby={`report-week-${item.id}`}>打开</Button>
    <Button href={`/reports/${encodeURIComponent(item.id)}/print`} aria-describedby={`report-week-${item.id}`}>打印</Button>
  </Flex> },
];
