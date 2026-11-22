import type { ImportAction, ImportCoverage, ImportIssue, LocalDate, PoFormat, TemplateId } from '@sw/domain';
import type { ProcurementPreview, ProcurementProjectDate } from './procurement-preview.js';
export type { ProcurementCellSource, ProcurementOaRef, ProcurementPreview, ProcurementSource } from './procurement-preview.js';

/** 快照字段同时留原文和解析值。解析不出时 value 为 null，不用 0。 */
export type ParsedCell<T> = {
  readonly raw: string | null;
  readonly value: T | null;
};

export type ParsedPo = {
  readonly poRaw: string | null;
  readonly poNorm: string | null;
  readonly poFormat: PoFormat;
  readonly relatedPoRaws: readonly string[];
};

export type ParsedRow<T> = {
  readonly sheetName: string;
  readonly rowNo: number;
  readonly issues: readonly ImportIssue[];
  readonly action: ImportAction | null;
  readonly targetId: string | null;
  readonly skipReason: string | null;
  readonly payload: T;
  /** 代工厂上报行的业务指纹。其它模板不填。 */
  readonly fingerprint?: string;
};

export type PoMasterPayload = {
  readonly oaDemandRef: ParsedCell<string>;
  readonly supplierRaw: ParsedCell<string>;
  readonly nameRaw: ParsedCell<string>;
  readonly barcodeRaw: ParsedCell<string>;
  readonly qtyOrdered: ParsedCell<number>;
  readonly oaSubmittedOn: ParsedCell<LocalDate>;
  readonly oaRequiredOn: ParsedCell<LocalDate>;
  readonly projectDates?: readonly ProcurementProjectDate[];
  readonly plannedDurationDays: ParsedCell<number>;
  readonly po: ParsedCell<ParsedPo>;
  readonly actualStartOn: ParsedCell<LocalDate>;
  readonly firstDeliveryOn: ParsedCell<LocalDate>;
  readonly actualEndOn: ParsedCell<LocalDate>;
  readonly actualDurationDays: ParsedCell<number>;
  readonly factoryStockReported: ParsedCell<number>;
  readonly shippedQtyReported: ParsedCell<number>;
  readonly qtyDiffReported: ParsedCell<number>;
  readonly statusReported: ParsedCell<string>;
  /** 可选列“采购负责人”。列不存在或空值时 value 为 null。 */
  readonly ownerRaw?: ParsedCell<string>;
  /** 可选列“工厂”。列不存在或空值时 value 为 null。 */
  readonly factoryRaw?: ParsedCell<string>;
};

export type InTransitPayload = {
  readonly po: ParsedCell<ParsedPo>;
  readonly nameRaw: ParsedCell<string>;
  readonly supplierRaw: ParsedCell<string>;
  readonly barcodeRaw: ParsedCell<string>;
  readonly orderedOn: ParsedCell<LocalDate>;
  readonly qtyRequired: ParsedCell<number>;
  readonly qtyDeliveredFactory: ParsedCell<number>;
  readonly qtyFactoryStock: ParsedCell<number>;
  readonly qtyUnproduced: ParsedCell<number>;
  readonly closedRaw: ParsedCell<string>;
  readonly itemCodeRaw: ParsedCell<string>;
  readonly materialPoRaws: ParsedCell<ParsedPo>;
  readonly buyerNameRaw: ParsedCell<string>;
  readonly extra: { readonly M: ParsedCell<string>; readonly O: ParsedCell<string> };
};

export type FactoryShipmentPayload = {
  readonly po: ParsedCell<ParsedPo>;
  readonly itemCodeRaw: ParsedCell<string>;
  readonly nameRaw: ParsedCell<string>;
  readonly lotRaw: ParsedCell<string>;
  readonly qty: ParsedCell<number>;
  readonly casePackRaw: ParsedCell<string>;
  readonly palletsRaw: ParsedCell<string>;
  readonly shipmentKindRaw: ParsedCell<string>;
  readonly shipOrArriveOn: ParsedCell<LocalDate>;
  readonly destinationRaw: ParsedCell<string>;
  readonly vehicleRaw: ParsedCell<string>;
  readonly note2Raw: ParsedCell<string>;
};

export type FactoryStockPayload = {
  readonly po: ParsedCell<ParsedPo>;
  readonly itemCodeRaw: ParsedCell<string>;
  readonly nameRaw: ParsedCell<string>;
  readonly lotRaw: ParsedCell<string>;
  readonly qtyOnHand: ParsedCell<number>;
  readonly palletsRaw: ParsedCell<string>;
  readonly coaOn: ParsedCell<LocalDate>;
  readonly producedOn: ParsedCell<LocalDate>;
  readonly inspectionRaw: ParsedCell<string>;
  readonly inspected: boolean | null;
};

export type ScheduleCellPayload = {
  readonly po: ParsedCell<ParsedPo>;
  readonly itemCodeRaw: ParsedCell<string>;
  readonly nameRaw: ParsedCell<string>;
  readonly monthRaw: ParsedCell<string>;
  readonly newOrOldRaw: ParsedCell<string>;
  readonly qtyRequiredTotal: ParsedCell<number>;
  readonly day: LocalDate;
  readonly qty: number | null;
  readonly stepRaw: string | null;
};

export type DemandSlot = {
  readonly index: number;
  readonly date: LocalDate | null;
  readonly dateRaw: string | null;
  readonly qty: number | null;
  readonly qtyRaw: string | null;
  readonly issues: readonly ImportIssue[];
};

export type MaterialDemandPayload = {
  readonly role: 'parent' | 'material';
  readonly blockPoRaw: string | null;
  readonly blockMaterialPoRaw: string | null;
  readonly blockLabelRaw: string | null;
  readonly itemCodeRaw: ParsedCell<string>;
  readonly nameRaw: ParsedCell<string>;
  readonly unitRaw: ParsedCell<string>;
  readonly qtyOnHand: ParsedCell<number>;
  readonly qtyFinishedEstimate: ParsedCell<number>;
  readonly qtyGross: ParsedCell<number>;
  readonly qtyNet: ParsedCell<number>;
  readonly slots: readonly DemandSlot[];
};

export type PackagingComboPayload = {
  readonly po: ParsedCell<ParsedPo>;
  readonly itemCodeRaw: ParsedCell<string>;
  readonly nameRaw: ParsedCell<string>;
  readonly specRaw: ParsedCell<string>;
  readonly qty: ParsedCell<number>;
  readonly comboSuppliersRaw: ParsedCell<string>;
  readonly bomCodeRaw: ParsedCell<string>;
  readonly materialPoRaw: ParsedCell<ParsedPo>;
};

export type CustomerSuppliedPayload = {
  readonly registeredOn: ParsedCell<LocalDate>;
  readonly seqRaw: ParsedCell<string>;
  readonly itemCodeRaw: ParsedCell<string>;
  readonly nameRaw: ParsedCell<string>;
  readonly lotRaw: ParsedCell<string>;
  readonly specKg: ParsedCell<number>;
  readonly pieces: ParsedCell<number>;
  readonly netQty: ParsedCell<number>;
  readonly expiresOn: ParsedCell<LocalDate>;
  readonly ownerNoteRaw: ParsedCell<string>;
};

export type ProductArchivePayload = {
  readonly filingName: ParsedCell<string>;
  readonly filingNo: ParsedCell<string>;
  readonly skuName: ParsedCell<string>;
  readonly barcodeRaw: ParsedCell<string>;
  readonly netContent: ParsedCell<string>;
  readonly casePack: ParsedCell<string>;
  readonly outerSize: ParsedCell<string>;
  readonly contactNameRaw: ParsedCell<string>;
};

export type BomPayload = {
  readonly productBarcodeRaw: string;
  readonly productName: string;
  readonly reorderCount: number | null;
  readonly cumulativeQty: number | null;
  readonly partCodeRaw: string;
  readonly partName: string;
  readonly mergedFill: boolean;
};

export type OwnerMapPayload = {
  /** 采购订单号原文；提交时再规范化，解析阶段只做展示和问题标注。 */
  readonly poRaw: string;
  /** 负责人姓名原文，匹配 users.name 精确匹配。 */
  readonly ownerNameRaw: string;
};

export type OwnerMapParsed = {
  readonly template: 'owner-map-v1';
  readonly coverage?: ImportCoverage;
  readonly candidateKeyVersion?: string;
  readonly rows: readonly ParsedRow<OwnerMapPayload>[];
};

export type ConfirmedArrivalPayload = {
  readonly batchId: string;
  readonly po: string | null;
  readonly name: string | null;
  readonly sequence: string | null;
  readonly warehouse: string | null;
  readonly exportedDate: ParsedCell<LocalDate>;
  readonly exportedReceiverPartyId: string | null;
  readonly exportedLineId: string | null;
  readonly date: ParsedCell<LocalDate>;
  readonly reason: string | null;
};

export type ConfirmedArrivalParsed = {
  readonly template: 'batch-confirmed-arrival-v1';
  readonly coverage?: ImportCoverage;
  readonly candidateKeyVersion?: string;
  readonly rows: readonly ParsedRow<ConfirmedArrivalPayload>[];
};

export type PoMasterParsed = {
  readonly template: 'po-master-v1';
  /** 由解析器声明，HTTP 请求不能覆盖。 */
  readonly coverage?: ImportCoverage;
  /** 候选键算法版本，供历史回算和审计定位。 */
  readonly candidateKeyVersion?: string;
  readonly rows: readonly (ParsedRow<PoMasterPayload> & { readonly comparedPayload?: PoMasterPayload })[];
  readonly procurement?: ProcurementPreview;
};

export type PendingCodeLink = {
  readonly fromCodeRaw: string;
  readonly toCodeRaw: string;
  readonly sheetName: string;
  readonly rowNo: number;
};

export type FactoryProgressParsed = {
  readonly template: 'factory-progress-v1';
  /** 工厂进度当前按整表快照处理。 */
  readonly coverage?: ImportCoverage;
  readonly candidateKeyVersion?: string;
  readonly ignoredSheets: readonly string[];
  readonly fileIssues: readonly ImportIssue[];
  readonly codeLinks: readonly PendingCodeLink[];
  readonly inTransit: readonly ParsedRow<InTransitPayload>[];
  readonly shipments: readonly ParsedRow<FactoryShipmentPayload>[];
  readonly stock: readonly ParsedRow<FactoryStockPayload>[];
  readonly schedule: readonly ParsedRow<ScheduleCellPayload>[];
  readonly demand: readonly ParsedRow<MaterialDemandPayload>[];
  readonly packagingCombo: readonly ParsedRow<PackagingComboPayload>[];
  readonly customerSupplied: readonly ParsedRow<CustomerSuppliedPayload>[];
};

export type ProductArchiveParsed = {
  readonly template: 'product-archive-v1';
  readonly coverage?: ImportCoverage;
  readonly candidateKeyVersion?: string;
  readonly rows: readonly ParsedRow<ProductArchivePayload>[];
};

export type BomParsed = {
  readonly template: 'bom-v1';
  readonly coverage?: ImportCoverage;
  readonly candidateKeyVersion?: string;
  readonly rows: readonly ParsedRow<BomPayload>[];
};

type DedicatedTemplate =
  | PoMasterParsed['template']
  | FactoryProgressParsed['template']
  | ProductArchiveParsed['template']
  | BomParsed['template']
  | OwnerMapParsed['template']
  | ConfirmedArrivalParsed['template'];

type AdditionalTemplateId = Exclude<TemplateId, DedicatedTemplate>;

export type AdditionalParsed = {
  readonly template: AdditionalTemplateId;
  readonly coverage?: ImportCoverage;
  readonly candidateKeyVersion?: string;
  readonly rows: readonly ParsedRow<unknown>[];
};

export type ParsedImport =
  | PoMasterParsed
  | FactoryProgressParsed
  | ProductArchiveParsed
  | BomParsed
  | OwnerMapParsed
  | ConfirmedArrivalParsed
  | ([AdditionalTemplateId] extends [never] ? never : AdditionalParsed);

export type ImportParseContext = {
  readonly uploadedAt: string;
  readonly factoryPartyId: string | null;
  /** 上传时选的代工厂名称。没有就不报 FACTORY_MISMATCH。 */
  readonly factoryNameRaw?: string | null;
  /** 不传就用默认合理日期范围。用例应从设置传入。 */
  readonly dateSanityRange?: { readonly from: LocalDate; readonly to: LocalDate };
};

/** diff 只拿比对键，不拿整库。键的算法在 03，不在这个类型里。 */
export type ImportExisting = {
  readonly poMaster: readonly { readonly candidateKey: string; readonly values: PoMasterPayload }[];
  readonly factoryFingerprints: readonly string[];
  readonly products: readonly {
    readonly barcodeRaw: string;
    readonly keptFields: readonly ('filingName' | 'filingNo' | 'skuName' | 'netContent' | 'casePack' | 'outerSize' | 'productLine')[];
  }[];
  readonly bomKeys: readonly { readonly productBarcodeRaw: string; readonly partCodeRaw: string }[];
};
