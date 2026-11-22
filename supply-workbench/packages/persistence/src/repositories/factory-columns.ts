import { numberToDb } from '../mappers/number.js';

export function shipmentColumns(raw: unknown, facts: { readonly qty: number | null; readonly shipOrArriveOn: string | null } | null) {
  return {
    poRaw: poPart({ raw, cellKey: 'po', part: 'poRaw' }),
    poNorm: poPart({ raw, cellKey: 'po', part: 'poNorm' }),
    itemCodeRaw: text(raw, 'itemCodeRaw'),
    nameRaw: text(raw, 'nameRaw'),
    lotRaw: text(raw, 'lotRaw'),
    qty: numberToDb(facts?.qty ?? amount(raw, 'qty')),
    casePackRaw: text(raw, 'casePackRaw'),
    palletsRaw: text(raw, 'palletsRaw'),
    shipmentKindRaw: text(raw, 'shipmentKindRaw'),
    shipOrArriveOn: facts?.shipOrArriveOn ?? date(raw, 'shipOrArriveOn'),
    destinationRaw: text(raw, 'destinationRaw'),
    vehicleRaw: text(raw, 'vehicleRaw'),
    note2Raw: text(raw, 'note2Raw'),
  };
}

export function transitColumns(raw: unknown, facts: { readonly poRaw: string | null; readonly poNorm: string | null; readonly nameRaw: string | null; readonly itemCodeRaw: string | null; readonly barcodeRaw: string | null; readonly qtyRequired: number | null } | null) {
  return {
    ...transitIdentity(raw, facts),
    orderedOn: date(raw, 'orderedOn'),
    qtyRequired: numberToDb(firstAmount(facts?.qtyRequired, amount(raw, 'qtyRequired'))),
    qtyDeliveredFactory: numberToDb(amount(raw, 'qtyDeliveredFactory')),
    qtyFactoryStock: numberToDb(amount(raw, 'qtyFactoryStock')),
    qtyUnproduced: numberToDb(amount(raw, 'qtyUnproduced')),
    closedRaw: text(raw, 'closedRaw'),
    materialPoRaws: poValue(raw, 'materialPoRaws'),
    buyerNameRaw: text(raw, 'buyerNameRaw'),
    extra: record(raw, 'extra'),
  };
}

function transitIdentity(raw: unknown, facts: { readonly poRaw: string | null; readonly poNorm: string | null; readonly nameRaw: string | null; readonly itemCodeRaw: string | null; readonly barcodeRaw: string | null } | null) {
  return {
    poRaw: firstText(facts?.poRaw, poPart({ raw, cellKey: 'po', part: 'poRaw' })),
    poNorm: firstText(facts?.poNorm, poPart({ raw, cellKey: 'po', part: 'poNorm' })),
    poFormat: poPart({ raw, cellKey: 'po', part: 'poFormat' }),
    nameRaw: firstText(facts?.nameRaw, text(raw, 'nameRaw')),
    supplierRaw: text(raw, 'supplierRaw'),
    barcodeRaw: firstText(facts?.barcodeRaw, text(raw, 'barcodeRaw')),
    itemCodeRaw: firstText(facts?.itemCodeRaw, text(raw, 'itemCodeRaw')),
  };
}

function firstText(preferred: string | null | undefined, fallback: string | null): string | null {
  return preferred === undefined || preferred === null ? fallback : preferred;
}

function firstAmount(preferred: number | null | undefined, fallback: number | null): number | null {
  return preferred === undefined || preferred === null ? fallback : preferred;
}

export function stockColumns(raw: unknown) {
  return {
    poRaw: poPart({ raw, cellKey: 'po', part: 'poRaw' }),
    itemCodeRaw: text(raw, 'itemCodeRaw'),
    itemCodeNorm: text(raw, 'itemCodeRaw'),
    nameRaw: text(raw, 'nameRaw'),
    lotRaw: text(raw, 'lotRaw'),
    qtyOnHand: numberToDb(amount(raw, 'qtyOnHand')),
    palletsRaw: text(raw, 'palletsRaw'),
    coaOn: date(raw, 'coaOn'),
    producedOn: date(raw, 'producedOn'),
    inspectionRaw: text(raw, 'inspectionRaw'),
    inspected: flag(raw, 'inspected'),
  };
}

export function scheduleColumns(raw: unknown) {
  return {
    poRaw: poPart({ raw, cellKey: 'po', part: 'poRaw' }),
    itemCodeRaw: text(raw, 'itemCodeRaw'),
    nameRaw: text(raw, 'nameRaw'),
    monthRaw: text(raw, 'monthRaw'),
    newOrOldRaw: text(raw, 'newOrOldRaw'),
    qtyRequiredTotal: numberToDb(amount(raw, 'qtyRequiredTotal')),
    day: directText(raw, 'day'),
    qty: numberToDb(directAmount(raw, 'qty')),
    stepRaw: directText(raw, 'stepRaw'),
  };
}

export function demandColumns(raw: unknown, facts: { readonly role: 'parent' | 'material'; readonly blockMaterialPoRaw: string | null; readonly poNorm: string | null; readonly itemCodeRaw: string | null; readonly nameRaw: string | null; readonly slots: readonly { readonly index: number; readonly date: string | null; readonly qty: number | null }[] } | null) {
  return {
    ...demandIdentity(raw, facts),
    unitRaw: text(raw, 'unitRaw'),
    qtyOnHand: numberToDb(amount(raw, 'qtyOnHand')),
    qtyFinishedEstimate: numberToDb(amount(raw, 'qtyFinishedEstimate')),
    qtyGross: numberToDb(amount(raw, 'qtyGross')),
    qtyNet: numberToDb(amount(raw, 'qtyNet')),
    slots: { poNorm: facts?.poNorm ?? null, slots: facts?.slots ?? slotsOf(raw) },
  };
}

function demandIdentity(raw: unknown, facts: { readonly role: 'parent' | 'material'; readonly blockMaterialPoRaw: string | null; readonly itemCodeRaw: string | null; readonly nameRaw: string | null } | null) {
  return {
    role: facts?.role ?? roleOf(raw),
    blockPoRaw: directText(raw, 'blockPoRaw'),
    blockMaterialPoRaw: firstText(facts?.blockMaterialPoRaw, directText(raw, 'blockMaterialPoRaw')),
    blockLabelRaw: directText(raw, 'blockLabelRaw'),
    itemCodeRaw: firstText(facts?.itemCodeRaw, text(raw, 'itemCodeRaw')),
    nameRaw: firstText(facts?.nameRaw, text(raw, 'nameRaw')),
  };
}

export function comboColumns(raw: unknown) {
  return {
    poRaw: poPart({ raw, cellKey: 'po', part: 'poRaw' }),
    itemCodeRaw: text(raw, 'itemCodeRaw'),
    nameRaw: text(raw, 'nameRaw'),
    specRaw: text(raw, 'specRaw'),
    qty: numberToDb(amount(raw, 'qty')),
    comboSuppliersRaw: text(raw, 'comboSuppliersRaw'),
    bomCodeRaw: text(raw, 'bomCodeRaw'),
    materialPoRaw: poPart({ raw, cellKey: 'materialPoRaw', part: 'poRaw' }),
  };
}

export function suppliedColumns(raw: unknown) {
  return {
    registeredOn: date(raw, 'registeredOn'),
    seqRaw: text(raw, 'seqRaw'),
    itemCodeRaw: text(raw, 'itemCodeRaw'),
    nameRaw: text(raw, 'nameRaw'),
    lotRaw: text(raw, 'lotRaw'),
    specKg: numberToDb(amount(raw, 'specKg')),
    pieces: numberToDb(amount(raw, 'pieces')),
    netQty: numberToDb(amount(raw, 'netQty')),
    expiresOn: date(raw, 'expiresOn'),
    ownerNoteRaw: text(raw, 'ownerNoteRaw'),
  };
}

function text(raw: unknown, key: string): string | null {
  const value = cell(raw, key);
  return typeof value === 'string' && value !== '' ? value : null;
}

function amount(raw: unknown, key: string): number | null {
  const value = cell(raw, key);
  return typeof value === 'number' ? value : null;
}

function date(raw: unknown, key: string): string | null {
  return text(raw, key);
}

function directText(raw: unknown, key: string): string | null {
  if (!isRecord(raw) || typeof raw[key] !== 'string' || raw[key] === '') return null;
  return raw[key];
}

function directAmount(raw: unknown, key: string): number | null {
  if (!isRecord(raw) || typeof raw[key] !== 'number') return null;
  return raw[key];
}

function flag(raw: unknown, key: string): boolean | null {
  if (!isRecord(raw) || typeof raw[key] !== 'boolean') return null;
  return raw[key];
}

function roleOf(raw: unknown): 'parent' | 'material' {
  return isRecord(raw) && raw.role === 'parent' ? 'parent' : 'material';
}

function slotsOf(raw: unknown): readonly { readonly index: number; readonly date: string | null; readonly qty: number | null }[] {
  if (!isRecord(raw) || !Array.isArray(raw.slots)) return [];
  return raw.slots.flatMap(slotOf);
}

function slotOf(value: unknown): { readonly index: number; readonly date: string | null; readonly qty: number | null }[] {
  if (!isRecord(value) || typeof value.index !== 'number') return [];
  return [{ index: value.index, date: typeof value.date === 'string' ? value.date : null, qty: typeof value.qty === 'number' ? value.qty : null }];
}

function poPart({ raw, cellKey, part }: { readonly raw: unknown; readonly cellKey: string; readonly part: 'poRaw' | 'poNorm' | 'poFormat' }): string | null {
  const po = cell(raw, cellKey);
  if (!isRecord(po) || typeof po[part] !== 'string' || po[part] === '') return null;
  return po[part];
}

function poValue(raw: unknown, key: string): unknown {
  return cell(raw, key) ?? null;
}

function record(raw: unknown, key: string): unknown {
  if (!isRecord(raw) || !isRecord(raw[key])) return null;
  return raw[key];
}

function cell(raw: unknown, key: string): unknown {
  if (!isRecord(raw)) return undefined;
  const item = raw[key];
  if (!isRecord(item) || !('value' in item)) return undefined;
  return item.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
