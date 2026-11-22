import { EM_DASH, type EmDash } from './figures.js';

export type BuyerInput = {
  readonly buyerId: string;
  readonly name: string | null;
  readonly openBatches: number;
  readonly overdue: number;
  readonly dueToday: number;
  readonly missingDate: number;
  readonly openLines: number | null;
  readonly openExceptions: number | null;
  readonly followUpsInPeriod: number | null;
};

export type BuyerSegment =
  | {
      readonly id: 'overdue';
      readonly label: '逾期';
      readonly count: number;
      readonly tone: 'danger';
      readonly fill: 'solid';
    }
  | {
      readonly id: 'dueToday';
      readonly label: '今日应到';
      readonly count: number;
      readonly tone: 'warning';
      readonly fill: 'solid';
    }
  | {
      readonly id: 'missingDate';
      readonly label: '缺确认日期';
      readonly count: number;
      readonly tone: 'warning';
      readonly fill: 'outline';
    }
  | {
      readonly id: 'other';
      readonly label: '其他';
      readonly count: number;
      readonly tone: 'neutral';
      readonly fill: 'solid';
    };

export type BuyerBarRow = {
  readonly buyerId: string;
  readonly name: string;
  readonly href: `/lines?buyer=${string}`;
  readonly openLines: number | EmDash;
  readonly openBatches: number;
  readonly openExceptions: number | EmDash;
  readonly followUpsInPeriod: number | EmDash;
  readonly segments: readonly [
    Extract<BuyerSegment, { readonly id: 'overdue' }>,
    Extract<BuyerSegment, { readonly id: 'dueToday' }>,
    Extract<BuyerSegment, { readonly id: 'missingDate' }>,
    Extract<BuyerSegment, { readonly id: 'other' }>,
  ];
};

export function buyerView(input: { readonly rows: readonly BuyerInput[] }): readonly BuyerBarRow[] {
  return input.rows.map(toBuyerRow);
}

function toBuyerRow(row: BuyerInput): BuyerBarRow {
  return {
    buyerId: row.buyerId,
    name: row.name ?? EM_DASH,
    href: buyerHref(row.buyerId),
    openLines: countOrDash(row.openLines),
    openBatches: row.openBatches,
    openExceptions: countOrDash(row.openExceptions),
    followUpsInPeriod: countOrDash(row.followUpsInPeriod),
    segments: segmentsOf(row),
  };
}

function buyerHref(buyerId: string): `/lines?buyer=${string}` {
  return `/lines?buyer=${encodeURIComponent(buyerId)}`;
}

function countOrDash(value: number | null): number | EmDash {
  if (value === null) return EM_DASH;
  return value;
}

function segmentsOf(row: BuyerInput): BuyerBarRow['segments'] {
  return [
    { id: 'overdue', label: '逾期', count: row.overdue, tone: 'danger', fill: 'solid' },
    { id: 'dueToday', label: '今日应到', count: row.dueToday, tone: 'warning', fill: 'solid' },
    {
      id: 'missingDate',
      label: '缺确认日期',
      count: row.missingDate,
      tone: 'warning',
      fill: 'outline',
    },
    { id: 'other', label: '其他', count: otherCount(row), tone: 'neutral', fill: 'solid' },
  ];
}

function otherCount(row: BuyerInput): number {
  const rest = row.openBatches - row.overdue - row.dueToday - row.missingDate;
  if (rest > 0) return rest;
  return 0;
}
