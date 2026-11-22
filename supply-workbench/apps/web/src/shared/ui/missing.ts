import { MISSING_REASON_LABELS, type MissingReason } from '@sw/domain';

export function missingText(reason: MissingReason, raw?: string): string {
  if (reason === 'unparseable' && raw !== undefined && raw !== '') return `${MISSING_REASON_LABELS.unparseable}：「${raw}」`;
  return MISSING_REASON_LABELS[reason];
}
