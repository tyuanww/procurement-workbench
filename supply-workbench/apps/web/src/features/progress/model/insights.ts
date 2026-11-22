import { LINE_STAGES, lineStageText, type LineStage } from '@sw/domain';
import type { ProgressRow, ProgressStay } from './rows.js';

export type ProgressStageCount = {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly tone: 'neutral' | 'warning' | 'info' | 'attention';
};

export type ProgressStayCount = {
  readonly bucket: ProgressStay;
  readonly label: string;
  readonly count: number;
  readonly tone: 'neutral' | 'warning' | 'attention' | 'danger';
};

export type ProgressInsight = {
  readonly total: number;
  readonly overdue: number;
  readonly missingDate: number;
  readonly longStay: number;
  readonly stages: readonly ProgressStageCount[];
  readonly stays: readonly ProgressStayCount[];
};

const STAY_META: readonly { readonly bucket: ProgressStay; readonly label: string; readonly tone: ProgressStayCount['tone'] }[] = [
  { bucket: '0-3', label: '0-3 天', tone: 'neutral' },
  { bucket: '4-7', label: '4-7 天', tone: 'warning' },
  { bucket: '8-14', label: '8-14 天', tone: 'attention' },
  { bucket: '15+', label: '15+ 天', tone: 'danger' },
];

const STAGE_TONE: Partial<Record<LineStage, ProgressStageCount['tone']>> = {
  no_batch: 'neutral',
  awaiting_date: 'warning',
  awaiting_shipment: 'info',
  awaiting_receipt: 'info',
  partially_received: 'attention',
};

export function progressInsights(rows: readonly ProgressRow[]): ProgressInsight {
  return {
    total: rows.length,
    overdue: rows.filter((row) => row.arrival.kind === 'overdue').length,
    missingDate: rows.filter((row) => row.arrival.kind === 'missing').length,
    longStay: rows.filter((row) => row.stay === '15+').length,
    stages: stageCounts(rows),
    stays: stayCounts(rows),
  };
}

function stageCounts(rows: readonly ProgressRow[]): readonly ProgressStageCount[] {
  return LINE_STAGES.flatMap((stage) => {
    const count = rows.filter((row) => row.stage === stage).length;
    if (count === 0 || STAGE_TONE[stage] === undefined) return [];
    return [{ key: stage, label: lineStageText(stage), count, tone: STAGE_TONE[stage] }];
  });
}

function stayCounts(rows: readonly ProgressRow[]): readonly ProgressStayCount[] {
  return STAY_META.map((meta) => ({ ...meta, count: rows.filter((row) => row.stay === meta.bucket).length }));
}
