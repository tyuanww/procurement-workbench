import { expect, it } from 'vitest';
import type { OrderLineDetail, OrderLineRow } from '../../packages/application/src/follow-up/boundary.js';
import type { BatchView } from '../../packages/application/src/follow-up/boundary.js';
import type { DetectResponse, ImportBatchSummary } from '../../packages/application/src/imports/boundary.js';
import type { ReviewCounts, MultiNameView } from '../../packages/application/src/master-data/boundary.js';
import type { StuckDashboard } from '../../packages/application/src/performance/boundary.js';
import type { FreshnessResponse } from '../../packages/application/src/platform/boundary.js';
import type { ProductCard, ProductMaterials, ProductOverview, ProductPurchases, ProductStock } from '../../packages/application/src/product-archive/boundary.js';
import type { WeeklyReport } from '../../packages/application/src/reporting/boundary.js';
import type { SearchResult } from '../../packages/application/src/search/boundary.js';
import type { TodayResponse } from '../../packages/application/src/today/boundary.js';

const lock = <T>() => <const F extends readonly (keyof T)[]>(
  fields: F & ([keyof T] extends [F[number]] ? F : never),
) => {
  expect(new Set(fields).size).toBe(fields.length);
};

const orderLineRowFields = [
  'id', 'lane', 'po', 'nameRaw', 'itemCodeRaw', 'barcodeRaw', 'supplier', 'factory', 'receiver', 'qtyOrdered', 'receivedQty', 'factoryDeliveredQty', 'stage', 'nextDue', 'daysInStage', 'buyer', 'statusReported', 'missingInLatestImport', 'latestImportPresence', 'openExceptionCount', 'origin', 'storeProgress',
] as const;

it('OrderLineRow 的字段和 05 第 4.3 节及管理店铺扩展一致', () => {
  lock<OrderLineRow>()(orderLineRowFields);
});

it('OrderLineDetail 的字段和 05 第 4.3 节及管理店铺扩展一致', () => {
  lock<OrderLineDetail>()(['pendingBuyerName', 'ownerUndo', 'line', 'po', 'codes', 'snapshot', 'batches', 'sourceFiles', 'archivedShipmentSources', 'batchDemandSources', 'factoryReports', 'exceptions', 'followUps', 'procurement', 'procurementSchedule']);
});

it('BatchView 含 02 第 3.6 节字段和 05 第 4.4 节附加字段', () => {
  lock<BatchView>()([
    'id', 'orderLineId', 'seq', 'plannedQty', 'receiverPartyId', 'dateFactoryRequired', 'dateSupplierPromised', 'dateBuyerConfirmed', 'firstConfirmedDate', 'confirmedBy', 'confirmedAt', 'status', 'statusChangedAt', 'origin', 'originRef', 'closedAt', 'closedReason', 'cancelledAt', 'cancelReason', 'shipments', 'hasUnavailableShipmentSource', 'receipts', 'deliveryNote', 'fulfillment', 'shippedQty', 'receivedQty', 'qtyVariance', 'noteStatus', 'overdueDays', 'daysInStage', 'dateChanges',
  ]);
});

it('ImportBatchSummary 和 DetectResponse 的字段和 05 第 4.6 节一致', () => {
  lock<ImportBatchSummary>()(['id', 'template', 'factoryParty', 'status', 'coverage', 'source', 'candidateKeyVersion', 'revision', 'file', 'fileMeta', 'hasProcurementPreview', 'procurementReplayOf', 'stats', 'issueGroups', 'ignoredSheets', 'decisions', 'unresolvedConflicts', 'createdBy', 'createdAt', 'committedBy', 'committedAt', 'error']);
  lock<DetectResponse>()(['fileId', 'candidates', 'requiresFactory', 'sheets']);
});

it('产品档案读模型和 05 第 4.10 节一致', () => {
  lock<ProductCard>()(['id', 'skuName', 'filingName', 'filingNo', 'barcodeRaw', 'isChannelVariant', 'netContent', 'casePack', 'thumbnail', 'packagingImages', 'openPurchaseLines', 'factoryStock', 'bomPartCount', 'materialLinkCoverage', 'contactsAssigned', 'ownerName']);
  lock<ProductOverview>()(['product', 'images', 'ownerName', 'contacts', 'cards', 'bomHeader', 'handlingHints']);
  lock<ProductPurchases>()(['scope', 'rows', 'inTransit', 'byStage', 'byReportedStatus']);
  lock<ProductStock>()(['ownWarehouse', 'factory']);
  lock<Extract<ProductMaterials, { readonly kind: 'no_bom' }>>()(['kind']);
  lock<Extract<ProductMaterials, { readonly coverage: unknown }>>()(['coverage', 'parts']);
});

it('周报、今日、搜索、看板、审核计数的顶层字段和 05 一致', () => {
  lock<WeeklyReport>()(['id', 'weekStart', 'weekEnd', 'generatedAt', 'generatedBy', 'supersededBy', 'dataWatermark', 'data']);
  lock<TodayResponse>()(['asOf', 'counts', 'items', 'pendingBatch', 'arrivalMemos', 'truncated']);
  lock<SearchResult>()(['lines', 'products', 'parties']);
  lock<StuckDashboard>()(['asOf', 'kpis', 'distribution', 'causeCounts', 'total', 'page', 'pageSize', 'items']);
  lock<ReviewCounts>()(['aliases', 'codes', 'links', 'multiName']);
  lock<MultiNameView>()(['codeId', 'codeRaw', 'names']);
});

it('来源状态保留原有来源并提供已生效采购总表的上传时间', () => {
  lock<FreshnessResponse>()(['sources', 'procurementUploadedAt']);
});
