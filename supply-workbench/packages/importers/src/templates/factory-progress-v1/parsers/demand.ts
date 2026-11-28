import type { CellLike, SheetLike } from '../../../../../application/src/ports/workbook-reader.js';
import type { DemandSlot, MaterialDemandPayload, PendingCodeLink } from '../../../../../application/src/ports/parsed-rows.js';
import { cellIssue, classifyDemandOrder, type ImportIssue, type Settings } from '@sw/domain';
import { parseDate } from '../../../normalize/date.js';
import { parseQty } from '../../../normalize/qty.js';
import { hashFields, numberField, textField, type DraftRow } from '../fingerprint.js';
import { findHeader, type HeaderMap } from '../headers.js';
import { sheetReader, take, type SheetReader } from '../read-cell.js';
import { SHEETS } from '../spec/index.js';

const SLOT_SCAN = 80;

type Block = { readonly poRaw: string | null; readonly materialPoRaw: string | null; readonly label: string | null };
type SlotPair = { readonly index: number; readonly dateCol: number; readonly qtyCol: number };
type ParseInput = { readonly sheet: SheetLike; readonly date1904: boolean; readonly dateSanityRange: Settings['dateSanityRange'] };
type ReadCtx = { readonly input: ParseInput; readonly header: HeaderMap; readonly reader: SheetReader; readonly pairs: readonly SlotPair[] };

const EMPTY_BLOCK: Block = { poRaw: null, materialPoRaw: null, label: null };

export function parseDemand(input: ParseInput): { readonly rows: DraftRow<MaterialDemandPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  const header = findHeader(input.sheet, SHEETS.demand.columns);
  if (header === null) return { rows: [], links: [], missingHeader: true };
  const reader = sheetReader({ sheet: input.sheet, header, date1904: input.date1904, dateSanityRange: input.dateSanityRange });
  return readBlocks({ input, header, reader, pairs: slotPairs(input.sheet, header.headerRow + 1) });
}

function readBlocks(ctx: ReadCtx): { readonly rows: DraftRow<MaterialDemandPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  const rows: DraftRow<MaterialDemandPayload>[] = [];
  let block = EMPTY_BLOCK;
  for (let row = ctx.header.headerRow + 2; row <= ctx.input.sheet.rowCount; row += 1) {
    const next = nextRow({ ctx, row, block });
    if (next === null) continue;
    block = next.block;
    rows.push(next.row);
  }
  return { rows, links: [], missingHeader: false };
}

function nextRow({ ctx, row, block }: { readonly ctx: ReadCtx; readonly row: number; readonly block: Block }): { readonly row: DraftRow<MaterialDemandPayload>; readonly block: Block } | null {
  if (isRepeatedHeader({ sheet: ctx.input.sheet, row, header: ctx.header })) return { block, row: repeated(ctx.input.sheet.name, row) };
  const opened = openBlock({ sheet: ctx.input.sheet, row, header: ctx.header });
  if (opened !== null) return { block: opened.block, row: madeRow({ ctx, row, role: 'parent', block: opened.block, issues: opened.issues }) };
  if (ownText({ sheet: ctx.input.sheet, row, header: ctx.header, name: '材料品号' }) === '') return null;
  return { block, row: madeRow({ ctx, row, role: 'material', block, issues: [cellIssue({ code: 'CONTEXT_INHERITED', raw: block.poRaw, column: '订单号' })] }) };
}

function openBlock({ sheet, row, header }: { readonly sheet: SheetLike; readonly row: number; readonly header: HeaderMap }): { readonly block: Block; readonly issues: ImportIssue[] } | null {
  const material = ownText({ sheet, row, header, name: '采购单号' });
  const order = ownText({ sheet, row, header, name: '订单号' });
  if (material === '' && order === '') return null;
  const labeled = labelOrder(order);
  return { block: { poRaw: labeled.poRaw, materialPoRaw: material === '' ? null : material, label: labeled.label }, issues: labeled.issues };
}

function labelOrder(order: string): { readonly poRaw: string | null; readonly label: string | null; readonly issues: ImportIssue[] } {
  const classified = classifyDemandOrder(order);
  return { poRaw: classified.poRaw, label: classified.blockLabelRaw, issues: [...classified.issues] };
}

function madeRow(input: { readonly ctx: ReadCtx; readonly row: number; readonly role: 'parent' | 'material'; readonly block: Block; readonly issues: ImportIssue[] }): DraftRow<MaterialDemandPayload> {
  const payload = payloadOf(input);
  return draft({ sheetName: input.ctx.input.sheet.name, rowNo: input.row, payload, issues: input.issues, skipReason: null });
}

function payloadOf(input: { readonly ctx: ReadCtx; readonly row: number; readonly role: 'parent' | 'material'; readonly block: Block; readonly issues: ImportIssue[] }): MaterialDemandPayload {
  return {
    role: input.role,
    blockPoRaw: input.block.poRaw,
    blockMaterialPoRaw: input.block.materialPoRaw,
    blockLabelRaw: input.block.label,
    itemCodeRaw: take(input.issues, input.ctx.reader.code(input.row, '材料品号')),
    nameRaw: take(input.issues, input.ctx.reader.text({ row: input.row, name: '材料品名' })),
    unitRaw: take(input.issues, input.ctx.reader.text({ row: input.row, name: '材料库存单位' })),
    qtyOnHand: take(input.issues, input.ctx.reader.qty(input.row, '现有库存量')),
    qtyFinishedEstimate: take(input.issues, input.ctx.reader.qty(input.row, '成品预计用量')),
    qtyGross: take(input.issues, input.ctx.reader.qty(input.row, '订单毛需求量')),
    qtyNet: take(input.issues, input.ctx.reader.qty(input.row, '物料需求量')),
    slots: input.ctx.pairs.flatMap((pair) => readSlot({ input: input.ctx.input, row: input.row, pair })),
  };
}

function readSlot({ input, row, pair }: { readonly input: ParseInput; readonly row: number; readonly pair: SlotPair }): DemandSlot[] {
  const date = parseDate(input.sheet.cell(row, pair.dateCol) ?? emptyCell(), input);
  const qty = parseQty(input.sheet.cell(row, pair.qtyCol) ?? emptyCell());
  if (date.value === null && qty.value === null && date.issues.length === 0 && qty.issues.length === 0) return [];
  return [{ index: pair.index, sourceColumns: { date: pair.dateCol, quantity: pair.qtyCol }, date: date.value, dateRaw: date.raw || null, qty: qty.value, qtyRaw: qty.raw || null, issues: [...stamp(date.issues, '到货时间'), ...stamp(qty.issues, '数量')] }];
}

function slotPairs(sheet: SheetLike, row: number): SlotPair[] {
  const pairs: SlotPair[] = [];
  for (let col = 1; col <= SLOT_SCAN; col += 1) {
    if (compact(sheet.cell(row, col)?.text ?? '') !== '到货时间') continue;
    pairs.push({ index: pairs.length, dateCol: col, qtyCol: col + 1 });
  }
  return pairs;
}

function isRepeatedHeader({ sheet, row, header }: { readonly sheet: SheetLike; readonly row: number; readonly header: HeaderMap }): boolean {
  return compact(ownCell({ sheet, row, col: header.col('订单号') })?.text ?? '') === '订单号';
}

function ownText(input: { readonly sheet: SheetLike; readonly row: number; readonly header: HeaderMap; readonly name: string }): string {
  const cell = ownCell({ sheet: input.sheet, row: input.row, col: input.header.col(input.name) });
  return cell === null ? '' : cell.text.trim();
}

function ownCell({ sheet, row, col }: { readonly sheet: SheetLike; readonly row: number; readonly col: number | null }): CellLike | null {
  if (col === null) return null;
  const cell = sheet.cell(row, col);
  if (cell === null || cell.mergedFrom !== undefined) return null;
  return cell;
}

function repeated(sheetName: string, rowNo: number): DraftRow<MaterialDemandPayload> {
  return draft({ sheetName, rowNo, payload: emptyPayload(), issues: [cellIssue({ code: 'ROW_REPEATED_HEADER', raw: '订单号', column: '订单号' })], skipReason: 'ROW_REPEATED_HEADER' });
}

function emptyPayload(): MaterialDemandPayload {
  const blank = { raw: null, value: null };
  return { role: 'material', blockPoRaw: null, blockMaterialPoRaw: null, blockLabelRaw: null, itemCodeRaw: blank, nameRaw: blank, unitRaw: blank, qtyOnHand: blank, qtyFinishedEstimate: blank, qtyGross: blank, qtyNet: blank, slots: [] };
}

function draft(input: { readonly sheetName: string; readonly rowNo: number; readonly payload: MaterialDemandPayload; readonly issues: readonly ImportIssue[]; readonly skipReason: string | null }): DraftRow<MaterialDemandPayload> {
  return { sheetName: input.sheetName, rowNo: input.rowNo, issues: input.issues, action: null, targetId: null, skipReason: input.skipReason, payload: input.payload, base: hashFields(input.sheetName, demandFields(input.payload)) };
}

function demandFields(payload: MaterialDemandPayload): string[] {
  return [payload.role, payload.blockPoRaw ?? '', payload.blockMaterialPoRaw ?? '', payload.blockLabelRaw ?? '', textField(payload.itemCodeRaw), textField(payload.nameRaw), numberField(payload.qtyNet), ...payload.slots.map((slot) => `${slot.index}:${slot.date ?? ''}:${slot.qty ?? ''}`)];
}

function stamp(issues: readonly ImportIssue[], column: string): ImportIssue[] {
  return issues.map((issue) => ({ ...issue, column }));
}

function compact(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, '');
}

function emptyCell(): CellLike {
  return { kind: 'empty', value: null, text: '' };
}
