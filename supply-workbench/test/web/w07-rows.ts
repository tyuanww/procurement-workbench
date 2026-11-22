import {
  type StuckItemInput,
  type SupplierInput,
} from '../../apps/web/src/features/performance/index.js';

type WeekSample = { readonly weekStart: string; readonly rate: number | null; readonly n: number };

export function supplierRow(input: {
  readonly partyId: string;
  readonly name: string;
  readonly n: number;
  readonly numerator: number | null;
  readonly denominator: number | null;
  readonly overdue: number | null;
  readonly weekly?: readonly WeekSample[];
}): SupplierInput {
  const blank = { numerator: null, denominator: null, n: 0 };
  return {
    partyId: input.partyId,
    displayName: input.name,
    dueBatches: blank,
    onTime: { numerator: input.numerator, denominator: input.denominator, n: input.n },
    averageDelayDays: blank,
    overdueNow: { numerator: input.overdue, denominator: null, n: 0 },
    dateChanges: blank,
    noteReturnDays: blank,
    openExceptions: blank,
    weekly: input.weekly ?? [],
  };
}

export function stuckItem(input: {
  readonly batchId: string;
  readonly stage: StuckItemInput['stage'];
  readonly daysInStage: number;
  readonly poRaw?: string | null;
  readonly nameRaw?: string | null;
  readonly factoryLinked?: boolean;
  readonly factoryUnlinked?: boolean;
  readonly exceptionOpen?: boolean;
  readonly supplierAliasPending?: boolean;
  readonly bomMissing?: boolean;
}): StuckItemInput {
  return {
    batchId: input.batchId,
    stage: input.stage,
    daysInStage: input.daysInStage,
    poRaw: input.poRaw ?? null,
    nameRaw: input.nameRaw ?? null,
    waitingOn: { kind: 'supplier', partyId: null, displayName: null },
    buyer: null,
    dateBuyerConfirmed: null,
    factoryLinked: input.factoryLinked ?? false,
    factoryUnlinked: input.factoryUnlinked ?? false,
    exceptionOpen: input.exceptionOpen ?? false,
    supplierAliasPending: input.supplierAliasPending ?? false,
    bomMissing: input.bomMissing ?? false,
  };
}
