import {
  BuyerLoadDashboardSchema,
  StuckDashboardSchema,
  SupplierDashboardSchema,
  type BuyerLoadRow,
  type ProjectProgress,
  type StuckDashboard,
  type SupplierKpiRow,
} from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { apiGet } from '../../shared/api/client.js';
import { read } from '../../shared/api/reads.js';
import type { BuyerInput } from './model/buyers.js';
import type { DashboardLane } from './model/query.js';
import type { StuckDistributionInput, StuckItemInput } from './model/stuck.js';
import type { SupplierInput, WeekInput } from './model/suppliers.js';

export type LoadDashboardInput = {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly lane: DashboardLane;
};

export type StuckCards = readonly [
  { readonly key: 'openBatches'; readonly value: number },
  { readonly key: 'overdue'; readonly value: number },
  { readonly key: 'awaitingDate'; readonly value: number },
  { readonly key: 'shippedNotReceived'; readonly value: number },
];
export type StuckCard = StuckCards[number];

export type DashboardLoad = {
  readonly cards: StuckCards;
  readonly stuckItems: readonly StuckItemInput[];
  readonly distribution: readonly StuckDistributionInput[];
  readonly suppliers: readonly SupplierInput[];
  readonly buyers: readonly BuyerInput[];
  readonly project: ProjectProgress;
  readonly unassignedExceptions: number | null;
};

export async function loadDashboard(input: LoadDashboardInput): Promise<DashboardLoad> {
  const query = apiQuery(input);
  const [stuck, suppliers, buyers, project] = await Promise.all([
    apiGet(`/api/v1/dashboard/stuck?${query}`, StuckDashboardSchema),
    apiGet(`/api/v1/dashboard/suppliers?${query}`, SupplierDashboardSchema),
    apiGet(`/api/v1/dashboard/buyers?${query}`, BuyerLoadDashboardSchema),
    read({ name: 'planProgress', from: input.from, to: input.to }),
  ]);
  return toLoad({ stuck, suppliers: suppliers.rows, buyers: buyers.rows, project, unassignedExceptions: buyers.unassignedExceptions });
}

function apiQuery(input: LoadDashboardInput): string {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.lane !== 'all') params.set('lane', input.lane);
  return params.toString();
}

function toLoad(input: {
  readonly stuck: StuckDashboard;
  readonly suppliers: readonly SupplierKpiRow[];
  readonly buyers: readonly BuyerLoadRow[];
  readonly project: ProjectProgress;
  readonly unassignedExceptions: number | null;
}): DashboardLoad {
  return {
    cards: cardsOf(input.stuck.kpis),
    stuckItems: input.stuck.items,
    distribution: input.stuck.distribution,
    suppliers: input.suppliers.map(supplierInput),
    buyers: input.buyers.map(buyerInput),
    project: input.project,
    unassignedExceptions: input.unassignedExceptions,
  };
}

function cardsOf(kpis: StuckDashboard['kpis']): StuckCards {
  return [
    { key: 'openBatches', value: kpis.openBatches },
    { key: 'overdue', value: kpis.overdue },
    { key: 'awaitingDate', value: kpis.awaitingDate },
    { key: 'shippedNotReceived', value: kpis.shippedNotReceived },
  ];
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
