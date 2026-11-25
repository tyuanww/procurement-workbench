import type { BatchFulfillment, BatchStatus, Lane, LocalDate, StuckBucket, StuckCause, WaitingOnKind } from '@sw/domain';
import type { KpiFigure } from '../master-data/index.js';

/** 姓名可以没有。没有就留 null，不用 id 冒充姓名。 */
export type NamedPerson = {
  readonly id: string;
  readonly name: string | null;
};

export type StuckBuckets = Readonly<Record<StuckBucket, number>>;
export type StuckCauseCounts = Readonly<Record<StuckCause, number>>;

export type StuckWaitingReason = 'supplier_date' | 'supplier_shipment' | 'internal_note' | 'internal_review' | 'receiver_arrival';

export type StuckItem = {
  readonly batchId: string;
  readonly batchSeq?: number;
  readonly orderLineId?: string;
  readonly stage: BatchStatus;
  readonly daysInStage: number;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly waitingOn: { readonly kind: WaitingOnKind; readonly partyId: string | null; readonly displayName: string | null; readonly reason?: StuckWaitingReason };
  readonly fulfillment?: BatchFulfillment;
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
  readonly asOf: LocalDate;
  readonly kpis: {
    readonly openBatches: number;
    readonly overdue: number;
    readonly awaitingDate: number;
    readonly shippedNotReceived: number;
  };
  readonly distribution: readonly { readonly stage: BatchStatus; readonly buckets: StuckBuckets }[];
  readonly causeCounts: StuckCauseCounts;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
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

export type SupplierEvents = { readonly dateChanges: number; readonly openExceptions: number };

export type SupplierBatchResult = {
  readonly batchId: string;
  readonly orderLineId: string | null;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly firstConfirmedDate: LocalDate | null;
  readonly lastReceivedOn: LocalDate | null;
  readonly onTime: boolean;
};

export type SupplierDashboard = {
  readonly rows: readonly SupplierKpiRow[];
  readonly unassigned?: SupplierEvents;
  readonly detail?: readonly SupplierBatchResult[];
};
export type BuyerLoadDashboard = { readonly rows: readonly BuyerLoadRow[]; readonly unassignedExceptions: number | null };

export type PeriodQuery = {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly lane?: Lane;
};

export type StuckQuery = PeriodQuery & {
  readonly stage?: BatchStatus;
  readonly bucket?: StuckBucket;
  readonly cause?: StuckCause;
  readonly card?: 'overdue';
  readonly page?: number;
};
export type SupplierQuery = PeriodQuery & { readonly partyId?: string | undefined };
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
