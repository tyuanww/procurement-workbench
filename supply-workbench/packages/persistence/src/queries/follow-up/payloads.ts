import type { FactoryReportOf } from '@sw/application';
import type { ParsedCell, ParsedPo } from '../../../../application/src/ports/parsed-rows.js';
import { PO_FORMATS, localDate, type LocalDate } from '@sw/domain';
import { isRecord, textOrNull } from './guards.js';

const EMPTY_TEXT: ParsedCell<string> = { raw: null, value: null };
const EMPTY_NUMBER: ParsedCell<number> = { raw: null, value: null };
const EMPTY_DATE: ParsedCell<LocalDate> = { raw: null, value: null };
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

export function demandOf(row: Envelope & { role: string; blockPoRaw: string | null; blockMaterialPoRaw: string | null; blockLabelRaw: string | null; itemCodeRaw: string | null; nameRaw: string | null; unitRaw: string | null; qtyOnHand: string | null; qtyFinishedEstimate: string | null; qtyGross: string | null; qtyNet: string | null; slots: unknown }): FactoryReportOf<'demand'> {
  const raw = record(row.raw);
  return { ...envelope(row), kind: 'demand', payload: {
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
    slots: slotsOf(raw.slots, row.slots),
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
  return fromColumn === undefined ? EMPTY_DATE : { raw: fallback, value: fromColumn };
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

function slotsOf(rawSlots: unknown, column: unknown): FactoryReportOf<'demand'>['payload']['slots'] {
  const source = Array.isArray(rawSlots) ? rawSlots : columnSlots(column);
  return source.flatMap(slotOf);
}

function columnSlots(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.slots)) return [];
  return value.slots;
}

function slotOf(value: unknown): FactoryReportOf<'demand'>['payload']['slots'] {
  if (!isRecord(value) || typeof value.index !== 'number') return [];
  return [{ index: value.index, date: dateOrNull(value.date) ?? null, dateRaw: textOrNull(value.dateRaw), qty: typeof value.qty === 'number' ? value.qty : null, qtyRaw: textOrNull(value.qtyRaw), issues: [] }];
}
