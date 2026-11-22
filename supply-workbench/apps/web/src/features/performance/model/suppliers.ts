import { LOW_SAMPLE_THRESHOLD } from '@sw/domain';
import {
  averageText,
  countText,
  EM_DASH,
  rateText,
  ratioText,
  type FigureInput,
} from './figures.js';

export type SupplierSample = 'enough' | 'few';
export type SupplierColumnKey =
  | 'dueBatches'
  | 'onTime'
  | 'averageDelayDays'
  | 'overdueNow'
  | 'dateChanges'
  | 'noteReturnDays'
  | 'openExceptions';

export type WeekInput = {
  readonly weekStart: string;
  readonly rate: number | null;
  readonly n: number;
};

export type SupplierInput = {
  readonly partyId: string;
  readonly displayName: string | null;
  readonly dueBatches: FigureInput;
  readonly onTime: FigureInput;
  readonly averageDelayDays: FigureInput;
  readonly overdueNow: FigureInput;
  readonly dateChanges: FigureInput;
  readonly noteReturnDays: FigureInput;
  readonly openExceptions: FigureInput;
  readonly weekly: readonly WeekInput[];
};

export type SupplierCell = {
  readonly key: SupplierColumnKey;
  readonly text: string;
  readonly tone: 'value' | 'sample' | 'missing';
};

export type WeekCell = {
  readonly weekStart: string;
  readonly text: string;
  readonly tone: 'value' | 'missing';
};

export type SupplierTableRow = {
  readonly partyId: string;
  readonly name: string;
  readonly href: `/parties/${string}`;
  readonly sample: SupplierSample;
  readonly cells: readonly [
    SupplierCell & { readonly key: 'dueBatches' },
    SupplierCell & { readonly key: 'onTime' },
    SupplierCell & { readonly key: 'averageDelayDays' },
    SupplierCell & { readonly key: 'overdueNow' },
    SupplierCell & { readonly key: 'dateChanges' },
    SupplierCell & { readonly key: 'noteReturnDays' },
    SupplierCell & { readonly key: 'openExceptions' },
  ];
  readonly weeks: readonly WeekCell[];
};

export function supplierView(input: {
  readonly rows: readonly SupplierInput[];
}): readonly SupplierTableRow[] {
  const grouped = partition(input.rows);
  grouped.enough.sort(compareEnough);
  grouped.few.sort(compareParty);
  return [...grouped.enough, ...grouped.few].map(toSupplierRow);
}

function partition(rows: readonly SupplierInput[]): {
  readonly enough: SupplierInput[];
  readonly few: SupplierInput[];
} {
  const enough: SupplierInput[] = [];
  const few: SupplierInput[] = [];
  for (const row of rows) {
    if (isFew(row)) few.push(row);
    else enough.push(row);
  }
  return { enough, few };
}

function isFew(row: SupplierInput): boolean {
  return row.onTime.n < LOW_SAMPLE_THRESHOLD;
}

function compareEnough(left: SupplierInput, right: SupplierInput): number {
  const byOverdue = compareCountDesc(left.overdueNow.numerator, right.overdueNow.numerator);
  if (byOverdue !== 0) return byOverdue;
  return compareParty(left, right);
}

function compareCountDesc(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareParty(left: SupplierInput, right: SupplierInput): number {
  if (left.partyId < right.partyId) return -1;
  if (left.partyId > right.partyId) return 1;
  return 0;
}

function toSupplierRow(row: SupplierInput): SupplierTableRow {
  return {
    partyId: row.partyId,
    name: row.displayName ?? EM_DASH,
    href: partyHref(row.partyId),
    sample: isFew(row) ? 'few' : 'enough',
    cells: supplierCells(row),
    weeks: row.weekly.map(weekCell),
  };
}

function partyHref(partyId: string): `/parties/${string}` {
  return `/parties/${encodeURIComponent(partyId)}`;
}

function supplierCells(row: SupplierInput): SupplierTableRow['cells'] {
  return [
    counted('dueBatches', row.dueBatches),
    onTimeCell(row.onTime),
    averaged('averageDelayDays', row.averageDelayDays),
    counted('overdueNow', row.overdueNow),
    counted('dateChanges', row.dateChanges),
    averaged('noteReturnDays', row.noteReturnDays),
    counted('openExceptions', row.openExceptions),
  ];
}

function counted<Key extends SupplierColumnKey>(
  key: Key,
  figure: FigureInput,
): SupplierCell & { readonly key: Key } {
  const text = countText(figure);
  return { key, text, tone: textTone(text) };
}

function averaged<Key extends SupplierColumnKey>(
  key: Key,
  figure: FigureInput,
): SupplierCell & { readonly key: Key } {
  const text = averageText(figure);
  return { key, text, tone: textTone(text) };
}

function onTimeCell(figure: FigureInput): SupplierCell & { readonly key: 'onTime' } {
  if (figure.n < LOW_SAMPLE_THRESHOLD)
    return { key: 'onTime', text: `样本少（n=${figure.n}）`, tone: 'sample' };
  const rate = rateText(figure);
  if (rate === EM_DASH)
    return { key: 'onTime', text: `${EM_DASH}（n=${figure.n}）`, tone: 'missing' };
  return { key: 'onTime', text: `${rate}（n=${figure.n}）`, tone: 'value' };
}

function textTone(text: string): 'value' | 'missing' {
  if (text === EM_DASH) return 'missing';
  return 'value';
}

function weekCell(week: WeekInput): WeekCell {
  const text = week.n > 0 && week.n < LOW_SAMPLE_THRESHOLD ? `样本少（n=${week.n}）` : ratioText(week.rate);
  return { weekStart: week.weekStart, text, tone: text === EM_DASH ? 'missing' : 'value' };
}
