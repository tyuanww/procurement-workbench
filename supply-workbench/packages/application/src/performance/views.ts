import type { BatchStatus, Lane, LocalDate, WaitingOnKind } from '@sw/domain';
import type { KpiFigure } from '../master-data/index.js';

/** 姓名可以没有。没有就留 null，不用 id 冒充姓名。 */
export type NamedPerson = {
  readonly id: string;
  readonly name: string | null;
};

export type StuckBuckets = {
  readonly '0-3': number;
  readonly '4-7': number;
  readonly '8-14': number;
  readonly '15+': number;
};

export type StuckItem = {
  readonly batchId: string;
  readonly stage: BatchStatus;
  readonly daysInStage: number;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly waitingOn: { readonly kind: WaitingOnKind; readonly partyId: string | null; readonly displayName: string | null };
  readonly buyer: NamedPerson | null;
  readonly dateBuyerConfirmed: LocalDate | null;
  readonly factoryLinked: boolean;
  readonly factoryUnlinked: boolean;
  readonly exceptionOpen: boolean;
  /** 该订单行的供应商原文在待审核别名里。 */
  readonly supplierAliasPending: boolean;
  /** 该订单行的产品条码有产品档案、但没有任何 BOM 行。 */
  readonly bomMissing: boolean;
};

export type StuckDashboard = {
  readonly kpis: {
    readonly openBatches: number;
    readonly overdue: number;
    readonly awaitingDate: number;
    readonly shippedNotReceived: number;
  };
  readonly distribution: readonly { readonly stage: BatchStatus; readonly buckets: StuckBuckets }[];
  readonly items: readonly StuckItem[];
};

export type SupplierWeek = {
  readonly weekStart: LocalDate;
  readonly rate: number | null;
  readonly n: number;
};

export type SupplierKpiRow = {
  readonly partyId: string;
  readonly displayName: string | null;
  readonly dueBatches: KpiFigure;
  readonly onTime: KpiFigure;
  readonly averageDelayDays: KpiFigure;
  readonly overdueNow: KpiFigure;
  readonly dateChanges: KpiFigure;
  readonly noteReturnDays: KpiFigure;
  readonly openExceptions: KpiFigure;
  readonly weekly: readonly SupplierWeek[];
};

export type BuyerLoadRow = {
  readonly buyer: NamedPerson;
  readonly openLines: number | null;
  readonly openBatches: number;
  readonly overdue: number;
  readonly dueToday: number;
  readonly missingDate: number;
  readonly openExceptions: number | null;
  readonly followUpsInPeriod: number | null;
};

export type SupplierDashboard = { readonly rows: readonly SupplierKpiRow[] };
export type BuyerLoadDashboard = { readonly rows: readonly BuyerLoadRow[]; readonly unassignedExceptions: number | null };

export type PeriodQuery = {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly lane?: Lane;
};

export type StuckQuery = PeriodQuery;
export type SupplierQuery = PeriodQuery;
export type BuyerLoadQuery = PeriodQuery;

export type BottleneckKey =
  | 'missing_owner'
  | 'missing_factory'
  | 'alias_pending'
  | 'missing_date'
  | 'exception_open'
  | 'aged_15'
  | 'bom_missing'
  | 'factory_demand_unlinked';

export type BottleneckCategory = { readonly key: BottleneckKey; readonly label: string; readonly count: number; readonly href: string };

export type BottleneckSummary = { readonly categories: readonly BottleneckCategory[] };
