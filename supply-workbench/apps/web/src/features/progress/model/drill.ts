import { LINE_STAGES, type LineStage } from '@sw/domain';
import { progressStageLabel, type ProgressRow, type ProgressStay } from './rows.js';

export type ProgressDrill =
  | { readonly kind: 'all' }
  | { readonly kind: 'overdue' }
  | { readonly kind: 'stage'; readonly stage: LineStage }
  | { readonly kind: 'stay'; readonly bucket: ProgressStay };

export const PROGRESS_STAYS = [
  { bucket: '0-3', label: '0-3 天', tone: 'neutral' },
  { bucket: '4-7', label: '4-7 天', tone: 'warning' },
  { bucket: '8-14', label: '8-14 天', tone: 'attention' },
  { bucket: '15+', label: '15+ 天', tone: 'danger' },
] satisfies readonly { readonly bucket: ProgressStay; readonly label: string; readonly tone: 'neutral' | 'warning' | 'attention' | 'danger' }[];

export function readProgressDrill(value: string | null): ProgressDrill {
  if (value === 'overdue') return { kind: 'overdue' };
  const stage = LINE_STAGES.find((item) => value === `stage:${item}`);
  if (stage !== undefined) return { kind: 'stage', stage };
  const stay = PROGRESS_STAYS.find(({ bucket }) => value === `stay:${bucket}`);
  return stay === undefined ? { kind: 'all' } : { kind: 'stay', bucket: stay.bucket };
}

export function progressDrillKey(drill: ProgressDrill): string {
  switch (drill.kind) {
    case 'all': return '';
    case 'overdue': return 'overdue';
    case 'stage': return `stage:${drill.stage}`;
    case 'stay': return `stay:${drill.bucket}`;
  }
}

export function withProgressDrill(params: URLSearchParams, drill: ProgressDrill): URLSearchParams {
  const next = new URLSearchParams(params);
  const key = progressDrillKey(drill);
  if (key === '') next.delete('drill');
  else next.set('drill', key);
  return next;
}

export function matchesProgressDrill(row: ProgressRow, drill: ProgressDrill): boolean {
  switch (drill.kind) {
    case 'all': return true;
    case 'overdue': return row.arrival.kind === 'overdue';
    case 'stage': return row.stage === drill.stage;
    case 'stay': return row.stay === drill.bucket;
  }
}

export function progressDrillLabel(drill: ProgressDrill): string {
  switch (drill.kind) {
    case 'all': return '进行中订单行';
    case 'overdue': return '逾期未到';
    case 'stage': return progressStageLabel(drill.stage);
    case 'stay': return `停留 ${PROGRESS_STAYS.find(({ bucket }) => drill.bucket === bucket)?.label ?? ''}`;
  }
}
