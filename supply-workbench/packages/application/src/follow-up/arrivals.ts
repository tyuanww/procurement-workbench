import type { DeliveryBatchId, EntityId, LocalDate, OrderLineId, ReceiptCategory } from '@sw/domain';

export type ArrivalReference = {
  readonly kind: 'document' | 'ledger';
  readonly source: string;
  readonly number: string;
  readonly row: string;
};

export type RegisterArrivalInput = {
  readonly source: ArrivalReference;
  readonly warehouseId: EntityId;
  readonly receivedOn: LocalDate;
  readonly itemCode: string;
  readonly qty: number;
  readonly unit: string;
};

export type ArrivalAllocationInput = {
  readonly batchId: DeliveryBatchId;
  readonly poNumber: string;
  readonly poLine: string;
  readonly targetLineId?: OrderLineId;
  readonly evidence: string;
  readonly qty: number;
  readonly category: ReceiptCategory;
};

type WarehouseCount = {
  readonly document: ArrivalReference & { readonly kind: 'document' };
  readonly qty: number;
  readonly unit: string;
  readonly conversionEvidence: string | null;
};

export type AllocateArrival = {
  readonly kind: 'allocate';
  readonly expectedRevision: number;
  readonly reason: string | null;
  readonly count: WarehouseCount;
  readonly allocations: readonly ArrivalAllocationInput[];
};

export type ReviseArrivalInput = AllocateArrival | {
  readonly kind: 'rollback';
  readonly expectedRevision: number;
  readonly reason: string;
};

export type ArrivalAllocation = ArrivalAllocationInput & {
  readonly lineId: OrderLineId;
  readonly receiptId: EntityId;
};

export type Arrival = RegisterArrivalInput & {
  readonly id: EntityId;
  readonly revision: number;
  readonly registeredAt: string;
  readonly registeredBy: EntityId;
  readonly allocation: {
    readonly count: WarehouseCount;
    readonly rows: readonly ArrivalAllocation[];
    readonly by: EntityId;
    readonly at: string;
  } | null;
};

export type ArrivalCandidate = {
  readonly lineId: OrderLineId;
  readonly poNumber: string | null;
  readonly itemName: string | null;
  readonly needsLineConfirmation: boolean;
  readonly source: { readonly importBatchId: string; readonly sheet: string; readonly rowNo: number } | null;
  readonly batch: {
    readonly id: DeliveryBatchId;
    readonly seq: number;
    readonly plannedQty: number;
    readonly unit: string | null;
    readonly confirmedOn: LocalDate | null;
    readonly canAllocate: boolean;
  } | null;
};
