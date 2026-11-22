import { and, eq, isNull } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { parseLocalDate, type FactoryDemandFacts, type FactoryDemandSlot, type FactoryInTransitFacts, type FactoryReportKind, type FactoryReportRow, type FactoryShipmentFacts, type LinkStatus, type LocalDate } from '@sw/domain';
import { LINK_STATUSES } from '@sw/domain';
import type { FactoryReportRepository } from '../../../application/src/ports/factory-report-repository.js';
import type { AppDatabase } from '../client.js';
import { customerSuppliedReceiptRows, factoryInTransitRows, factoryMaterialDemandRows, factoryPackagingComboRows, factoryScheduleCells, factoryShipmentRows, factoryStockRows } from '../schema/factory.js';
import { numberOrNull } from '../mappers/number.js';
import { entityId, orderLineIdOrNull } from '../mappers/id.js';
import { comboColumns, demandColumns, scheduleColumns, shipmentColumns, stockColumns, suppliedColumns, transitColumns } from './factory-columns.js';

const CHUNK = 500;

export function factoryReportRepository(db: AppDatabase): FactoryReportRepository {
  return {
    async get(id) {
      const found = await findReport(db, id);
      if (found === undefined) throw new NotFoundError('代工厂上报', id);
      return found;
    },
    find: (id) => findReport(db, id),
    save: (entity) => saveReport(db, entity),
    async linkUnassignedTransit(rowId, lineId) {
      const updated = await db.update(factoryInTransitRows)
        .set({ linkedOrderLineId: lineId, linkStatus: 'manual', linkReason: null })
        .where(and(eq(factoryInTransitRows.id, rowId), isNull(factoryInTransitRows.linkedOrderLineId)))
        .returning();
      return updated.length === 1;
    },
    listByCodeNorm: (codeNorm) => listByCode(db, codeNorm),
  };
}

export async function insertFactoryShipments(db: AppDatabase, rows: readonly FactoryReportRow[]): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await db.insert(factoryShipmentRows).values(rows.slice(index, index + CHUNK).map(shipmentInsert)).onConflictDoNothing({ target: [factoryShipmentRows.importBatchId, factoryShipmentRows.fingerprint, factoryShipmentRows.sheetName, factoryShipmentRows.rowNo] });
  }
}

async function saveReport(db: AppDatabase, entity: FactoryReportRow): Promise<void> {
  if (entity.kind === 'stock') {
    await db.insert(factoryStockRows).values(stockInsert(entity)).onConflictDoUpdate({ target: [factoryStockRows.importBatchId, factoryStockRows.fingerprint, factoryStockRows.sheetName, factoryStockRows.rowNo], set: stockInsert(entity) });
    return;
  }
  if (entity.kind === 'shipment') {
    await db.insert(factoryShipmentRows).values(shipmentInsert(entity)).onConflictDoUpdate({ target: [factoryShipmentRows.importBatchId, factoryShipmentRows.fingerprint, factoryShipmentRows.sheetName, factoryShipmentRows.rowNo], set: shipmentInsert(entity) });
    return;
  }
  if (entity.kind === 'in_transit') {
    await db.insert(factoryInTransitRows).values(transitInsert(entity)).onConflictDoUpdate({ target: [factoryInTransitRows.importBatchId, factoryInTransitRows.fingerprint, factoryInTransitRows.sheetName, factoryInTransitRows.rowNo], set: transitInsert(entity) });
    return;
  }
  if (entity.kind === 'demand') {
    await db.insert(factoryMaterialDemandRows).values(demandInsert(entity)).onConflictDoUpdate({ target: [factoryMaterialDemandRows.importBatchId, factoryMaterialDemandRows.fingerprint, factoryMaterialDemandRows.sheetName, factoryMaterialDemandRows.rowNo], set: demandInsert(entity) });
    return;
  }
  if (entity.kind === 'schedule') {
    await db.insert(factoryScheduleCells).values(scheduleInsert(entity)).onConflictDoUpdate({ target: [factoryScheduleCells.importBatchId, factoryScheduleCells.fingerprint, factoryScheduleCells.sheetName, factoryScheduleCells.rowNo], set: scheduleInsert(entity) });
    return;
  }
  if (entity.kind === 'packaging_combo') {
    await db.insert(factoryPackagingComboRows).values(comboInsert(entity)).onConflictDoUpdate({ target: [factoryPackagingComboRows.importBatchId, factoryPackagingComboRows.fingerprint, factoryPackagingComboRows.sheetName, factoryPackagingComboRows.rowNo], set: comboInsert(entity) });
    return;
  }
  await db.insert(customerSuppliedReceiptRows).values(suppliedInsert(entity)).onConflictDoUpdate({ target: [customerSuppliedReceiptRows.importBatchId, customerSuppliedReceiptRows.fingerprint, customerSuppliedReceiptRows.sheetName, customerSuppliedReceiptRows.rowNo], set: suppliedInsert(entity) });
}

async function findReport(db: AppDatabase, id: string): Promise<FactoryReportRow | undefined> {
  const stock = await first(db.select().from(factoryStockRows).where(eq(factoryStockRows.id, id)));
  if (stock !== undefined) return report({ row: stock, kind: 'stock', shipment: null, demand: null, inTransit: null });
  const shipment = await first(db.select().from(factoryShipmentRows).where(eq(factoryShipmentRows.id, id)));
  if (shipment !== undefined) return report({ row: shipment, kind: 'shipment', shipment: shipmentFacts(shipment), demand: null, inTransit: null });
  const transit = await first(db.select().from(factoryInTransitRows).where(eq(factoryInTransitRows.id, id)));
  if (transit !== undefined) return report({ row: transit, kind: 'in_transit', shipment: null, demand: null, inTransit: transitFacts(transit) });
  return findLater(db, id);
}

async function findLater(db: AppDatabase, id: string): Promise<FactoryReportRow | undefined> {
  const demand = await first(db.select().from(factoryMaterialDemandRows).where(eq(factoryMaterialDemandRows.id, id)));
  if (demand !== undefined) return report({ row: demand, kind: 'demand', shipment: null, demand: demandFacts(demand), inTransit: null });
  const schedule = await first(db.select().from(factoryScheduleCells).where(eq(factoryScheduleCells.id, id)));
  if (schedule !== undefined) return report({ row: schedule, kind: 'schedule', shipment: null, demand: null, inTransit: null });
  const combo = await first(db.select().from(factoryPackagingComboRows).where(eq(factoryPackagingComboRows.id, id)));
  if (combo !== undefined) return report({ row: combo, kind: 'packaging_combo', shipment: null, demand: null, inTransit: null });
  const supplied = await first(db.select().from(customerSuppliedReceiptRows).where(eq(customerSuppliedReceiptRows.id, id)));
  return supplied === undefined ? undefined : report({ row: supplied, kind: 'customer_supplied', shipment: null, demand: null, inTransit: null });
}

async function first<T>(query: Promise<T[]>): Promise<T | undefined> {
  return (await query)[0];
}
async function listByCode(db: AppDatabase, codeNorm: string): Promise<FactoryReportRow[]> {
  const transit = (await db.select().from(factoryInTransitRows)).filter((row) => sameCode(row.itemCodeRaw, codeNorm) || sameCode(row.barcodeRaw, codeNorm));
  const demand = (await db.select().from(factoryMaterialDemandRows)).filter((row) => sameCode(row.itemCodeRaw, codeNorm));
  return [...transit.map((row) => report({ row, kind: 'in_transit', shipment: null, demand: null, inTransit: transitFacts(row) })), ...demand.map((row) => report({ row, kind: 'demand', shipment: null, demand: demandFacts(row), inTransit: null }))];
}

function stockInsert(entity: FactoryReportRow): typeof factoryStockRows.$inferInsert {
  return { ...envelope(entity), ...stockColumns(entity.raw) };
}

function shipmentInsert(entity: FactoryReportRow): typeof factoryShipmentRows.$inferInsert {
  return { ...envelope(entity), ...shipmentColumns(entity.raw, entity.shipment) };
}

function transitInsert(entity: FactoryReportRow): typeof factoryInTransitRows.$inferInsert {
  return { ...envelope(entity), ...transitColumns(entity.raw, entity.inTransit) };
}

function demandInsert(entity: FactoryReportRow): typeof factoryMaterialDemandRows.$inferInsert {
  return { ...envelope(entity), ...demandColumns(entity.raw, entity.demand) };
}

function scheduleInsert(entity: FactoryReportRow) {
  return { ...envelope(entity), ...scheduleColumns(entity.raw) };
}

function comboInsert(entity: FactoryReportRow) {
  return { ...envelope(entity), ...comboColumns(entity.raw) };
}

function suppliedInsert(entity: FactoryReportRow) {
  return { ...envelope(entity), ...suppliedColumns(entity.raw) };
}

function envelope(entity: FactoryReportRow) {
  const at = new Date().toISOString();
  return { id: entity.id, importBatchId: entity.importBatchId, factoryPartyId: entity.factoryPartyId, sheetName: entity.sheetName, rowNo: entity.rowNo, raw: entity.raw, fingerprint: entity.fingerprint, linkedOrderLineId: entity.linkedOrderLineId, linkStatus: linkStatusOf(entity.linkStatus), linkReason: entity.linkReason, createdAt: at, updatedAt: at };
}

function report(input: { readonly row: EnvelopeRow; readonly kind: FactoryReportKind; readonly shipment: FactoryShipmentFacts | null; readonly demand: FactoryDemandFacts | null; readonly inTransit: FactoryInTransitFacts | null }): FactoryReportRow {
  return { id: entityId(input.row.id), importBatchId: entityId(input.row.importBatchId), factoryPartyId: entityId(input.row.factoryPartyId), sheetName: input.row.sheetName, rowNo: input.row.rowNo, raw: input.row.raw, fingerprint: input.row.fingerprint, linkedOrderLineId: orderLineIdOrNull(input.row.linkedOrderLineId), linkStatus: linkStatusOf(input.row.linkStatus), linkReason: input.row.linkReason, kind: input.kind, shipment: input.shipment, demand: input.demand, inTransit: input.inTransit };
}

function shipmentFacts(row: { qty: string | null; shipOrArriveOn: string | null }): FactoryShipmentFacts {
  return { qty: numberOrNull(row.qty), shipOrArriveOn: dateOrNull(row.shipOrArriveOn) };
}

function transitFacts(row: { poRaw: string | null; poNorm: string | null; nameRaw: string | null; itemCodeRaw: string | null; barcodeRaw: string | null; qtyRequired: string | null }): FactoryInTransitFacts {
  return { poRaw: row.poRaw, poNorm: row.poNorm, nameRaw: row.nameRaw, itemCodeRaw: row.itemCodeRaw, barcodeRaw: row.barcodeRaw, qtyRequired: numberOrNull(row.qtyRequired) };
}

function demandFacts(row: { role: string; blockMaterialPoRaw: string | null; itemCodeRaw: string | null; nameRaw: string | null; slots: unknown }): FactoryDemandFacts {
  const stored = readSlots(row.slots);
  return { role: row.role === 'parent' ? 'parent' : 'material', blockMaterialPoRaw: row.blockMaterialPoRaw, poNorm: stored.poNorm, itemCodeRaw: row.itemCodeRaw, nameRaw: row.nameRaw, slots: stored.slots };
}

function readSlots(value: unknown): { readonly poNorm: string | null; readonly slots: FactoryDemandSlot[] } {
  if (!isSlotWrap(value)) return { poNorm: null, slots: [] };
  return { poNorm: typeof value.poNorm === 'string' ? value.poNorm : null, slots: Array.isArray(value.slots) ? value.slots.flatMap(slotOf) : [] };
}

function isSlotWrap(value: unknown): value is { poNorm?: unknown; slots?: unknown } {
  return typeof value === 'object' && value !== null && 'slots' in value;
}

function slotOf(value: unknown): FactoryDemandSlot[] {
  if (!isSlot(value) || typeof value.index !== 'number') return [];
  return [{ index: value.index, date: dateOrNull(value.date), qty: typeof value.qty === 'number' ? value.qty : null }];
}

function isSlot(value: unknown): value is { index?: unknown; date?: unknown; qty?: unknown } {
  return typeof value === 'object' && value !== null && 'index' in value;
}

function dateOrNull(value: unknown): LocalDate | null {
  if (typeof value !== 'string' || value === '') return null;
  const parsed = parseLocalDate(value);
  return parsed.ok ? parsed.value : null;
}

function sameCode(raw: string | null, codeNorm: string): boolean {
  if (raw === null || raw.trim() === '') return false;
  return raw.normalize('NFKC').trim().toUpperCase() === codeNorm.normalize('NFKC').trim().toUpperCase();
}

function linkStatusOf(value: string): LinkStatus {
  for (const status of LINK_STATUSES) if (status === value) return status;
  return 'unlinked';
}

type EnvelopeRow = { id: string; importBatchId: string; factoryPartyId: string; sheetName: string; rowNo: number; raw: unknown; fingerprint: string; linkedOrderLineId: string | null; linkStatus: string; linkReason: string | null };
