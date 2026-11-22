import { LINE_STAGES, type LineStage } from '@sw/domain';
import { progressStageLabel, type ProgressRow, type ProgressStay } from './rows.js';
import { matchesProgressDrill, PROGRESS_STAYS } from './drill.js';

export type ProgressStageCount = {
  readonly key: LineStage;
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
  readonly pendingBatch: number;
  readonly awaitingDate: number;
  readonly longStay: number;
  readonly stages: readonly ProgressStageCount[];
  readonly stays: readonly ProgressStayCount[];
};

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
    overdue: rows.filter((row) => matchesProgressDrill(row, { kind: 'overdue' })).length,
    pendingBatch: rows.filter((row) => matchesProgressDrill(row, { kind: 'stage', stage: 'no_batch' })).length,
    awaitingDate: rows.filter((row) => matchesProgressDrill(row, { kind: 'stage', stage: 'awaiting_date' })).length,
    longStay: rows.filter((row) => matchesProgressDrill(row, { kind: 'stay', bucket: '15+' })).length,
    stages: stageCounts(rows),
    stays: stayCounts(rows),
  };
}

function stageCounts(rows: readonly ProgressRow[]): readonly ProgressStageCount[] {
  return LINE_STAGES.flatMap((stage) => {
    const count = rows.filter((row) => matchesProgressDrill(row, { kind: 'stage', stage })).length;
    if (count === 0 || STAGE_TONE[stage] === undefined) return [];
    return [{ key: stage, label: progressStageLabel(stage), count, tone: STAGE_TONE[stage] }];
  });
}

function stayCounts(rows: readonly ProgressRow[]): readonly ProgressStayCount[] {
  return PROGRESS_STAYS.map((meta) => ({ ...meta, count: rows.filter((row) => matchesProgressDrill(row, { kind: 'stay', bucket: meta.bucket })).length }));
}
