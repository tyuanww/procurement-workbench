import { expect, it } from 'vitest';
import * as followUp from '../../packages/application/src/follow-up/index.js';
import * as imports from '../../packages/application/src/imports/index.js';
import * as masterData from '../../packages/application/src/master-data/index.js';
import * as performance from '../../packages/application/src/performance/index.js';
import * as platform from '../../packages/application/src/platform/index.js';
import * as productArchive from '../../packages/application/src/product-archive/index.js';
import * as reporting from '../../packages/application/src/reporting/index.js';
import * as search from '../../packages/application/src/search/index.js';
import * as today from '../../packages/application/src/today/index.js';

function names(module: object, expected: readonly string[]) {
  expect(Object.keys(module).sort()).toEqual([...expected].sort());
}

it('platform、today、search 和 performance 的公开入口', () => {
  names(platform, ['makeListUsers', 'makeCreateUser', 'makeUpdateUser', 'makeGetSettings', 'makeUpdateSettings', 'makeListAuditEntries', 'makeGetFreshness']);
  names(today, ['makeGetToday']);
  names(search, ['makeSearchEverything']);
  names(performance, ['makeGetStuckBatches', 'makeGetSupplierPerformance', 'makeGetBuyerLoad', 'makeGetBuyerDrill', 'scopedSupplierIds', 'supplierEvents', 'supplierEventFigures']);
});

it('imports、reporting、product-archive 的用例名和 08 第 9 节一致', () => {
  names(imports, ['makeDetectImportFile', 'makeStartImport', 'makeSaveImportDecisions', 'makeCommitImport', 'makeDiscardImport', 'makeDiscardStaleImports', 'makeGetImportBatch', 'makeGetProcurementPreview', 'makeListImportBatches', 'makeListImportRows', 'makeGetImportTemplate']);
  names(reporting, ['makeGenerateWeeklyReport', 'makeExportWeeklyReport', 'makePublishWeeklyReportToFeishu', 'makeListWeeklyReports', 'makeGetWeeklyReport', 'makeManagementMeeting']);
  names(productArchive, ['makeListProducts', 'makeGetProductOverview', 'makeGetProductPurchases', 'makeGetProductStock', 'makeGetProductMaterials', 'makeUpdateProduct', 'makeAddProductImage', 'makeHideProductImage', 'makeUnhideProductImage', 'makeSetProductContacts']);
});

it('follow-up 和 master-data 的用例名和 08 第 9 节一致', () => {
  names(followUp, [
    'makeCreateLine', 'makeUpdateLine', 'makeCancelLine', 'makeReopenLine', 'makeAssignLines', 'makeCreateHintBatches', 'makeListLines', 'makeListLatestNotes', 'makeExportLines', 'makeGetLineDetail', 'makeGetLineTimeline', 'makeCreateBatch', 'makeUpdateBatch', 'makeDeleteBatch', 'makeCloseBatch', 'makeCancelBatch', 'makeReopenBatch', 'makeRecordShipment', 'makeRecordReceipt', 'makeRecordDeliveryNote', 'makeUndoRecord', 'makeVoidRecord', 'makeGetBatch', 'makeAddFollowUp', 'makeAddFollowUps', 'makeOpenException', 'makeCloseException', 'makeAdoptFactoryShipment', 'makeGenerateBatchesFromDemand', 'makeCreateLineFromInTransit',
    'makeExportConfirmedArrivals', 'makeListLineOwners', 'updateLockedBatch',
  ]);
  names(masterData, [
    'makeApproveAlias', 'makeRejectAlias', 'makeApproveCode', 'makeRejectCode', 'makeBulkCreateItems', 'makeApproveCodeLink', 'makeRejectCodeLink', 'makeResolveMultiName', 'makeLinkFactoryRow', 'makeCreateParty', 'makeUpdateParty', 'makeGetReviewCounts', 'makeListAliases', 'makeListCodes', 'makeListCodeLinks', 'makeListMultiName', 'makeListParties', 'makeGetPartyDetail', 'makeListItems', 'makeGetItem', 'makeListUnlinkedFactoryRows', 'makeListDemandRows', 'makeListCustomerSupplied',
  ]);
});
