import type {
  CodeType,
  EntityId,
  ItemKind,
  LinkStatus,
  LocalDate,
  OrderLineId,
  ReviewStatus,
} from '@sw/domain';
import type {
  CustomerSuppliedPayload,
  FactoryShipmentPayload,
  FactoryStockPayload,
  InTransitPayload,
  MaterialDemandPayload,
  PackagingComboPayload,
  ScheduleCellPayload,
} from '../ports/parsed-rows.js';
import type { PageQuery } from '../shared/page.js';

export type ReviewCounts = {
  readonly aliases: number;
  readonly codes: number;
  readonly links: number;
  readonly multiName: number;
};

export type PartyAliasView = {
  readonly id: string;
  readonly rawName: string;
  readonly normName: string;
  readonly partyId: string | null;
  readonly status: ReviewStatus;
  readonly firstSeenImportBatchId: string | null;
  readonly seenCount: number;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly similar: readonly { readonly partyId: string; readonly displayName: string }[];
};

export type ItemCodeView = {
  readonly id: string;
  readonly codeType: CodeType;
  readonly codeRaw: string;
  readonly codeNorm: string;
  readonly itemId: string | null;
  readonly status: ReviewStatus;
};

export type CodeLinkView = {
  readonly id: string;
  readonly fromCodeId: string;
  readonly toCodeId: string;
  readonly status: ReviewStatus;
  readonly evidence: unknown;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
};

export type MultiNameView = {
  readonly codeId: string;
  readonly codeRaw: string;
  readonly names: readonly { readonly nameRaw: string; readonly count: number }[];
};

export type PartyView = {
  readonly id: string;
  readonly displayName: string;
  readonly isSupplier: boolean;
  readonly isFactory: boolean;
  readonly isOwnWarehouse: boolean;
  readonly note: string | null;
};

export type ItemView = {
  readonly id: string;
  readonly displayName: string;
  readonly kind: ItemKind;
  readonly spec: string | null;
  readonly sharedCodeFlag: boolean;
};

export type ItemDetail = {
  readonly item: ItemView;
  readonly codes: readonly ItemCodeView[];
  readonly names: readonly { readonly nameRaw: string; readonly seenCount: number }[];
};

type FactoryEnvelope = {
  readonly id: string;
  readonly importBatchId: string;
  readonly factoryPartyId: string;
  readonly sheetName: string;
  readonly rowNo: number;
  readonly fingerprint: string;
  readonly linkedOrderLineId: string | null;
  readonly linkStatus: LinkStatus;
  readonly linkReason: string | null;
};

export type FactoryReportRowView = FactoryEnvelope &
  (
    | { readonly kind: 'in_transit'; readonly payload: InTransitPayload }
    | { readonly kind: 'shipment'; readonly payload: FactoryShipmentPayload }
    | { readonly kind: 'stock'; readonly payload: FactoryStockPayload }
    | { readonly kind: 'schedule'; readonly payload: ScheduleCellPayload }
    | { readonly kind: 'demand'; readonly payload: MaterialDemandPayload }
    | { readonly kind: 'packaging_combo'; readonly payload: PackagingComboPayload }
    | { readonly kind: 'customer_supplied'; readonly payload: CustomerSuppliedPayload }
  );

export type FactoryReportOf<K extends FactoryReportRowView['kind']> = Extract<FactoryReportRowView, { readonly kind: K }>;

export type FactoryStockRowView = FactoryEnvelope & {
  readonly kind: 'stock';
  readonly payload: FactoryStockPayload;
};

export type DemandRowView = FactoryEnvelope & {
  readonly kind: 'demand';
  readonly payload: MaterialDemandPayload;
  readonly generatedBatches: readonly { readonly batchId: string; readonly slotIndex: number }[];
};

export type CustomerSuppliedRowView = FactoryEnvelope & {
  readonly kind: 'customer_supplied';
  readonly payload: CustomerSuppliedPayload;
};

export type PartyDetail = {
  readonly party: PartyView;
  readonly aliases: readonly PartyAliasView[];
  readonly kpis: KpiFigures;
  readonly kpiWindow: { readonly from: LocalDate; readonly to: LocalDate };
};

/** K1–K7。分子、分母、样本数都要在，平均天数也不收成一个裸数字。 */
export type KpiFigures = {
  readonly dueBatches: KpiFigure;
  readonly onTime: KpiFigure;
  readonly averageDelayDays: KpiFigure;
  readonly overdueNow: KpiFigure;
  readonly dateChanges: KpiFigure;
  readonly noteReturnDays: KpiFigure;
  readonly openExceptions: KpiFigure;
};

export type KpiFigure = {
  readonly numerator: number | null;
  readonly denominator: number | null;
  readonly n: number;
};

export type AliasListQuery = PageQuery & { readonly status?: ReviewStatus };
export type CodeListQuery = PageQuery & { readonly status?: ReviewStatus; readonly codeType?: CodeType };
export type LinkListQuery = PageQuery & { readonly status?: ReviewStatus };
export type PartyListQuery = PageQuery & { readonly q?: string; readonly role?: 'supplier' | 'factory' | 'own_warehouse' };
export type ItemListQuery = PageQuery & { readonly q?: string };
export type PartyDetailQuery = { readonly partyId: string; readonly from?: LocalDate; readonly to?: LocalDate };
export type UnlinkedQuery = PageQuery & { readonly factoryPartyId?: string; readonly sheet?: string };
export type DemandListQuery = PageQuery & { readonly factoryPartyId?: string; readonly onlyWithoutBatches?: boolean };
export type CustomerSuppliedQuery = PageQuery & { readonly factoryPartyId?: string };

export type ApproveAliasInput = {
  readonly aliasId: string;
  readonly confirmForbiddenPair?: boolean;
} & (
  | { readonly partyId: EntityId; readonly createParty?: never }
  | { readonly createParty: { readonly displayName: string; readonly isSupplier: boolean; readonly isFactory: boolean }; readonly partyId?: never }
);

export type RejectAliasInput = { readonly aliasId: string; readonly reason: string };
export type ApproveCodeInput = {
  readonly codeId: string;
} & (
  | { readonly itemId: EntityId; readonly createItem?: never }
  | { readonly createItem: { readonly displayName: string; readonly kind: ItemKind }; readonly itemId?: never }
);
export type RejectCodeInput = { readonly codeId: string; readonly reason: string };
export type BulkCreateItemsInput = { readonly codeIds: readonly string[] };
export type ReviewLinkInput = { readonly linkId: string; readonly reason?: string };
export type ResolveMultiNameInput = {
  readonly codeId: string;
} & ({ readonly mode: 'same_item'; readonly displayName: string } | { readonly mode: 'shared_code' });
export type LinkFactoryRowInput = {
  readonly table: 'in-transit' | 'shipment' | 'stock' | 'schedule' | 'demand' | 'packaging-combo';
  readonly rowId: string;
  readonly orderLineId: OrderLineId;
  readonly approveCodeLink?: boolean;
};
export type CreatePartyInput = {
  readonly displayName: string;
  readonly isSupplier: boolean;
  readonly isFactory: boolean;
  readonly note?: string;
};
export type UpdatePartyInput = {
  readonly partyId: string;
  readonly displayName?: string;
  readonly isSupplier?: boolean;
  readonly isFactory?: boolean;
  readonly note?: string;
};
