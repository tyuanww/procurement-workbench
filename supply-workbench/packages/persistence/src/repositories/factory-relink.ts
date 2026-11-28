import { and, ne, sql } from 'drizzle-orm';
import { normalizeFactoryReportCode } from '@sw/domain';
import type { AppDatabase } from '../client.js';
import { factoryInTransitRows, factoryMaterialDemandRows } from '../schema/factory.js';
import { lockFactorySnapshotSource } from './factory-ownership-lock.js';

export function readReportsByCode(db: AppDatabase, codeNorms: readonly string[]) {
  return reportsByCode(db, relinkCodes(codeNorms));
}

export async function lockReportsByCode(db: AppDatabase, codeNorms: readonly string[]) {
  const codes = relinkCodes(codeNorms);
  const candidates = await reportsByCode(db, codes);
  const transit = candidates.transit.filter((row) => row.linkStatus !== 'manual');
  const demand = candidates.demand.filter((row) => row.linkStatus !== 'manual');
  const sources = new Set(transit.map((row) => row.factoryPartyId));
  // 在途写入与快照发布都先锁来源。各审核事务再按表和行 ID 取锁。
  for (const factoryPartyId of [...sources].sort()) {
    await lockFactorySnapshotSource(db, { factoryPartyId, kind: 'report' });
  }
  const lockedTransit = transit.length === 0 ? [] : await db.select().from(factoryInTransitRows)
    .where(relinkRowScope(factoryInTransitRows, transit.map((row) => row.id))).orderBy(factoryInTransitRows.id).for('update');
  const lockedDemand = demand.length === 0 ? [] : await db.select().from(factoryMaterialDemandRows)
    .where(relinkRowScope(factoryMaterialDemandRows, demand.map((row) => row.id))).orderBy(factoryMaterialDemandRows.id).for('update');
  return {
    transit: lockedTransit.filter((row) => sources.has(row.factoryPartyId) && matchesReportCode(row, codes)),
    demand: lockedDemand.filter((row) => matchesReportCode(row, codes)),
  };
}

function relinkRowScope(table: typeof factoryInTransitRows | typeof factoryMaterialDemandRows, ids: readonly string[]) {
  return and(sql`${table.id} = any(${sql.param(ids)}::text[])`, ne(table.linkStatus, 'manual'));
}

async function reportsByCode(db: AppDatabase, codes: ReadonlySet<string>) {
  if (codes.size === 0) return { transit: [], demand: [] };
  const transit = await db.select().from(factoryInTransitRows);
  const demand = await db.select().from(factoryMaterialDemandRows);
  return { transit: transit.filter((row) => matchesReportCode(row, codes)), demand: demand.filter((row) => matchesReportCode(row, codes)) };
}

function matchesReportCode(row: { readonly itemCodeRaw: string | null; readonly barcodeRaw?: string | null }, codes: ReadonlySet<string>): boolean {
  return codes.has(normalizeFactoryReportCode(row.itemCodeRaw)) || codes.has(normalizeFactoryReportCode(row.barcodeRaw));
}

function relinkCodes(codeNorms: readonly string[]): ReadonlySet<string> {
  return new Set(codeNorms.map(normalizeFactoryReportCode).filter((code) => code !== ''));
}
