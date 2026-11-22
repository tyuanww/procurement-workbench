import type { CSSProperties, ReactNode } from 'react';
import { Alert, Empty, Tag, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  CalendarOutlined,
  CarryOutOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  ContainerOutlined,
  FileOutlined,
  LockOutlined,
  MinusOutlined,
  QuestionCircleOutlined,
  StopOutlined,
  TruckOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { missingText } from './missing.js';
import { sourceHover, sourceLabel, type SourceDetail } from './source.js';
import { STATUS_SPEC, type StatusKey } from './status.js';
import { dateStackLines, type DateKind } from './dates.js';
import { statusColor } from '../../theme/tokens.js';
import type { MissingReason } from '@sw/domain';

export function MissingValue({ reason, raw }: { readonly reason: MissingReason; readonly raw?: string }) {
  const text = missingText(reason, raw);
  return (
    <Tooltip title={text} trigger={['hover', 'focus']}>
      <span className="missing-value" tabIndex={0} role="note" aria-label={`缺值：${text}`}>—</span>
    </Tooltip>
  );
}

export function presentRaw(raw: string | undefined): { readonly raw: string } | Record<string, never> {
  if (raw === undefined) return {};
  return { raw };
}

export function SourceTag({ detail }: { readonly detail: SourceDetail }) {
  return (
    <Tag title={sourceHover(detail)} style={{ textDecoration: detail.unsigned === true ? 'underline dashed' : undefined }}>
      {sourceLabel(detail)}
    </Tag>
  );
}

type StatusIconName = (typeof STATUS_SPEC)[StatusKey]['icon'];

const STATUS_GLYPH: Record<StatusIconName, typeof ClockCircleOutlined> = {
  'clock-alert': ClockCircleOutlined,
  'arrow-down-alert': ArrowDownOutlined,
  calendar: CalendarOutlined,
  'calendar-question': QuestionCircleOutlined,
  truck: TruckOutlined,
  'calendar-check': CarryOutOutlined,
  'box-half': ContainerOutlined,
  check: CheckOutlined,
  file: FileOutlined,
  'triangle-alert': WarningOutlined,
  lock: LockOutlined,
  'slash-circle': StopOutlined,
  question: QuestionCircleOutlined,
  user: UserOutlined,
  dashed: MinusOutlined,
  container: ContainerOutlined,
};

function statusGlyph({ icon }: { readonly icon: StatusIconName }): typeof ClockCircleOutlined {
  const Glyph = STATUS_GLYPH[icon];
  if (Glyph === undefined) throw new Error(icon);
  return Glyph;
}

export function StatusTag({ status, label }: { readonly status: StatusKey; readonly label?: string }) {
  const spec = STATUS_SPEC[status];
  const color = statusColor[spec.tone];
  const Glyph = statusGlyph({ icon: spec.icon });
  return (
    <Tag style={{ color: color.text, background: spec.fill === 'solid' ? color.bg : 'transparent', borderColor: spec.fill === 'solid' ? color.border : color.text, textDecoration: spec.strike ? 'line-through' : undefined }}>
      <Glyph aria-hidden /> {label ?? spec.label}
    </Tag>
  );
}

export function DateStack({ dates }: { readonly dates: Partial<Record<DateKind, { readonly text: string; readonly source?: string; readonly overdue?: boolean }>> }) {
  const lines = dateStackLines(dates);
  return (
    <div>
      {lines.map((line, index) => (
        <div key={line.kind} style={{ fontWeight: index === 0 ? 600 : 400 }}>
          {line.label} {line.text}{line.source === undefined ? '' : ` · ${line.source}`}{line.overdue === true ? ' 逾期' : ''}
        </div>
      ))}
    </div>
  );
}

export function QtyCell({ value, unit, diff }: { readonly value: number | null; readonly unit: 'piece' | 'wan'; readonly diff?: string }) {
  if (value === null) return <MissingValue reason="not_provided" />;
  const shown = unit === 'wan' ? value / 10000 : value;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{shown.toLocaleString('zh-CN')}{diff === undefined ? '' : ` ${diff}`}</span>;
}

export function PartyName({ name, raw, pending }: { readonly name: string | null; readonly raw: string; readonly pending: boolean }) {
  if (pending) return <span style={{ textDecoration: 'underline dashed' }}>{raw} 待审核</span>;
  return <span>{name ?? raw}</span>;
}

export function CodeChip({ kind, code, pending }: { readonly kind: string; readonly code: string; readonly pending: boolean }) {
  return <span style={{ borderStyle: pending ? 'dashed' : 'solid', borderWidth: 1 }}>{kind} {code}</span>;
}

export function EmptyState({ text, action }: { readonly text: string; readonly action?: ReactNode }) {
  return <Empty description={text}>{action}</Empty>;
}

export function UndoToast({ text, seconds }: { readonly text: string; readonly seconds: number }) {
  return <Alert type="info" showIcon title={`${text} · 撤销（${seconds}）`} />;
}

export function pageStyle(background: string): CSSProperties {
  return { background, minHeight: '100vh' };
}
