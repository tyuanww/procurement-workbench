export type SourceKind = 'po-master' | 'factory' | 'manual' | 'system';

export type SourceDetail = {
  readonly kind: SourceKind;
  readonly factoryName?: string;
  readonly batchId?: string;
  readonly sheet?: string;
  readonly rowNo?: number;
  readonly at?: string;
  readonly unsigned?: boolean;
};

const LABEL: Record<SourceKind, string> = {
  'po-master': '总表',
  factory: '上报',
  manual: '手工',
  system: '系统',
};

export function sourceLabel(detail: SourceDetail): string {
  if (detail.kind === 'factory' && detail.factoryName !== undefined) return `${detail.factoryName}上报`;
  return LABEL[detail.kind];
}

export function sourceHover(detail: SourceDetail): string {
  const parts = [detail.batchId, detail.sheet, detail.rowNo === undefined ? undefined : String(detail.rowNo), detail.at].filter((part) => part !== undefined);
  return parts.join(' · ');
}
