import type { EntityId, IsoInstant } from './entity-meta.js';
import type { ExceptionStatus, Lane, LineStage, BatchStatus } from '../vocabulary/index.js';
import type { LocalDate } from '../values/local-date.js';

export type OrderLineLoad = {
  readonly id: EntityId;
  readonly buyerUserId: EntityId | null;
  readonly lane: Lane;
  readonly stage: LineStage;
};

export type KpiBatch = {
  readonly id: EntityId;
  readonly status: BatchStatus;
  readonly lane: Lane;
  readonly firstConfirmedDate: LocalDate | null;
  readonly dateBuyerConfirmed: LocalDate | null;
  readonly statusChangedAt: IsoInstant;
  readonly cancelledAt: IsoInstant | null;
  readonly closedAt: IsoInstant | null;
  readonly buyerUserId: EntityId | null;
  readonly supplierPartyId: EntityId | null;
  readonly receiverPartyId: EntityId | null;
  readonly receipts: readonly { readonly receivedOn: LocalDate; readonly voidedAt: IsoInstant | null }[];
  readonly shipments: readonly { readonly shippedOn: LocalDate; readonly voidedAt: IsoInstant | null }[];
  readonly noteReturnedOn: LocalDate | null;
};

type SupplierAttribution = {
  readonly supplierPartyId?: EntityId | null;
  readonly lane?: Lane;
};

export type KpiInput = {
  readonly today: LocalDate;
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly batches: readonly KpiBatch[];
  readonly lines: readonly OrderLineLoad[];
  readonly dateChanges: readonly (SupplierAttribution & { readonly field: 'dateBuyerConfirmed'; readonly changedAt: IsoInstant; readonly isFirstSet: boolean })[];
  readonly exceptions: readonly (SupplierAttribution & { readonly status: ExceptionStatus; readonly openedAt: IsoInstant; readonly closedAt: IsoInstant | null; readonly buyerUserId?: EntityId | null })[];
};
