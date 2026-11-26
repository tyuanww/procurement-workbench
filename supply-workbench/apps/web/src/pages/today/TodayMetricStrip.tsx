import { RightOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row } from 'antd';
import { TodayHighlight } from '../../features/today/index.js';
import type { MetricItem } from '../../shared/ui/analytics.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { space, statusColor } from '../../theme/tokens.js';

export function TodayMetricStrip({ items, label }: { readonly items: readonly MetricItem[]; readonly label: string }) {
  return <Row gutter={[space[1], space[2]]} role="group" aria-label={label}>
    {items.map((item) => <Col key={item.key} className="today-metric-column"><TodayMetricCard item={item} /></Col>)}
  </Row>;
}

function TodayMetricCard({ item }: { readonly item: MetricItem }) {
  const { action, tone } = item;
  const accent = tone === undefined || tone === 'neutral' || item.value === 0 ? undefined : statusColor[tone].border;
  const content = <span className="today-metric-content">
    <span className="today-metric-label">{item.label}{action === undefined ? null : <RightOutlined aria-hidden />}</span>
    <strong className="today-metric-value">{typeof item.value === 'number' ? formatQuantity(item.value) : item.value}<span>{item.unit}</span></strong>
  </span>;
  return <Card size="small" className="today-metric-card" data-current={action?.isActive} styles={{ body: { padding: 0 } }}
    style={{ borderBlockStartColor: accent }}>
    {action === undefined ? content : <Button color="default" variant="text" block style={{ border: 0 }} aria-pressed={action.isActive} onClick={action.select}>{content}</Button>}
    <TodayHighlight active={action?.isActive === true} />
  </Card>;
}
