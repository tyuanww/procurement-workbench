import { lineStageText, STUCK_BUCKET_MAX_DAYS, todoReasonText } from '@sw/domain';
import { formatTableDate } from '../../../shared/ui/format.js';
import type { ProgressMaterialRisk } from './material-risks.js';

export type ProgressSupplier = {
  readonly displayName: string | null;
  readonly rawName: string | null;
};

export type ProgressDue = {
  readonly dateBuyerConfirmed: string | null;
  readonly overdueDays: number | null;
};

export type ProgressLine = {
  readonly id: string;
  readonly nameRaw: string | null;
  readonly poRaw: string | null;
  readonly stage: string;
  readonly daysInStage: number;
  readonly supplier: ProgressSupplier;
  readonly nextDue: ProgressDue | null;
  readonly materialRisks?: readonly ProgressMaterialRisk[];
};

export type ProgressNudge = {
  readonly lineId: string;
  readonly severity: number;
  readonly reasons: readonly string[];
};

export type ProgressStay = '0-3' | '4-7' | '8-14' | '15+';

const BLANK = '—';

export type ProgressArrival =
  | { readonly kind: 'missing'; readonly dateText: '—' }
  | { readonly kind: 'dated'; readonly dateText: string }
  | { readonly kind: 'overdue'; readonly dateText: string };

export type ArrivalPaint =
  | { readonly kind: 'status'; readonly status: 'overdue' | 'confirmed' }
  | { readonly kind: 'missing'; readonly reason: 'not_provided' };

export function arrivalPaint(kind: ProgressArrival['kind']): ArrivalPaint {
  switch (kind) {
    case 'overdue':
      return { kind: 'status', status: 'overdue' };
    case 'missing':
      return { kind: 'missing', reason: 'not_provided' };
    case 'dated':
      return { kind: 'status', status: 'confirmed' };
    default: {
      const unchecked: never = kind;
      return unchecked;
    }
  }
}

export type ProgressRow = {
  readonly lineId: string;
  readonly title: string;
  readonly po: string;
  readonly stage: string;
  readonly stageLabel: string;
  readonly daysInStage: number;
  readonly dayText: string;
  readonly stay: ProgressStay;
  readonly nextLabel: string | null;
  readonly materialRisks: readonly ProgressMaterialRisk[];
  readonly supplierLabel: string;
  readonly arrival: ProgressArrival;
};

export function arrivalTableDate(input: { readonly arrival: ProgressArrival; readonly now: Date }): string {
  if (input.arrival.kind === 'missing') return BLANK;
  return formatTableDate({ iso: input.arrival.dateText, now: input.now });
}

const HIDDEN = new Set(['done', 'cancelled']);

export function progressRows({ lines, nudges }: { readonly lines: readonly ProgressLine[]; readonly nudges: readonly ProgressNudge[] }): ProgressRow[] {
  const byLine = nudgesByLine(nudges);
  return lines
    .filter((line) => !HIDDEN.has(line.stage))
    .map((line) => toRow({ line, nudges: byLine.get(line.id) ?? [] }))
    .sort(byDays);
}

function nudgesByLine(nudges: readonly ProgressNudge[]): Map<string, ProgressNudge[]> {
  const grouped = new Map<string, ProgressNudge[]>();
  for (const nudge of nudges) {
    const list = grouped.get(nudge.lineId) ?? [];
    list.push(nudge);
    grouped.set(nudge.lineId, list);
  }
  return grouped;
}

function toRow({ line, nudges }: { readonly line: ProgressLine; readonly nudges: readonly ProgressNudge[] }): ProgressRow {
  return {
    lineId: line.id,
    title: line.nameRaw ?? '未命名',
    po: line.poRaw ?? BLANK,
    stage: line.stage,
    stageLabel: progressStageLabel(line.stage),
    daysInStage: line.daysInStage,
    dayText: dayText({ days: line.daysInStage }),
    stay: stayBucket({ days: line.daysInStage }),
    nextLabel: nextOf(nudges),
    materialRisks: line.materialRisks ?? [],
    supplierLabel: supplierLabel({ supplier: line.supplier }),
    arrival: arrivalOf({ nextDue: line.nextDue }),
  };
}

export function progressStageLabel(stage: string): string {
  if (stage === 'no_batch') return '待建批次';
  if (stage === 'awaiting_date') return '已有批次待确认';
  return lineStageText(stage);
}

function textOrNull({ value }: { readonly value: string | null }): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed;
}

function supplierLabel({ supplier }: { readonly supplier: ProgressSupplier }): string {
  return textOrNull({ value: supplier.displayName }) ?? textOrNull({ value: supplier.rawName }) ?? BLANK;
}

function isProvenOverdue({ nextDue }: { readonly nextDue: ProgressDue | null }): boolean {
  if (nextDue === null || nextDue.overdueDays === null) return false;
  return Number.isFinite(nextDue.overdueDays) && nextDue.overdueDays > 0;
}

function arrivalOf({ nextDue }: { readonly nextDue: ProgressDue | null }): ProgressArrival {
  const date = nextDue === null ? null : textOrNull({ value: nextDue.dateBuyerConfirmed });
  if (date === null) return { kind: 'missing', dateText: BLANK };
  if (isProvenOverdue({ nextDue })) return { kind: 'overdue', dateText: date };
  return { kind: 'dated', dateText: date };
}

function stayBucket({ days }: { readonly days: number }): ProgressStay {
  const [short, medium, long] = STUCK_BUCKET_MAX_DAYS;
  if (!Number.isFinite(days)) return '0-3';
  if (days <= short) return '0-3';
  if (days <= medium) return '4-7';
  if (days <= long) return '8-14';
  return '15+';
}

function dayText({ days }: { readonly days: number }): string {
  if (!Number.isFinite(days)) return BLANK;
  return String(days);
}

function nextOf(nudges: readonly ProgressNudge[]): string | null {
  const top = [...nudges].sort((left, right) => right.severity - left.severity)[0];
  if (top === undefined || top.reasons.length === 0) return null;
  return top.reasons.map((code) => todoReasonText(code)).join(' ');
}

function byDays(left: ProgressRow, right: ProgressRow): number {
  return right.daysInStage - left.daysInStage;
}

export const NOTE_READ_ERROR = '有的进度说明没有读出来';

export type LocalNote = {
  readonly lineId: string;
  readonly generation: number;
  readonly text: string;
};

export function mergeLoadedNotes({ loaded, local, generation }: { readonly loaded: Readonly<Record<string, string>>; readonly local: readonly LocalNote[]; readonly generation: number }): Record<string, string> {
  const merged = { ...loaded };
  for (const saved of local) {
    if (saved.generation >= generation) merged[saved.lineId] = saved.text;
  }
  return merged;
}

export function rememberLocalNote(local: readonly LocalNote[], saved: LocalNote): LocalNote[] {
  return [...local.filter((item) => item.lineId !== saved.lineId), saved];
}

export function progressNote(text: string): { readonly kind: 'note'; readonly text: string } | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return { kind: 'note', text: trimmed };
}
