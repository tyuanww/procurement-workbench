import type { EntityId, EntityMeta, IsoInstant } from './entity-meta.js';
import type { DeliveryBatchId, OrderLineId, ProductId } from '../values/ids.js';
import type { LocalDate } from '../values/local-date.js';
import type { Provenance } from '../values/provenance.js';
import type {
  CodeType,
  ExceptionStatus,
  ExceptionType,
  FieldSource,
  FollowUpKind,
  ImageSlot,
  ImageSource,
  ImportAction,
  ImportStatus,
  IssueCode,
  IssueSeverity,
  ItemKind,
  LinkStatus,
  ProductContactRole,
  ReviewStatus,
  Role,
  TemplateId,
} from '../vocabulary/index.js';

export type User = EntityMeta & {
  readonly name: string;
  readonly roles: readonly Role[];
  readonly feishuOpenId: string | null;
  readonly active: boolean;
};

export type Party = EntityMeta & {
  readonly displayName: string;
  readonly isSupplier: boolean;
  readonly isFactory: boolean;
  readonly isOwnWarehouse: boolean;
  readonly note: string | null;
};

export type PartyAlias = EntityMeta & {
  readonly rawName: string;
  readonly normName: string;
  readonly partyId: EntityId | null;
  readonly status: ReviewStatus;
  readonly firstSeenImportBatchId: EntityId | null;
  readonly seenCount: number;
  /** 同一别名出现过的导入批次数。兼容旧库时为空。 */
  readonly seenBatchCount?: number;
  readonly reviewedBy: EntityId | null;
  readonly reviewedAt: IsoInstant | null;
};

export type Item = EntityMeta & {
  readonly displayName: string;
  readonly kind: ItemKind;
  readonly spec: string | null;
  readonly sharedCodeFlag: boolean;
};

export type ItemCode = EntityMeta & {
  readonly codeType: CodeType;
  readonly codeRaw: string;
  readonly codeNorm: string;
  readonly itemId: EntityId | null;
  readonly status: ReviewStatus;
};

export type ItemName = {
  readonly itemId: EntityId;
  readonly nameRaw: string;
  readonly nameNorm: string;
  readonly seenCount: number;
};

export type CodeLink = EntityMeta & {
  readonly fromCodeId: EntityId;
  readonly toCodeId: EntityId;
  readonly status: ReviewStatus;
  readonly evidence: unknown;
  readonly reviewedBy: EntityId | null;
  readonly reviewedAt: IsoInstant | null;
};

export type FollowUp = EntityMeta & {
  readonly orderLineId: OrderLineId;
  readonly batchId: DeliveryBatchId | null;
  readonly kind: FollowUpKind;
  readonly text: string;
  readonly nextFollowUpAt?: IsoInstant | null;
  readonly partyId: EntityId | null;
  readonly createdBy: EntityId;
};

export type ExceptionRecord = EntityMeta & {
  readonly orderLineId: OrderLineId;
  readonly batchId: DeliveryBatchId | null;
  readonly type: ExceptionType;
  readonly note: string;
  readonly status: ExceptionStatus;
  readonly openedBy: EntityId;
  readonly closedBy: EntityId | null;
  readonly closedAt: IsoInstant | null;
  readonly closeNote: string | null;
};

export type Product = EntityMeta<ProductId> & {
  readonly barcodeRaw: string;
  readonly barcodeBase: string;
  readonly filingName: string | null;
  readonly spuKey: string | null;
  readonly filingNo: string | null;
  readonly skuName: string;
  readonly netContent: string | null;
  readonly casePack: string | null;
  readonly outerSize: string | null;
  readonly productLine: string | null;
  readonly fieldSources: Readonly<Record<string, FieldSource>>;
  readonly workbookFieldSources?: Readonly<Record<string, Extract<Provenance, { readonly kind: 'product_workbook' }>>>;
  readonly importBatchId: EntityId | null;
  readonly rowNo: number | null;
  readonly editedBy: EntityId | null;
  readonly editedAt: IsoInstant | null;
};

export type ProductImage = {
  readonly id: EntityId;
  readonly productId: ProductId;
  readonly slot: ImageSlot;
  readonly fileId: EntityId;
  readonly order: number;
  readonly source: ImageSource;
  readonly importBatchId: EntityId | null;
  readonly uploadedBy: EntityId | null;
  readonly hiddenAt: IsoInstant | null;
  readonly hiddenBy: EntityId | null;
  readonly hiddenReason: string | null;
};

export type ProductContact = {
  readonly productId: ProductId;
  readonly role: ProductContactRole;
  readonly userId: EntityId | null;
  readonly nameRaw: string | null;
  readonly note: string | null;
  readonly source: FieldSource;
  readonly updatedBy: EntityId;
  readonly updatedAt: IsoInstant;
};

export type BomLine = {
  readonly productBarcodeRaw: string;
  readonly productName: string;
  readonly reorderCount: number | null;
  readonly cumulativeQty: number | null;
  readonly partCodeRaw: string;
  readonly partName: string;
  readonly importBatchId: EntityId;
  readonly rowNo: number;
  readonly mergedFill: boolean;
};

export type ImportIssue = {
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  readonly column: string | null;
  readonly message: string;
  readonly raw: string | null;
};

export type ImportBatch = EntityMeta & {
  /** 乐观并发版本。旧数据缺失时按 0 读取。 */
  readonly revision?: number;
  /** 覆盖范围。旧批次缺失时按 full_snapshot 兼容读取。 */
  readonly coverage?: import('../imports.js').ImportCoverage;
  /** 代工厂快照的稳定来源分区。非快照导入为空。 */
  readonly sourceKey?: string | null;
  /** 同一来源文件的内容指纹。重复提交不得重复累计。 */
  readonly sourceFingerprint?: string | null;
  /** 快照生效时间，优先取源文件修改时间。 */
  readonly effectiveAt?: IsoInstant | null;
  /** 被后续同来源快照退休的时间。 */
  readonly supersededAt?: IsoInstant | null;
  readonly fileId: EntityId;
  readonly template: TemplateId;
  readonly factoryPartyId: EntityId | null;
  readonly status: ImportStatus;
  readonly fileMeta: unknown;
  readonly stats: unknown;
  readonly decisions: unknown;
  readonly createdBy: EntityId;
  readonly committedBy: EntityId | null;
  readonly committedAt: IsoInstant | null;
  readonly rolledBackBy: EntityId | null;
  readonly rolledBackAt: IsoInstant | null;
  readonly error: string | null;
};

export type ImportRow = {
  readonly id: EntityId;
  readonly importBatchId: EntityId;
  readonly sheetName: string;
  readonly rowNo: number;
  readonly raw: unknown;
  readonly parsed: unknown;
  readonly issues: readonly ImportIssue[];
  readonly action: ImportAction;
  readonly targetId: EntityId | null;
  readonly skipReason: string | null;
};

export type StoredFile = EntityMeta & {
  readonly sha256: string;
  readonly originalName: string;
  readonly size: number;
  readonly mime: string;
  readonly storedPath: string;
  readonly uploadedBy: EntityId;
};

export type FactoryReportKind =
  | 'in_transit'
  | 'shipment'
  | 'stock'
  | 'schedule'
  | 'demand'
  | 'packaging_combo'
  | 'customer_supplied';

export type FactoryShipmentFacts = {
  readonly qty: number | null;
  readonly shipOrArriveOn: LocalDate | null;
};

export type FactoryDemandSlot = {
  readonly index: number;
  readonly date: LocalDate | null;
  readonly qty: number | null;
};

export type FactoryDemandFacts = {
  readonly role: 'parent' | 'material';
  readonly blockMaterialPoRaw: string | null;
  /** 从采购单原文解析出的规范单号。没有解析结果就是 null，不在关联时再猜。 */
  readonly poNorm: string | null;
  readonly itemCodeRaw: string | null;
  readonly nameRaw: string | null;
  readonly slots: readonly FactoryDemandSlot[];
};

export type FactoryInTransitFacts = {
  readonly poRaw: string | null;
  readonly poNorm: string | null;
  readonly nameRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly barcodeRaw: string | null;
  readonly qtyRequired: number | null;
};

export type FactoryReportRow = {
  readonly id: EntityId;
  readonly importBatchId: EntityId;
  readonly factoryPartyId: EntityId;
  readonly sheetName: string;
  readonly rowNo: number;
  readonly raw: unknown;
  readonly fingerprint: string;
  readonly linkedOrderLineId: OrderLineId | null;
  readonly linkStatus: LinkStatus;
  readonly linkReason: string | null;
  readonly kind: FactoryReportKind;
  readonly shipment: FactoryShipmentFacts | null;
  readonly demand: FactoryDemandFacts | null;
  readonly inTransit: FactoryInTransitFacts | null;
};

export type WeeklyReport = EntityMeta & {
  readonly weekStart: LocalDate;
  readonly generatedAt: IsoInstant;
  readonly generatedBy: EntityId;
  readonly data: unknown;
  readonly dataWatermark: unknown;
  readonly exports: unknown;
  readonly supersededBy: EntityId | null;
};

export type AuditLog = {
  readonly id: EntityId;
  readonly actorUserId: EntityId;
  readonly action: string;
  readonly entity: string;
  readonly entityId: EntityId;
  readonly before: unknown;
  readonly after: unknown;
  readonly at: IsoInstant;
};

/** 负责人来源：采购总表可选列、映射导入（含待审核名字的解决）、工作台手工。 */
export type OwnerAssignmentSource = 'po_master' | 'mapping_import' | 'manual';

/** assigned 的人才算已归属；pending 是名字没匹配上、等人工处理的队列。 */
export type OwnerAssignmentStatus = 'assigned' | 'pending';

/**
 * 订单行负责人的一次生效记录。supersededAt 为空的是当前记录；
 * 重新指派只追加历史，不删除旧记录。ownerUserId 为空只出现在 pending（名字暂时匹配不上）。
 */
export type OwnerAssignment = EntityMeta & {
  readonly subjectType: 'order_line';
  readonly subjectId: OrderLineId;
  readonly ownerUserId: EntityId | null;
  readonly ownerNameRaw: string | null;
  readonly status: OwnerAssignmentStatus;
  readonly source: OwnerAssignmentSource;
  readonly sourceRef: EntityId | null;
  readonly effectiveAt: IsoInstant;
  readonly supersededAt: IsoInstant | null;
};

/** 订单行到代工厂的关联状态。unlinked 一定带 reason，不返回假 0。 */
export type LineFactoryLinkStatus = 'linked' | 'unlinked' | 'manual';

export type LineFactoryLinkSource = 'po_master' | 'factory_progress' | 'relink' | 'manual';

/** 匹配依据，按优先级从高到低：po、item_code、barcode、column（导入可选列）、manual、none。 */
export type LineFactoryMatchBasis = 'po' | 'item_code' | 'barcode' | 'column' | 'manual' | 'none';

/** 订单行的当前代工厂关联。一个订单行只有一条，重跑关联就地更新。 */
export type LineFactoryLink = EntityMeta & {
  readonly orderLineId: OrderLineId;
  readonly factoryPartyId: EntityId | null;
  readonly status: LineFactoryLinkStatus;
  readonly source: LineFactoryLinkSource;
  readonly confidence: LineFactoryMatchBasis;
  readonly poRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly barcodeRaw: string | null;
  readonly reason: string | null;
  readonly linkedAt: IsoInstant;
};
