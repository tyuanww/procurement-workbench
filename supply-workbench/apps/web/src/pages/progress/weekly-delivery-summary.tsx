import { CheckOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { WeeklyDeliveryBucket, weeklyDelivery } from './weekly-delivery.js';
import './weekly-delivery.css';

const metrics: readonly WeeklyDeliveryBucket[] = ['expected', 'outstanding', 'nextRisk'];

export function WeeklyDeliverySummary({ delivery: { counts, titles }, bucket, onBucket }: {
  readonly delivery: ReturnType<typeof weeklyDelivery>; readonly bucket: WeeklyDeliveryBucket | null;
  readonly onBucket: (bucket: WeeklyDeliveryBucket | null) => void;
}) {
  return <section className="weekly-delivery-summary" aria-label="周交付概览">
    {metrics.map((key) => <PlanningMetric key={key} title={titles[key]} value={counts[key]} unit="批" isSelected={bucket === key}
      onClick={() => onBucket(bucket === key ? null : key)} />)}
  </section>;
}

export function PlanningMetric({ title, value, unit, isSelected, onClick }: {
  readonly title: string; readonly value: number; readonly unit: string; readonly isSelected: boolean; readonly onClick: () => void;
}) {
  return <Button className="weekly-delivery-card" aria-label={`${title} ${value} ${unit}`} aria-pressed={isSelected} onClick={onClick}>
    <span className="weekly-delivery-label">{title}</span>
    <span className="weekly-delivery-value">{value}<span className="weekly-delivery-unit">{unit}</span></span>
    {isSelected ? <CheckOutlined className="weekly-delivery-selected" aria-hidden="true" /> : null}
  </Button>;
}
