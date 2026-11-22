import type { EntityId, EntityMeta, IsoInstant } from './entity-meta.js';
import type { DeliveryBatchId, OrderLineId } from '../values/ids.js';
import type { ReceiptEvidence, ShipmentEvidence } from '../batch/fulfillment.js';
import type { LocalDate } from '../values/local-date.js';
import type {
  BatchOrigin,
  BatchStatus,
  DateChangeField,
  Lane,
  LineOrigin,
  LineStage,
  NoteStatus,
  PoFormat,
  ReceiptCategory,
  ReceiptSource,
  ShipmentSource,
} from '../vocabulary/index.js';
import { latestImportPresenceOf, missingFlagOf, type LatestImportPresence } from '../imports.js';

type ImportPresenceCarrier = {
  readonly latestImportPresence?: unknown;
  readonly missingInLatestImport?: boolean;
  readonly origin?: string;
};

/** 权威字段是 latestImportPresence。布尔值只在枚举缺失时回推，写回时永远由枚举派生。 */
export function projectLatestImportPresence(input: ImportPresenceCarrier): { readonly latestImportPresence: LatestImportPresence; readonly missingInLatestImport: boolean } {
  const latestImportPresence = latestImportPresenceOf(presenceInput(input));
  return { latestImportPresence, missingInLatestImport: missingFlagOf(latestImportPresence) };
}

function presenceInput(input: ImportPresenceCarrier): { readonly value: unknown; readonly legacyMissing?: boolean; readonly origin?: string } {
  return {
    value: input.latestImportPresence,
    ...(input.missingInLatestImport === undefined ? {} : { legacyMissing: input.missingInLatestImport }),
    ...(input.origin === undefined ? {} : { origin: input.origin }),
  };
}

export function withLatestImportPresence<T extends ImportPresenceCarrier>(line: T, presence: LatestImportPresence): T & { readonly latestImportPresence: LatestImportPresence; readonly missingInLatestImport: boolean } {
  return { ...line, ...projectLatestImportPresence({ ...line, latestImportPresence: presence }) };
}

export function importPresenceMatches(line: ImportPresenceCarrier, presence: LatestImportPresence): boolean {
  const projected = projectLatestImportPresence({ ...line, latestImportPresence: presence });
  return line.latestImportPresence === projected.latestImportPresence && line.missingInLatestImport === projected.missingInLatestImport;
}

export type PurchaseOrder = EntityMeta & {
  readonly poRaw: string | null;
  readonly poNorm: string | null;
  readonly poFormat: PoFormat;
  readonly relatedPoRaws: readonly string[];
  readonly supplierPartyId: EntityId | null;
  readonly supplierRaw: string | null;
  readonly lane: Lane;
  readonly oaDemandRef: string | null;
};

export type OrderLine = EntityMeta<OrderLineId> & {
  readonly purchaseOrderId: EntityId;
  readonly lane: Lane;
  readonly itemId: EntityId | null;
  readonly itemCodeRaw: string | null;
  readonly barcodeRaw: string | null;
  readonly nameRaw: string | null;
  readonly qtyOrdered: number | null;
  readonly unit: string | null;
  readonly buyerUserId: EntityId | null;
  readonly receiverPartyId: EntityId | null;
  readonly origin: LineOrigin;
  readonly currentSnapshotId: EntityId | null;
  readonly candidateKey: string | null;
  readonly missingInLatestImport: boolean;
  readonly latestImportPresence?: LatestImportPresence;
  readonly cancelledAt: IsoInstant | null;
  readonly cancelReason: string | null;
  readonly stage: LineStage;
  readonly stageChangedAt: IsoInstant;
  readonly nextDueBatchId: DeliveryBatchId | null;
  readonly nextDueDate: LocalDate | null;
};

export type OrderLineSnapshot = {
  readonly id: EntityId;
  readonly orderLineId: OrderLineId;
  readonly importBatchId: EntityId;
  readonly importRowId: EntityId;
  readonly data: unknown;
};

export type DeliveryBatch = EntityMeta<DeliveryBatchId> & {
  readonly orderLineId: OrderLineId;
  readonly seq: number;
  readonly plannedQty: number;
  readonly plannedUnit?: string | null;
  readonly receiverPartyId: EntityId;
  readonly dateFactoryRequired: LocalDate | null;
  readonly dateSupplierPromised: LocalDate | null;
  readonly dateBuyerConfirmed: LocalDate | null;
  readonly firstConfirmedDate: LocalDate | null;
  readonly confirmedBy: EntityId | null;
  readonly confirmedAt: IsoInstant | null;
  readonly status: BatchStatus;
  readonly statusChangedAt: IsoInstant;
  readonly origin: BatchOrigin;
  readonly originRef: { readonly rowId: string; readonly slotIndex: number } | null;
  readonly closedAt: IsoInstant | null;
  readonly closedReason: string | null;
  readonly cancelledAt: IsoInstant | null;
  readonly cancelReason: string | null;
};

export type BatchDateChange = {
  readonly id: EntityId;
  readonly batchId: DeliveryBatchId;
  readonly field: DateChangeField;
  readonly oldValue: LocalDate | null;
  readonly newValue: LocalDate | null;
  readonly reason: string | null;
  readonly changedBy: EntityId;
  readonly changedAt: IsoInstant;
};

export type Shipment = EntityMeta & {
  readonly batchId: DeliveryBatchId;
  readonly qty: number;
  readonly shippedOn: LocalDate;
  readonly source: ShipmentSource;
  readonly fulfillment?: ShipmentEvidence | null;
  readonly factoryShipmentRowId: EntityId | null;
  readonly note: string | null;
  readonly createdBy: EntityId;
  readonly voidedAt: IsoInstant | null;
  readonly voidedBy: EntityId | null;
  readonly voidReason: string | null;
};

export type Receipt = EntityMeta & {
  readonly batchId: DeliveryBatchId;
  readonly qty: number;
  readonly receivedOn: LocalDate;
  readonly category: ReceiptCategory;
  readonly source: ReceiptSource;
  readonly fulfillment?: ReceiptEvidence | null;
  readonly note: string | null;
  readonly createdBy: EntityId;
  readonly voidedAt: IsoInstant | null;
  readonly voidedBy: EntityId | null;
  readonly voidReason: string | null;
};

export type DeliveryNote = EntityMeta & {
  readonly batchId: DeliveryBatchId;
  readonly status: Exclude<NoteStatus, 'missing'>;
  readonly returnedOn: LocalDate | null;
  readonly verifiedOn: LocalDate | null;
  readonly fileId: EntityId | null;
  readonly note: string | null;
  readonly createdBy: EntityId;
  readonly voidedAt: IsoInstant | null;
  readonly voidedBy: EntityId | null;
  readonly voidReason: string | null;
};

export type BatchFacts = {
  readonly cancelledAt: IsoInstant | null;
  readonly closedAt: IsoInstant | null;
  readonly plannedQty: number;
  readonly dateBuyerConfirmed: LocalDate | null;
  readonly receipts: readonly { readonly qty: number }[];
  readonly shipments: readonly { readonly qty: number }[];
};
