import { Tag, Typography } from 'antd';
import { importStatusLabel, templateIdLabel, type ImportStatus, type TemplateId } from '@sw/domain';
import { formatDateTime } from '../../shared/ui/format.js';
import { statusColor } from '../../theme/tokens.js';

const importStatusTone = { parsed: 'info', committed: 'success', discarded: 'neutral', failed: 'danger' } satisfies Record<ImportStatus, keyof typeof statusColor>;

export function ImportStatusTag({ status }: { readonly status: ImportStatus }) {
  const tone = statusColor[importStatusTone[status]];
  return <Tag style={{ color: tone.text, background: tone.bg, borderColor: tone.border, marginInlineEnd: 0 }}>{importStatusLabel(status)}</Tag>;
}

export function ImportBatchBanner(props: {
  readonly template: TemplateId;
  readonly createdAt: string;
  readonly committedAt: string | null;
  readonly coverage: 'full_snapshot' | 'partial';
}) {
  const coverageTone = props.coverage === 'partial' ? statusColor.warning : statusColor.info;
  const coverageText = props.template === 'batch-confirmed-arrival-v1' ? '仅更新已填写的确认日' : coverageLabel(props.coverage);
  const committed = props.committedAt === null ? '' : ` · 提交于 ${formatDateTime(props.committedAt) ?? '时间无法识别'}`;
  return (
    <Typography.Paragraph type="secondary">
      {templateIdLabel(props.template)}
      {' · '}
      导入于 {formatDateTime(props.createdAt) ?? '时间无法识别'}
      {committed}
      {' · '}
      <Tag style={{ color: coverageTone.text, background: coverageTone.bg, borderColor: coverageTone.border }}>{coverageText}</Tag>
    </Typography.Paragraph>
  );
}

function coverageLabel(coverage: 'full_snapshot' | 'partial'): string {
  return coverage === 'partial' ? '部分导入，缺失状态未知' : '完整快照';
}
