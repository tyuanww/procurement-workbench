import type {
  BatchDateChange,
  BomLine,
  DeliveryBatch,
  DeliveryNote,
  ExceptionRecord,
  CodeLink,
  FactoryReportRow,
  FollowUp,
  ImportBatch,
  ImportRow,
  Item,
  ItemCode,
  ItemName,
  OrderLine,
  Party,
  PartyAlias,
  Product,
  ProductContact,
  ProductImage,
  PurchaseOrder,
  Receipt,
  Settings,
  Shipment,
  User,
  WeeklyReport,
} from '@sw/domain';
import type { NameDecision } from '../../../application/src/ports/item-name-repository.js';
import type { AuditEntry } from '../../../application/src/ports/audit-log.js';
import type { StoredBlob } from '../../../application/src/ports/file-store.js';

export type StoredFile = {
  readonly meta: StoredBlob;
  readonly bytes: Uint8Array;
};

export type MemoryState = {
  users: Map<string, User>;
  settings: Settings | undefined;
  parties: Map<string, Party>;
  aliases: Map<string, PartyAlias>;
  items: Map<string, Item>;
  itemCodes: Map<string, ItemCode>;
  itemNames: Map<string, ItemName>;
  nameDecisions: Map<string, Exclude<NameDecision, 'undecided'>>;
  codeLinks: Map<string, CodeLink>;
  purchaseOrders: Map<string, PurchaseOrder>;
  orderLines: Map<string, OrderLine>;
  reportedStatuses: Map<string, string>;
  batches: Map<string, DeliveryBatch>;
  shipments: Map<string, Shipment>;
  receipts: Map<string, Receipt>;
  deliveryNotes: Map<string, DeliveryNote>;
  dateChanges: Map<string, BatchDateChange>;
  exceptions: Map<string, ExceptionRecord>;
  followUps: Map<string, FollowUp>;
  factoryReports: Map<string, FactoryReportRow>;
  imports: Map<string, ImportBatch>;
  importRows: Map<string, ImportRow>;
  products: Map<string, Product>;
  productImages: Map<string, ProductImage>;
  productContacts: Map<string, ProductContact[]>;
  bomLines: Map<string, BomLine[]>;
  weeklyReports: Map<string, WeeklyReport>;
  audit: AuditEntry[];
  files: Map<string, StoredFile>;
};

export function emptyState(): MemoryState {
  return {
    users: new Map(),
    settings: undefined,
    parties: new Map(),
    aliases: new Map(),
    items: new Map(),
    itemCodes: new Map(),
    itemNames: new Map(),
    nameDecisions: new Map(),
    codeLinks: new Map(),
    purchaseOrders: new Map(),
    orderLines: new Map(),
    reportedStatuses: new Map(),
    batches: new Map(),
    shipments: new Map(),
    receipts: new Map(),
    deliveryNotes: new Map(),
    dateChanges: new Map(),
    exceptions: new Map(),
    followUps: new Map(),
    factoryReports: new Map(),
    imports: new Map(),
    importRows: new Map(),
    products: new Map(),
    productImages: new Map(),
    productContacts: new Map(),
    bomLines: new Map(),
    weeklyReports: new Map(),
    audit: [],
    files: new Map(),
  };
}

export function cloneState(state: MemoryState): MemoryState {
  return structuredClone(state);
}
