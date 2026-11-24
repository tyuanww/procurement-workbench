import type { KpiFollowUp, KpiInput } from '@sw/domain';
import type { BuyerLoadDashboard, BuyerLoadQuery, PeriodQuery, StuckDashboard, StuckQuery, SupplierDashboard, SupplierQuery } from '../performance/views.js';

export type BatchLabel = {
  readonly seq: number;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly orderLineId: string | null;
};

/** 读模型只给事实。K1–K9 由用例调 D04，不在适配器里再算一遍。 */
export type PerformanceFacts = {
  readonly kpi: KpiInput;
  readonly followUps: readonly KpiFollowUp[];
  readonly partyNames: Readonly<Record<string, string>>;
  readonly buyerNames: Readonly<Record<string, string>>;
  readonly batchLabels: Readonly<Record<string, BatchLabel>>;
  /** 有 linked/manual 工厂关联的订单行。卡点 missing_factory 用。 */
  readonly linkedFactoryOrderLineIds: ReadonlySet<string>;
  /** 有未关闭异常的订单行。卡点 exception_open 用。 */
  readonly openExceptionOrderLineIds: ReadonlySet<string>;
  /** 工厂关联状态是 unlinked 的订单行。卡点 factory_demand_unlinked 用。 */
  readonly unlinkedFactoryOrderLineIds: ReadonlySet<string>;
  /** 采购单供应商原文命中待审核别名的订单行。卡点 supplier_pending 用。 */
  readonly pendingSupplierAliasOrderLineIds: ReadonlySet<string>;
  /** 条码对应产品存在、但该产品没有任何 BOM 行的订单行。卡点 bom_missing 用。 */
  readonly bomMissingOrderLineIds: ReadonlySet<string>;
};

export interface PerformanceReadModel {
  load(query: PeriodQuery): Promise<PerformanceFacts>;
  stuck(query: StuckQuery): Promise<StuckDashboard>;
  suppliers(query: SupplierQuery): Promise<SupplierDashboard>;
  buyers(query: BuyerLoadQuery): Promise<BuyerLoadDashboard>;
}
