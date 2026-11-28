import type { FactoryReportOf, OrderLineDetail } from '@sw/application';
import type { ParsedCell, ParsedPo } from '../../../../application/src/ports/parsed-rows.js';
import type { BatchDemandSource } from '../../../../application/src/ports/delivery-batch-repository.js';
import { PO_FORMATS, localDate, type LocalDate } from '@sw/domain';
import { isRecord, textOrNull } from './guards.js';

const EMPTY_TEXT: ParsedCell<string> = { raw: null, value: null };
const EMPTY_NUMBER: ParsedCell<number> = { raw: null, value: null };
const EMPTY_PO: ParsedCell<ParsedPo> = { raw: null, value: null };

type Envelope = {
  readonly id: string;
  readonly importBatchId: string;
  readonly factoryPartyId: string;
  readonly sheetName: string;
  readonly rowNo: number;
  readonly raw: unknown;
  readonly fingerprint: string;
  readonly linkedOrderLineId: string | null;
  readonly linkStatus: string;
  readonly linkReason: string | null;
};
type ShipmentSourceReport = OrderLineDetail['factoryReports']['shipments'][number];
type DemandSourceReport = OrderLineDetail['factoryReports']['demand'][number];
type DemandRow = Envelope & { role: string; blockPoRaw: string | null; blockMaterialPoRaw: string | null; blockLabelRaw: string | null; itemCodeRaw: string | null; nameRaw: string | null; unitRaw: string | null; qtyOnHand: string | null; qtyFinishedEstimate: string | null; qtyGross: string | null; qtyNet: string | null; slots: unknown };

export function isAssociated(status: string): boolean {
  return status === 'linked' || status === 'manual';
}

export function transitOf(row: Envelope & { poRaw: string | null; nameRaw: string | null; supplierRaw: string | null; barcodeRaw: string | null; orderedOn: string | null; qtyRequired: string | null; qtyDeliveredFactory: string | null; qtyFactoryStock: string | null; qtyUnproduced: string | null; closedRaw: string | null; itemCodeRaw: string | null; buyerNameRaw: string | null }): FactoryReportOf<'in_transit'> {
  const raw = record(row.raw);
  return { ...envelope(row), kind: 'in_transit', payload: {
    po: poCell(raw.po, row.poRaw),
    nameRaw: textCell(raw.nameRaw, row.nameRaw),
    supplierRaw: textCell(raw.supplierRaw, row.supplierRaw),
    barcodeRaw: textCell(raw.barcodeRaw, row.barcodeRaw),
    orderedOn: dateCell(raw.orderedOn, row.orderedOn),
    qtyRequired: numberCell(raw.qtyRequired, row.qtyRequired),
    qtyDeliveredFactory: numberCell(raw.qtyDeliveredFactory, row.qtyDeliveredFactory),
    qtyFactoryStock: numberCell(raw.qtyFactoryStock, row.qtyFactoryStock),
    qtyUnproduced: numberCell(raw.qtyUnproduced, row.qtyUnproduced),
    closedRaw: textCell(raw.closedRaw, row.closedRaw),
    itemCodeRaw: textCell(raw.itemCodeRaw, row.itemCodeRaw),
    materialPoRaws: poCell(raw.materialPoRaws, null),
    buyerNameRaw: textCell(raw.buyerNameRaw, row.buyerNameRaw),
    extra: { M: textCell(extraCell(raw, 'M'), null), O: textCell(extraCell(raw, 'O'), null) },
  } };
}

export function transitSourceOf(row: Parameters<typeof transitOf>[0]): OrderLineDetail['factoryReports']['inTransit'][number] {
  const raw = record(row.raw);
  return { ...transitOf(row), originalCells: originalsOf({
    po: cellRaw(raw.po), nameRaw: cellRaw(raw.nameRaw), qtyRequired: cellRaw(raw.qtyRequired), qtyDeliveredFactory: cellRaw(raw.qtyDeliveredFactory),
  }) };
}

export function shipmentOf(row: Envelope & { poRaw: string | null; itemCodeRaw: string | null; nameRaw: string | null; lotRaw: string | null; qty: string | null; casePackRaw: string | null; palletsRaw: string | null; shipmentKindRaw: string | null; shipOrArriveOn: string | null; destinationRaw: string | null; vehicleRaw: string | null; note2Raw: string | null }): FactoryReportOf<'shipment'> {
  const raw = record(row.raw);
  return { ...envelope(row), kind: 'shipment', payload: {
    po: poCell(raw.po, row.poRaw),
    itemCodeRaw: textCell(raw.itemCodeRaw, row.itemCodeRaw),
    nameRaw: textCell(raw.nameRaw, row.nameRaw),
    lotRaw: textCell(raw.lotRaw, row.lotRaw),
    qty: numberCell(raw.qty, row.qty),
    casePackRaw: textCell(raw.casePackRaw, row.casePackRaw),
    palletsRaw: textCell(raw.palletsRaw, row.palletsRaw),
    shipmentKindRaw: textCell(raw.shipmentKindRaw, row.shipmentKindRaw),
    shipOrArriveOn: dateCell(raw.shipOrArriveOn, row.shipOrArriveOn),
    destinationRaw: textCell(raw.destinationRaw, row.destinationRaw),
    vehicleRaw: textCell(raw.vehicleRaw, row.vehicleRaw),
    note2Raw: textCell(raw.note2Raw, row.note2Raw),
  } };
}

export function shipmentSourceOf(row: Parameters<typeof shipmentOf>[0]): ShipmentSourceReport {
  const raw = record(row.raw);
  return { ...shipmentOf(row), originalCells: originalsOf({
    po: cellRaw(raw.po), itemCodeRaw: cellRaw(raw.itemCodeRaw), lotRaw: cellRaw(raw.lotRaw),
    qty: cellRaw(raw.qty), shipOrArriveOn: cellRaw(raw.shipOrArriveOn),
  }) };
}

export function stockOf(row: Envelope & { poRaw: string | null; itemCodeRaw: string | null; nameRaw: string | null; lotRaw: string | null; qtyOnHand: string | null; palletsRaw: string | null; coaOn: string | null; producedOn: string | null; inspectionRaw: string | null; inspected: boolean | null }): FactoryReportOf<'stock'> {
  const raw = record(row.raw);
  return { ...envelope(row), kind: 'stock', payload: {
    po: poCell(raw.po, row.poRaw),
    itemCodeRaw: textCell(raw.itemCodeRaw, row.itemCodeRaw),
    nameRaw: textCell(raw.nameRaw, row.nameRaw),
    lotRaw: textCell(raw.lotRaw, row.lotRaw),
    qtyOnHand: numberCell(raw.qtyOnHand, row.qtyOnHand),
    palletsRaw: textCell(raw.palletsRaw, row.palletsRaw),
    coaOn: dateCell(raw.coaOn, row.coaOn),
    producedOn: dateCell(raw.producedOn, row.producedOn),
    inspectionRaw: textCell(raw.inspectionRaw, row.inspectionRaw),
    inspected: typeof raw.inspected === 'boolean' ? raw.inspected : row.inspected,
  } };
}

export function scheduleOf(row: Envelope & { poRaw: string | null; itemCodeRaw: string | null; nameRaw: string | null; monthRaw: string | null; newOrOldRaw: string | null; qtyRequiredTotal: string | null; day: string | null; qty: string | null; stepRaw: string | null }): FactoryReportOf<'schedule'> | undefined {
  const raw = record(row.raw);
  const day = dayOf(raw.day, row.day);
  if (day === undefined) return undefined;
  return { ...envelope(row), kind: 'schedule', payload: {
    po: poCell(raw.po, row.poRaw),
    itemCodeRaw: textCell(raw.itemCodeRaw, row.itemCodeRaw),
    nameRaw: textCell(raw.nameRaw, row.nameRaw),
    monthRaw: textCell(raw.monthRaw, row.monthRaw),
    newOrOldRaw: textCell(raw.newOrOldRaw, row.newOrOldRaw),
    qtyRequiredTotal: numberCell(raw.qtyRequiredTotal, row.qtyRequiredTotal),
    day,
    qty: numberOrNull(raw.qty, row.qty),
    stepRaw: textOrNull(raw.stepRaw) ?? row.stepRaw,
  } };
}

export function demandOf(row: DemandRow): FactoryReportOf<'demand'> {
  return mapDemand(row, false);
}

export function demandSourceOf(row: DemandRow): DemandSourceReport {
  return mapDemand(row, true);
}

export function batchDemandSourceOf(
  { importBatchId, sheetName, rowNo }: Pick<BatchDemandSource, 'importBatchId' | 'sheetName' | 'rowNo'>,
  { index, dateRaw, qtyRaw, sourceColumns, originalCells }: DemandSourceReport['payload']['slots'][number],
): BatchDemandSource | undefined {
  if (originalCells === undefined || !Object.values(originalCells).some((raw) => raw?.trim())) return undefined;
  return { importBatchId, sheetName, rowNo, slot: {
    index, dateRaw, qtyRaw, originalCells, ...(sourceColumns === undefined ? {} : { sourceColumns }),
  } };
}

function mapDemand(row: DemandRow, captureOriginal: boolean): DemandSourceReport {
  const raw = record(row.raw);
  const originalCells = captureOriginal ? originalsOf({
    blockMaterialPoRaw: raw.blockMaterialPoRaw,
    blockOrderRaw: demandOrderOriginal(raw),
    itemCodeRaw: cellRaw(raw.itemCodeRaw), nameRaw: cellRaw(raw.nameRaw), unitRaw: cellRaw(raw.unitRaw), qtyNet: cellRaw(raw.qtyNet),
  }) : undefined;
  return { ...envelope(row), kind: 'demand', ...(originalCells === undefined ? {} : { originalCells }), payload: {
    role: demandRole(raw.role, row.role),
    blockPoRaw: textOrNull(raw.blockPoRaw) ?? row.blockPoRaw,
    blockMaterialPoRaw: textOrNull(raw.blockMaterialPoRaw) ?? row.blockMaterialPoRaw,
    blockLabelRaw: textOrNull(raw.blockLabelRaw) ?? row.blockLabelRaw,
    itemCodeRaw: textCell(raw.itemCodeRaw, row.itemCodeRaw),
    nameRaw: textCell(raw.nameRaw, row.nameRaw),
    unitRaw: textCell(raw.unitRaw, row.unitRaw),
    qtyOnHand: numberCell(raw.qtyOnHand, row.qtyOnHand),
    qtyFinishedEstimate: numberCell(raw.qtyFinishedEstimate, row.qtyFinishedEstimate),
    qtyGross: numberCell(raw.qtyGross, row.qtyGross),
    qtyNet: numberCell(raw.qtyNet, row.qtyNet),
    slots: slotsOf({ rawSlots: raw.slots, column: row.slots, captureOriginal }),
  } };
}

export function comboOf(row: Envelope & { poRaw: string | null; itemCodeRaw: string | null; nameRaw: string | null; specRaw: string | null; qty: string | null; comboSuppliersRaw: string | null; bomCodeRaw: string | null; materialPoRaw: string | null }): FactoryReportOf<'packaging_combo'> {
  const raw = record(row.raw);
  return { ...envelope(row), kind: 'packaging_combo', payload: {
    po: poCell(raw.po, row.poRaw),
    itemCodeRaw: textCell(raw.itemCodeRaw, row.itemCodeRaw),
    nameRaw: textCell(raw.nameRaw, row.nameRaw),
    specRaw: textCell(raw.specRaw, row.specRaw),
    qty: numberCell(raw.qty, row.qty),
    comboSuppliersRaw: textCell(raw.comboSuppliersRaw, row.comboSuppliersRaw),
    bomCodeRaw: textCell(raw.bomCodeRaw, row.bomCodeRaw),
    materialPoRaw: poCell(raw.materialPoRaw, row.materialPoRaw),
  } };
}

function demandRole(raw: unknown, column: string): 'parent' | 'material' {
  if (raw === 'parent' || raw === 'material') return raw;
  return column === 'parent' ? 'parent' : 'material';
}

function envelope(row: Envelope) {
  return { id: row.id, importBatchId: row.importBatchId, factoryPartyId: row.factoryPartyId, sheetName: row.sheetName, rowNo: row.rowNo, fingerprint: row.fingerprint, linkedOrderLineId: row.linkedOrderLineId, linkStatus: linkStatusOf(row.linkStatus), linkReason: row.linkReason };
}

function linkStatusOf(value: string): 'linked' | 'unlinked' | 'ambiguous' | 'manual' {
  if (value === 'linked' || value === 'unlinked' || value === 'ambiguous' || value === 'manual') return value;
  return 'unlinked';
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function cellRaw(cell: unknown): unknown {
  return isRecord(cell) && (cell.raw !== null || cell.value === null) ? cell.raw : undefined;
}

function originalText(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined;
}

function demandOrderOriginal(raw: Readonly<Record<string, unknown>>) {
  const alternatives = [originalText(raw.blockPoRaw), originalText(raw.blockLabelRaw)];
  return alternatives.find((text) => text?.trim()) ?? (alternatives.includes(undefined) ? undefined : null);
}

function originalsOf(fields: Readonly<Record<string, unknown>>): Readonly<Record<string, string | null>> {
  return Object.fromEntries(Object.entries(fields).flatMap(([key, value]) => {
    const raw = originalText(value);
    return raw === undefined ? [] : [[key, raw] as const];
  }));
}

function textCell(value: unknown, fallback: string | null): ParsedCell<string> {
  const parsed = readCell(value);
  if (parsed === undefined) return fallback === null ? EMPTY_TEXT : { raw: fallback, value: fallback };
  return typeof parsed.value === 'string' || parsed.value === null ? { raw: parsed.raw, value: parsed.value } : EMPTY_TEXT;
}

function numberCell(value: unknown, fallback: string | null): ParsedCell<number> {
  const parsed = readCell(value);
  if (parsed !== undefined && (typeof parsed.value === 'number' || parsed.value === null)) return { raw: parsed.raw, value: parsed.value };
  const qty = fallback === null ? null : Number(fallback);
  if (qty === null || Number.isNaN(qty)) return EMPTY_NUMBER;
  return { raw: fallback, value: qty };
}

function dateCell(value: unknown, fallback: string | null): ParsedCell<LocalDate> {
  const parsed = readCell(value);
  const fromCell = parsed === undefined ? undefined : dateOrNull(parsed.value);
  if (fromCell !== undefined) return { raw: parsed?.raw ?? null, value: fromCell };
  const fromColumn = dateOrNull(fallback);
  return { raw: parsed?.raw ?? (fromColumn === undefined ? null : fallback), value: fromColumn ?? null };
}

function poCell(value: unknown, fallback: string | null): ParsedCell<ParsedPo> {
  const parsed = readCell(value);
  const po = parsed === undefined ? undefined : poOf(parsed.value);
  if (po !== undefined) return { raw: parsed?.raw ?? null, value: po };
  return fallback === null ? EMPTY_PO : { raw: fallback, value: null };
}

function readCell(value: unknown): { readonly raw: string | null; readonly value: unknown } | undefined {
  if (!isRecord(value) || !('value' in value)) return undefined;
  return { raw: typeof value.raw === 'string' ? value.raw : null, value: value.value };
}

function extraCell(raw: Record<string, unknown>, key: string): unknown {
  return isRecord(raw.extra) ? raw.extra[key] : undefined;
}

function dayOf(value: unknown, fallback: string | null): LocalDate | undefined {
  return dateOrNull(value) ?? dateOrNull(fallback);
}

function dateOrNull(value: unknown): LocalDate | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  try {
    return localDate(value);
  } catch (error) {
    if (error instanceof Error) return undefined;
    throw error;
  }
}

function numberOrNull(value: unknown, fallback: string | null): number | null {
  if (typeof value === 'number') return value;
  if (fallback === null) return null;
  const qty = Number(fallback);
  return Number.isNaN(qty) ? null : qty;
}

function poOf(value: unknown): ParsedPo | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.poFormat !== 'string') return undefined;
  if (!isPoFormat(value.poFormat)) return undefined;
  return { poRaw: textOrNull(value.poRaw), poNorm: textOrNull(value.poNorm), poFormat: value.poFormat, relatedPoRaws: strings(value.relatedPoRaws) };
}

function isPoFormat(value: string): value is ParsedPo['poFormat'] {
  return PO_FORMATS.some((format) => format === value);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function slotsOf({ rawSlots, column, captureOriginal }: {
  readonly rawSlots: unknown; readonly column: unknown; readonly captureOriginal: boolean;
}): DemandSourceReport['payload']['slots'] {
  const source = Array.isArray(rawSlots) ? rawSlots : columnSlots(column);
  return source.flatMap((slot) => slotOf(slot, captureOriginal));
}

function columnSlots(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.slots)) return [];
  return value.slots;
}

function slotOf(value: unknown, captureOriginal: boolean): DemandSourceReport['payload']['slots'] {
  if (!isRecord(value) || typeof value.index !== 'number') return [];
  const sourceColumns = demandSourceColumns(value.sourceColumns);
  const originalCells = captureOriginal ? demandSlotOriginals(value) : undefined;
  return [{ index: value.index, ...(sourceColumns === undefined ? {} : { sourceColumns }), date: dateOrNull(value.date) ?? null, dateRaw: textOrNull(value.dateRaw), qty: typeof value.qty === 'number' ? value.qty : null, qtyRaw: textOrNull(value.qtyRaw), ...(originalCells === undefined ? {} : { originalCells }), issues: [] }];
}

function demandSlotOriginals({ date, dateRaw, qty, qtyRaw }: Readonly<Record<string, unknown>>) {
  return originalsOf({
    dateRaw: dateRaw === null && typeof date === 'string' ? undefined : dateRaw,
    qtyRaw: qtyRaw === null && typeof qty === 'number' ? undefined : qtyRaw,
  });
}

function demandSourceColumns(value: unknown) {
  if (!isRecord(value)) return undefined;
  const { date, quantity } = value;
  if (typeof date !== 'number' || typeof quantity !== 'number') return undefined;
  if (!Number.isSafeInteger(date) || date < 1 || !Number.isSafeInteger(quantity) || quantity < 1) return undefined;
  return { date, quantity };
}
