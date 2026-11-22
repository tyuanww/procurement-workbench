import {
  batchStatusLabel,
  waitingOnLabel,
  STUCK_BUCKET_MAX_DAYS,
  type BatchStatus,
  type WaitingOnKind,
} from '@sw/domain';
import { EM_DASH } from './figures.js';
import { type StuckBucket } from './query.js';

export type StuckItemInput = {
  readonly batchId: string;
  readonly stage: BatchStatus;
  readonly daysInStage: number;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly waitingOn: {
    readonly kind: WaitingOnKind;
    readonly partyId: string | null;
    readonly displayName: string | null;
  };
  readonly buyer: { readonly id: string; readonly name: string | null } | null;
  readonly dateBuyerConfirmed: string | null;
  readonly factoryLinked: boolean;
  readonly factoryUnlinked: boolean;
  readonly exceptionOpen: boolean;
  readonly supplierAliasPending: boolean;
  readonly bomMissing: boolean;
};

export type BottleneckCause = 'missing_owner' | 'missing_factory' | 'supplier_pending' | 'missing_date' | 'exception_open' | 'aged_15' | 'bom_missing' | 'factory_demand_unlinked';

export type StuckDistributionInput = {
  readonly stage: BatchStatus;
  readonly buckets: { readonly [Key in StuckBucket]: number };
};

export type StuckTableRow = {
  readonly batchId: string;
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

// The server count can be larger than the 200-row list, so the blocks are not recounted from items.
export function stuckView(input: {
  readonly items: readonly StuckItemInput[];
  readonly distribution: readonly StuckDistributionInput[];
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
  readonly cause: BottleneckCause | null;
}): StuckView {
  return {
    rows: input.items
      .filter((item) => matches({ item, stage: input.stage, bucket: input.bucket, cause: input.cause }))
      .map(toRow),
    dwell: input.distribution.map((row) =>
      toDwell({ row, stage: input.stage, bucket: input.bucket }),
    ),
  };
}

function matches(input: {
  readonly item: StuckItemInput;
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
  readonly cause: BottleneckCause | null;
}): boolean {
  if (input.stage !== null && input.item.stage !== input.stage) return false;
  if (input.bucket !== null && bucketOf(input.item.daysInStage) !== input.bucket) return false;
  return matchesCause({ item: input.item, cause: input.cause });
}

function matchesCause(input: { readonly item: StuckItemInput; readonly cause: BottleneckCause | null }): boolean {
  if (input.cause === 'missing_owner') return input.item.buyer === null;
  if (input.cause === 'missing_factory') return !input.item.factoryLinked;
  if (input.cause === 'supplier_pending') return input.item.supplierAliasPending;
  if (input.cause === 'bom_missing') return input.item.bomMissing;
  if (input.cause === 'factory_demand_unlinked') return input.item.factoryUnlinked;
  if (input.cause === 'missing_date') return input.item.dateBuyerConfirmed === null;
  if (input.cause === 'exception_open') return input.item.exceptionOpen;
  if (input.cause === 'aged_15') return input.item.daysInStage >= 15;
  return true;
}

function bucketOf(days: number): StuckBucket {
  const [shortStay, mediumStay, longStay] = STUCK_BUCKET_MAX_DAYS;
  if (days <= shortStay) return '0-3';
  if (days <= mediumStay) return '4-7';
  if (days <= longStay) return '8-14';
  return '15+';
}

function toRow(item: StuckItemInput): StuckTableRow {
  return {
    batchId: item.batchId,
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

function waitingText(item: StuckItemInput): string {
  if (item.waitingOn.displayName !== null) return item.waitingOn.displayName;
  return waitingOnLabel(item.waitingOn.kind);
}

function ownerText(item: StuckItemInput): string {
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
