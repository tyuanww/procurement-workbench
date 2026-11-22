import {
  localDate,
  type BatchDateChange,
  type DeliveryBatch,
  type DeliveryNote,
  type ExceptionRecord,
  type FactoryReportRow,
  type FollowUp,
  type Item,
  type OrderLine,
  type Party,
  type Product,
  type PurchaseOrder,
  type Receipt,
  type Role,
  type Shipment,
  type User,
} from '@sw/domain';
import type { Actor } from '../../application/src/shared/actor.js';
import { deliveryBatchId, entityId, orderLineId, productId } from './ids.js';

const AT = '2026-10-12T00:00:00.000Z';
let sequence = 1;

function nextId(): string {
  const id = `builder-${sequence}`;
  sequence += 1;
  return id;
}

function meta<Id extends ReturnType<typeof entityId>>(id: Id) {
  return { id, createdAt: AT, updatedAt: AT };
}

export function aUser(overrides: Partial<User> = {}): User {
  return { ...meta(entityId(nextId())), name: '样例采购员', roles: ['buyer'], feishuOpenId: null, active: true, ...overrides };
}

export function anActor(role: Role): Actor {
  const user = aUser({ roles: [role] });
  return { id: user.id, name: user.name, roles: user.roles };
}

export function aParty(overrides: Partial<Party> = {}): Party {
  return { ...meta(entityId(nextId())), displayName: '宜侬', isSupplier: true, isFactory: true, isOwnWarehouse: false, note: null, ...overrides };
}

export function anItem(overrides: Partial<Item> = {}): Item {
  return { ...meta(entityId(nextId())), displayName: '海葡萄水光冰冰贴', kind: 'finished', spec: null, sharedCodeFlag: false, ...overrides };
}

export function aPurchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    ...meta(entityId(nextId())),
    poRaw: 'PO202610120001',
    poNorm: 'PO202610120001',
    poFormat: 'PO14',
    relatedPoRaws: [],
    supplierPartyId: null,
    supplierRaw: '宜侬',
    lane: 'finished',
    oaDemandRef: null,
    ...overrides,
  };
}

export function anOrderLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    ...meta(orderLineId(nextId())),
    purchaseOrderId: entityId('po-1'),
    lane: 'finished',
    itemId: null,
    itemCodeRaw: null,
    barcodeRaw: null,
    nameRaw: '海葡萄水光冰冰贴',
    qtyOrdered: null,
    unit: null,
    buyerUserId: null,
    receiverPartyId: null,
    origin: 'manual',
    currentSnapshotId: null,
    candidateKey: null,
    missingInLatestImport: false,
    latestImportPresence: 'not_applicable',
    cancelledAt: null,
    cancelReason: null,
    stage: 'no_batch',
    stageChangedAt: AT,
    nextDueBatchId: null,
    nextDueDate: null,
    ...overrides,
  };
}

export function aFollowUp(overrides: Partial<FollowUp> = {}): FollowUp {
  return { ...meta(entityId(nextId())), orderLineId: orderLineId('line-1'), batchId: null, kind: 'note', text: '已电话', partyId: null, createdBy: entityId('user-1'), ...overrides };
}

export function anException(overrides: Partial<ExceptionRecord> = {}): ExceptionRecord {
  return {
    ...meta(entityId(nextId())),
    orderLineId: orderLineId('line-1'),
    batchId: null,
    type: 'delay',
    note: '工厂排产延后',
    status: 'open',
    openedBy: entityId('user-1'),
    closedBy: null,
    closedAt: null,
    closeNote: null,
    ...overrides,
  };
}

export function aProduct(overrides: Partial<Product> = {}): Product {
  return {
    ...meta(productId(nextId())),
    barcodeRaw: '2000000003023',
    barcodeBase: '2000000003023',
    filingName: null,
    spuKey: null,
    filingNo: null,
    skuName: '海葡萄水光冰冰贴',
    netContent: null,
    casePack: null,
    outerSize: null,
    productLine: null,
    fieldSources: {},
    importBatchId: null,
    rowNo: null,
    editedBy: null,
    editedAt: null,
    ...overrides,
  };
}

export function aFactoryStockRow(overrides: Partial<FactoryReportRow> = {}): FactoryReportRow {
  return {
    id: entityId(nextId()),
    importBatchId: entityId('import-1'),
    factoryPartyId: entityId('factory-1'),
    sheetName: '库存数量汇总',
    rowNo: 2,
    raw: { nameRaw: '海葡萄水光冰冰贴' },
    fingerprint: nextId(),
    linkedOrderLineId: null,
    linkStatus: 'unlinked',
    linkReason: null,
    kind: 'stock',
    shipment: null,
    demand: null,
    inTransit: null,
    ...overrides,
  };
}

type BatchDraft = {
  confirmed: ReturnType<typeof localDate> | null;
  shipments: Shipment[];
  receipts: Receipt[];
  deliveryNote: DeliveryNote | null;
  dateChanges: BatchDateChange[];
};

export function aBatch() {
  const draft: BatchDraft = { confirmed: null, shipments: [], receipts: [], deliveryNote: null, dateChanges: [] };
  const api = {
    confirmedOn(date: string) {
      draft.confirmed = localDate(date);
      return api;
    },
    withShipment(qty: number) {
      draft.shipments.push(shipment(qty));
      return api;
    },
    withReceipt(qty: number) {
      draft.receipts.push(receipt(qty));
      return api;
    },
    withDeliveryNote() {
      draft.deliveryNote = note();
      return api;
    },
    build(): DeliveryBatch {
      return builtBatch(draft.confirmed);
    },
    records() {
      return {
        shipments: draft.shipments.map((row) => ({ ...row })),
        receipts: draft.receipts.map((row) => ({ ...row })),
        deliveryNote: draft.deliveryNote === null ? null : { ...draft.deliveryNote },
        dateChanges: draft.dateChanges.map((row) => ({ ...row })),
      };
    },
  };
  return api;
}

function builtBatch(confirmed: ReturnType<typeof localDate> | null): DeliveryBatch {
  return {
    ...meta(deliveryBatchId(nextId())),
    orderLineId: orderLineId('line-1'),
    seq: 1,
    plannedQty: 1,
    receiverPartyId: entityId('receiver-1'),
    dateFactoryRequired: null,
    dateSupplierPromised: null,
    dateBuyerConfirmed: confirmed,
    firstConfirmedDate: confirmed,
    confirmedBy: confirmed === null ? null : entityId('user-1'),
    confirmedAt: confirmed === null ? null : AT,
    status: confirmed === null ? 'awaiting_date' : 'confirmed',
    statusChangedAt: AT,
    origin: 'manual',
    originRef: null,
    closedAt: null,
    closedReason: null,
    cancelledAt: null,
    cancelReason: null,
  };
}

function shipment(qty: number): Shipment {
  return { ...meta(entityId(nextId())), batchId: deliveryBatchId('batch-1'), qty, shippedOn: localDate('2026-10-12'), source: 'manual', factoryShipmentRowId: null, note: null, createdBy: entityId('user-1'), voidedAt: null, voidedBy: null, voidReason: null };
}

function receipt(qty: number): Receipt {
  return { ...meta(entityId(nextId())), batchId: deliveryBatchId('batch-1'), qty, receivedOn: localDate('2026-10-12'), category: 'finished', source: 'workbench', note: null, createdBy: entityId('user-1'), voidedAt: null, voidedBy: null, voidReason: null };
}

function note(): DeliveryNote {
  return { ...meta(entityId(nextId())), batchId: deliveryBatchId('batch-1'), status: 'returned', returnedOn: localDate('2026-10-12'), verifiedOn: null, fileId: null, note: null, createdBy: entityId('user-1'), voidedAt: null, voidedBy: null, voidReason: null };
}
