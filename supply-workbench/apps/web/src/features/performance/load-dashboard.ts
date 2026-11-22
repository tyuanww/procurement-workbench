import {
  BuyerLoadDashboardSchema,
  SupplierDashboardSchema,
  type BuyerLoadRow,
  type ProjectProgress,
  type SupplierKpiRow,
} from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { apiGet } from '../../shared/api/client.js';
import { read } from '../../shared/api/reads.js';
import type { BuyerInput } from './model/buyers.js';
import type { DashboardLane } from './model/query.js';
import type { SupplierInput, WeekInput } from './model/suppliers.js';

export type LoadDashboardInput = {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly lane: DashboardLane;
};

export type DashboardLoad = {
  readonly suppliers: readonly SupplierInput[];
  readonly supplierUnassigned?: ReturnType<typeof SupplierDashboardSchema.parse>['unassigned'];
  readonly buyers: readonly BuyerInput[];
  readonly buyerLane: DashboardLane;
  readonly project: ProjectProgress;
  readonly unassignedExceptions: number | null;
};

export async function loadDashboard(input: LoadDashboardInput): Promise<DashboardLoad> {
  const query = apiQuery(input);
  const [suppliers, buyers, project] = await Promise.all([
    apiGet(`/api/v1/dashboard/suppliers?${query}`, SupplierDashboardSchema),
    apiGet(`/api/v1/dashboard/buyers?${query}`, BuyerLoadDashboardSchema),
    read({ name: 'planProgress', from: input.from, to: input.to }),
  ]);
  return toLoad({ suppliers: suppliers.rows, supplierUnassigned: suppliers.unassigned, buyers: buyers.rows, buyerLane: input.lane, project, unassignedExceptions: buyers.unassignedExceptions });
}

function apiQuery(input: LoadDashboardInput): string {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.lane !== 'all') params.set('lane', input.lane);
  return params.toString();
}

function toLoad(input: {
  readonly suppliers: readonly SupplierKpiRow[];
  readonly supplierUnassigned?: ReturnType<typeof SupplierDashboardSchema.parse>['unassigned'];
  readonly buyers: readonly BuyerLoadRow[];
  readonly buyerLane: DashboardLane;
  readonly project: ProjectProgress;
  readonly unassignedExceptions: number | null;
}): DashboardLoad {
  return {
    suppliers: input.suppliers.map(supplierInput),
    supplierUnassigned: input.supplierUnassigned,
    buyers: input.buyers.map(buyerInput),
    buyerLane: input.buyerLane,
    project: input.project,
    unassignedExceptions: input.unassignedExceptions,
  };
}

function supplierInput(row: SupplierKpiRow): SupplierInput {
  return {
    partyId: row.partyId,
    displayName: row.displayName,
    dueBatches: row.dueBatches,
    onTime: row.onTime,
    averageDelayDays: row.averageDelayDays,
    overdueNow: row.overdueNow,
    dateChanges: row.dateChanges,
    noteReturnDays: row.noteReturnDays,
    openExceptions: row.openExceptions,
    weekly: row.weekly.map(weekInput),
  };
}

function weekInput(week: SupplierKpiRow['weekly'][number]): WeekInput {
  return { weekStart: week.weekStart, rate: week.rate, n: week.n };
}

function buyerInput(row: BuyerLoadRow): BuyerInput {
  return {
    buyerId: row.buyer.id,
    name: row.buyer.name,
    openLines: row.openLines,
    openBatches: row.openBatches,
    overdue: row.overdue,
    dueToday: row.dueToday,
    missingDate: row.missingDate,
    openExceptions: row.openExceptions,
    followUpsInPeriod: row.followUpsInPeriod,
  };
}
