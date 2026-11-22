import type { AuditLog } from './audit-log.js';
import type { BomLineRepository } from './bom-line-repository.js';
import type { CodeLinkRepository } from './code-link-repository.js';
import type { DeliveryBatchRepository } from './delivery-batch-repository.js';
import type { ExceptionRepository } from './exception-repository.js';
import type { FactoryReportRepository } from './factory-report-repository.js';
import type { FollowUpRepository } from './follow-up-repository.js';
import type { ImportBatchRepository } from './import-batch-repository.js';
import type { ItemCodeRepository } from './item-code-repository.js';
import type { ItemNameRepository } from './item-name-repository.js';
import type { ItemRepository } from './item-repository.js';
import type { OrderLineRepository } from './order-line-repository.js';
import type { PartyAliasRepository } from './party-alias-repository.js';
import type { PartyRepository } from './party-repository.js';
import type { ProductContactRepository } from './product-contact-repository.js';
import type { ProductImageRepository } from './product-image-repository.js';
import type { ProductRepository } from './product-repository.js';
import type { ProcurementRepository } from './procurement-repository.js';
import type { PurchaseOrderRepository } from './purchase-order-repository.js';
import type { SettingsRepository } from './settings-repository.js';
import type { UserRepository } from './user-repository.js';
import type { WeeklyReportRepository } from './weekly-report-repository.js';
import type { OwnerAssignmentRepository } from './owner-assignment-repository.js';
import type { LineFactoryLinkRepository } from './factory-link-repository.js';

export interface UnitOfWorkStores {
  readonly users: UserRepository;
  readonly settings: SettingsRepository;
  readonly parties: PartyRepository;
  readonly aliases: PartyAliasRepository;
  readonly items: ItemRepository;
  readonly itemCodes: ItemCodeRepository;
  readonly itemNames: ItemNameRepository;
  readonly codeLinks: CodeLinkRepository;
  readonly purchaseOrders: PurchaseOrderRepository;
  readonly orderLines: OrderLineRepository;
  readonly batches: DeliveryBatchRepository;
  readonly exceptions: ExceptionRepository;
  readonly followUps: FollowUpRepository;
  readonly factoryReports: FactoryReportRepository;
  readonly imports: ImportBatchRepository;
  readonly procurement?: ProcurementRepository;
  readonly products: ProductRepository;
  readonly productImages: ProductImageRepository;
  readonly productContacts: ProductContactRepository;
  readonly bomLines: BomLineRepository;
  readonly weeklyReports: WeeklyReportRepository;
  readonly audit: AuditLog;
  /** P1 负责人归属；旧组合没接线时由用例给出明确错误。 */
  readonly ownerAssignments?: OwnerAssignmentRepository;
  /** P2 订单行到代工厂的当前关联；旧组合没接线时由用例给出明确错误。 */
  readonly factoryLinks?: LineFactoryLinkRepository;
}

export interface UnitOfWork<TStores extends UnitOfWorkStores = UnitOfWorkStores> {
  /** `fn` 抛错则本次写入全部回滚。 */
  run<T>(fn: (stores: TStores) => Promise<T>): Promise<T>;
}
