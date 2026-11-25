import {
  batchStatusLabel,
  waitingOnLabel,
  type BatchStatus,
  type StuckBucket,
} from '@sw/domain';
import { EM_DASH } from './figures.js';
import type { StuckDashboard, StuckItem } from '@sw/contracts';

export type StuckDistributionInput = StuckDashboard['distribution'][number];

export type StuckTableRow = {
  readonly batchId: string;
  readonly batchSeq: number | undefined;
  readonly stageLabel: string;
  readonly daysInStage: number;
  readonly po: string;
  readonly name: string;
  readonly waiting: string;
  readonly owner: string;
  readonly confirmed: string;
  readonly buyerMissing: boolean;
  readonly dateMissing: boolean;
};

export type DwellBlock = {
  readonly bucket: StuckBucket;
  readonly count: number;
  readonly isActive: boolean;
};

export type DwellRow = {
  readonly stage: BatchStatus;
  readonly label: string;
  readonly tone: 'warning' | 'info' | 'success' | 'neutral';
  readonly blocks: readonly [
    DwellBlock & { readonly bucket: '0-3' },
    DwellBlock & { readonly bucket: '4-7' },
    DwellBlock & { readonly bucket: '8-14' },
    DwellBlock & { readonly bucket: '15+' },
  ];
};

export type StuckView = {
  readonly rows: readonly StuckTableRow[];
  readonly dwell: readonly DwellRow[];
};

export function stuckView(input: {
  readonly items: readonly StuckItem[];
  readonly distribution: readonly StuckDistributionInput[];
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
}): StuckView {
  return {
    rows: input.items.map(toRow),
    dwell: input.distribution.map((row) =>
      toDwell({ row, stage: input.stage, bucket: input.bucket }),
    ),
  };
}

function toRow(item: StuckItem): StuckTableRow {
  return {
    batchId: item.batchId,
    batchSeq: item.batchSeq,
    stageLabel: batchStatusLabel(item.stage),
    daysInStage: item.daysInStage,
    po: textOrDash(item.poRaw),
    name: textOrDash(item.nameRaw),
    waiting: waitingText(item),
    owner: ownerText(item),
    confirmed: textOrDash(item.dateBuyerConfirmed),
    buyerMissing: item.buyer === null,
    dateMissing: item.dateBuyerConfirmed === null,
  };
}

function textOrDash(value: string | null): string {
  return value ?? EM_DASH;
}

function waitingText(item: StuckItem): string {
  if (item.waitingOn.displayName !== null) return item.waitingOn.displayName;
  return waitingOnLabel(item.waitingOn.kind);
}

function ownerText(item: StuckItem): string {
  if (item.buyer === null || item.buyer.name === null) return EM_DASH;
  return item.buyer.name;
}

function stageTone(stage: BatchStatus): DwellRow['tone'] {
  switch (stage) {
    case 'awaiting_date':
      return 'warning';
    case 'confirmed':
    case 'shipped':
    case 'partially_received':
      return 'info';
    case 'received':
      return 'success';
    case 'closed':
    case 'cancelled':
      return 'neutral';
  }
}

function toDwell(input: {
  readonly row: StuckDistributionInput;
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
}): DwellRow {
  return {
    stage: input.row.stage,
    label: batchStatusLabel(input.row.stage),
    tone: stageTone(input.row.stage),
    blocks: dwellBlocks(input),
  };
}

function dwellBlocks(input: {
  readonly row: StuckDistributionInput;
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
}): DwellRow['blocks'] {
  const isStage = input.stage === input.row.stage;
  return [
    dwellBlock({
      bucket: '0-3',
      count: input.row.buckets['0-3'],
      isActive: isStage && input.bucket === '0-3',
    }),
    dwellBlock({
      bucket: '4-7',
      count: input.row.buckets['4-7'],
      isActive: isStage && input.bucket === '4-7',
    }),
    dwellBlock({
      bucket: '8-14',
      count: input.row.buckets['8-14'],
      isActive: isStage && input.bucket === '8-14',
    }),
    dwellBlock({
      bucket: '15+',
      count: input.row.buckets['15+'],
      isActive: isStage && input.bucket === '15+',
    }),
  ];
}

function dwellBlock<Bucket extends StuckBucket>(input: {
  readonly bucket: Bucket;
  readonly count: number;
  readonly isActive: boolean;
}): DwellBlock & { readonly bucket: Bucket } {
  return { bucket: input.bucket, count: input.count, isActive: input.isActive };
}
