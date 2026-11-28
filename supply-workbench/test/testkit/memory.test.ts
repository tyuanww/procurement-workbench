import type { ImportTemplate } from '../../packages/application/src/ports/import-template.js';
import type { WorkbookLike } from '../../packages/application/src/ports/workbook-reader.js';
import type { ParsedImport } from '../../packages/application/src/ports/parsed-rows.js';
import { entityId, localDate, type ItemCode } from '../../packages/domain/src/index.js';
import {
  aBatch,
  createMemory,
  describeDeliveryBatchRepositoryContract,
  describeExceptionRepositoryContract,
  describeFactoryReportRepositoryContract,
  describeFileStoreContract,
  describeFollowUpRepositoryContract,
  describeImportBatchRepositoryContract,
  describeImportTemplateContract,
  describeItemRepositoryContract,
  describeOrderLineRepositoryContract,
  describePartyRepositoryContract,
  describeProductRepositoryContract,
  describePurchaseOrderRepositoryContract,
  describeSettingsRepositoryContract,
  describeUnitOfWorkContract,
  describeUserRepositoryContract,
  describeWeeklyReportRepositoryContract,
  FixedClock,
  SequentialIds,
  aFactoryStockRow,
  aFollowUp,
  aParty,
  aProduct,
  aPurchaseOrder,
  aUser,
  anActor,
  anException,
  anItem,
  anOrderLine,
} from '../../packages/testkit/src/index.js';
import { expect, it } from 'vitest';

const memory = () => createMemory();

describeUserRepositoryContract(() => memory().stores.users);
describePartyRepositoryContract(() => memory().stores.parties);
describeItemRepositoryContract(() => memory().stores.items);
describePurchaseOrderRepositoryContract(() => memory().stores.purchaseOrders);
describeOrderLineRepositoryContract(() => memory().stores.orderLines);
describeExceptionRepositoryContract(() => memory().stores.exceptions);
describeFollowUpRepositoryContract(() => memory().stores.followUps);
describeFactoryReportRepositoryContract(() => memory().stores.factoryReports);
describeImportBatchRepositoryContract(() => memory().stores.imports);
describeProductRepositoryContract(() => memory().stores.products);
describeSettingsRepositoryContract(() => memory().stores.settings);
describeDeliveryBatchRepositoryContract(() => memory().stores.batches);
describeWeeklyReportRepositoryContract(() => memory().stores.weeklyReports);
describeFileStoreContract(() => memory().files);
describeUnitOfWorkContract(() => {
  const created = memory();
  return {
    ...created.unitOfWork,
    readUser: (id) => created.stores.users.find(id),
    auditCount: () => created.box.current.audit.length,
  };
});

describeImportTemplateContract(proofTemplate(), {
  ownFile: book('own.csv'),
  foreignFile: book('other.csv'),
});

it('固定时钟按上海时区给业务日，advance 往后推', () => {
  const clock = new FixedClock('2026-10-11T15:30:00.000Z');
  expect(clock.today()).toBe(localDate('2026-10-11'));
  clock.advance(3600);
  expect(clock.today()).toBe(localDate('2026-10-12'));
});

it('顺序 id 不重复', () => {
  const ids = new SequentialIds();
  expect(ids.next()).not.toBe(ids.next());
});

it('登记新编码时保留实际编码与已审核状态，拒绝将既有 ID 分给另一个编码', async () => {
  const codes = memory().stores.itemCodes;
  const at = '2026-10-11T15:30:00.000Z';
  const recorded: ItemCode = {
    id: entityId('existing-code'), createdAt: at, updatedAt: at, codeType: 'pack_30',
    codeRaw: '30000093', codeNorm: '30000093', status: 'approved', itemId: entityId('approved-item'),
  };
  await codes.save(recorded);
  await expect(codes.insertIfAbsent({ ...recorded, id: entityId('attempted-code'), status: 'pending', itemId: null })).resolves.toBe(recorded.id);
  await expect(codes.insertIfAbsent({ ...recorded, codeRaw: '30000094', codeNorm: '30000094' })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  expect(await codes.get(recorded.id)).toEqual(recorded);
});

it('构建器两次调用不共享对象', () => {
  expect(aUser()).not.toBe(aUser());
  expect(anActor('buyer').roles).toEqual(['buyer']);
  expect(aParty().isFactory).toBe(true);
  expect(anItem().kind).toBe('finished');
  expect(aPurchaseOrder().lane).toBe('finished');
  expect(anOrderLine().origin).toBe('manual');
  expect(aFollowUp().kind).toBe('note');
  expect(anException().type).toBe('delay');
  expect(aProduct().skuName).toBe('海葡萄水光冰冰贴');
  expect(aFactoryStockRow().sheetName).toBe('库存数量汇总');
  const built = aBatch().withShipment(2).withReceipt(1).withDeliveryNote().confirmedOn('2026-10-01');
  expect(built.build().status).toBe('confirmed');
  expect(built.records().shipments).toHaveLength(1);
  expect(aBatch().records().shipments).toHaveLength(0);
});

function book(name: string): WorkbookLike {
  return { source: { kind: 'csv', fileName: name }, date1904: false, sheets: [] };
}

function proofTemplate(): ImportTemplate {
  return {
    requiresFactory: false,
    identityOf() {
      return [];
    },
    existingFrom() {
      return { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };
    },
    factsOf() {
      return { ignoredSheets: [], codeLinks: [] };
    },
    id: 'po-master-v1',
    detect(file) {
      return file.source.fileName === 'own.csv' ? { score: 1, reasons: ['表头'] } : { score: 0, reasons: [] };
    },
    parse(): ParsedImport {
      return {
        template: 'po-master-v1',
        rows: [{
          sheetName: '总表',
          rowNo: 2,
          issues: [{ code: 'DATE_NO_YEAR', severity: 'warning', column: '首批交付', message: '没有年份', raw: '7月30日' }],
          action: null,
          targetId: null,
          skipReason: null,
          payload: emptyPoPayload(),
        }],
      };
    },
    diff(parsed, existing) {
      if (parsed.template !== 'po-master-v1') return parsed;
      const keys = new Set(existing.poMaster.map((row) => row.candidateKey));
      return {
        ...parsed,
        rows: parsed.rows.map((row) => ({ ...row, action: keys.has(`${row.sheetName}:${row.rowNo}`) ? 'unchanged' : 'create' })),
      };
    },
  };
}

function emptyPoPayload(): Extract<ParsedImport, { template: 'po-master-v1' }>['rows'][number]['payload'] {
  const text = { raw: null, value: null };
  const qty = { raw: null, value: null };
  const date = { raw: null, value: null };
  return {
    oaDemandRef: text,
    supplierRaw: text,
    nameRaw: text,
    barcodeRaw: text,
    qtyOrdered: qty,
    oaSubmittedOn: date,
    oaRequiredOn: date,
    plannedDurationDays: qty,
    po: { raw: null, value: null },
    actualStartOn: date,
    firstDeliveryOn: date,
    actualEndOn: date,
    actualDurationDays: qty,
    factoryStockReported: qty,
    shippedQtyReported: qty,
    qtyDiffReported: qty,
    statusReported: text,
  };
}
