import * as XLSX from 'xlsx';
import { archiveFields, type ArchiveField, type ArchiveRow, type MaterialRow, type ParsedProductWorkbook, type WorkbookBarcodeRow, type WorkbookIssue } from '@sw/application';
import { ATTACHMENT_MAX_BYTES, isNotProvided, parseBarcode, parseItemCode, type ImageSlot } from '@sw/domain';
import type { CellLike, SheetLike, WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { readText } from '../product-archive-v1/cells.js';
import { compactHeader } from '../product-archive-v1/columns.js';
import { ARCHIVE, ARCHIVE_COLUMNS, BARCODE, BOM, CONTACT, IMAGE_COLUMNS, IMAGE_SLOTS, LEGACY_CONTACT, MATERIAL_COLUMNS, OPERATION, OWNER, PART_BARCODE, imageOperation } from './columns.js';
import { exactQty } from './quantities.js';
export { generateProductWorkbookTemplate } from './template.js';

const MAX_XLSX_COLUMNS = 16_384;
const OWNER_LENGTH = 100;

type ParseContext = { readonly issues: WorkbookIssue[]; readonly barcodeRows: WorkbookBarcodeRow[]; readonly anchorBarcode: string | null };
type Row = ParseContext & { readonly sheet: SheetLike; readonly row: number; readonly columns: ReadonlyMap<string, number> };
type PutImage = (input: { readonly bytes: Uint8Array; readonly originalName: string; readonly mime: string }) => Promise<string>;

export async function parseProductWorkbook(workbook: WorkbookLike, { putImage, anchorBarcode = null }: { readonly putImage: PutImage; readonly anchorBarcode?: string | null }): Promise<ParsedProductWorkbook> {
  const first = workbook.sheets[0];
  if (first?.name.trim() !== ARCHIVE) {
    return { products: [], materials: [], issues: [{ sheet: ARCHIVE, row: null, field: null, message: '请将「产品档案」置于第一个工作表' }] };
  }
  const issues = duplicateBusinessSheetIssues(workbook.sheets);
  if (issues.length > 0) return { products: [], materials: [], issues };
  const barcodeRows: WorkbookBarcodeRow[] = [];
  const context = { issues, barcodeRows, anchorBarcode };
  validateExtraSheets(workbook.sheets.slice(1), issues);
  const bom = workbook.sheets.find((sheet) => sheet.name.trim() === BOM);
  const products = await archiveRows(first, { ...context, putImage });
  const materials = bom === undefined ? [] : materialRows(bom, context);
  if (products.length === 0 && materials.length === 0 && issues.length === 0) {
    issues.push({ sheet: ARCHIVE, row: null, field: null, message: '请至少填写一条产品档案或组成物料' });
  }
  return { products, materials, issues, barcodeRows };
}

function duplicateBusinessSheetIssues(sheets: readonly SheetLike[]): WorkbookIssue[] {
  const issues: WorkbookIssue[] = [];
  for (const name of [ARCHIVE, BOM]) {
    if (sheets.filter((sheet) => sheet.name.trim() === name).length <= 1) continue;
    issues.push({
      sheet: name, row: null, field: null,
      message: `找到多张「${name}」工作表（表名首尾空格不计），请合并数据，只保留一张后重新上传`,
    });
  }
  return issues;
}

function validateExtraSheets(sheets: readonly SheetLike[], issues: WorkbookIssue[]): void {
  const allowed = new Set([ARCHIVE, BOM, '图片索引']);
  for (const sheet of sheets) {
    if (!allowed.has(sheet.name.trim()) && !sheet.hidden && sheet.rowCount > 0) {
      issues.push({ sheet: sheet.name, row: null, field: null, message: '无法识别此工作表，请使用「组成物料」表名提交物料，或移除额外的工作表' });
    }
  }
}

function columnsOf(sheet: SheetLike, { required, issues }: { readonly required: readonly string[]; readonly issues: WorkbookIssue[] }): ReadonlyMap<string, number> {
  const columns = new Map<string, number>();
  for (let col = 1; col <= Math.min(sheet.columnCount, MAX_XLSX_COLUMNS); col += 1) {
    const name = compactHeader(sheet.cell(1, col)?.text ?? '');
    if (name === '') continue;
    if (columns.has(name)) issues.push({ sheet: sheet.name, row: 1, field: name, message: '表头重复，请保留一列' });
    columns.set(name, col);
  }
  for (const field of required) {
    if (!columns.has(compactHeader(field))) issues.push({ sheet: sheet.name, row: 1, field, message: '缺少此表头，请补齐后重新上传' });
  }
  return columns;
}

async function archiveRows(sheet: SheetLike, { putImage, ...context }: ParseContext & { readonly putImage: PutImage }): Promise<ArchiveRow[]> {
  const columns = columnsOf(sheet, { required: [BARCODE], issues: context.issues });
  const readColumns = [...ARCHIVE_COLUMNS, LEGACY_CONTACT];
  const existing = new Set<string>();
  const images = imageRows(sheet, { columns, issues: context.issues });
  let candidates = sheet.rowCount;
  for (const row of images.keys()) candidates = Math.max(candidates, row);
  const result: ArchiveRow[] = [];
  for (let row = 2; row <= candidates; row += 1) {
    const scope = { ...context, sheet, row, columns };
    const image = images.get(row) ?? [];
    if (!hasValues(scope, readColumns) && image.length === 0) continue;
    validateImageCells(scope, image);
    const barcode = barcodeOf(scope);
    if (barcode === null) continue;
    if (!uniqueRow(scope, { seen: existing, key: barcode, field: BARCODE, message: '此完整条码前面已有一行，请合并后重新上传' })) continue;
    const fields = archiveText(scope);
    const contact = contactOf(scope);
    const imageOperations = operationsOf(scope, image);
    result.push({ row, barcode, fields, contact, imageOperations, images: await storeImages(scope, { images: image, put: putImage }) });
  }
  return result;
}

function archiveText(scope: Row): ArchiveRow['fields'] {
  const fields: Partial<Record<ArchiveField, string>> = {};
  for (const key in archiveFields) {
    if (!isArchiveField(key)) continue;
    const value = text(scope, archiveFields[key]);
    if (value !== null) fields[key] = value;
  }
  return fields;
}

function isArchiveField(key: string): key is ArchiveField {
  return Object.hasOwn(archiveFields, key);
}

function contactOf(scope: Row): string | null {
  const contact = text(scope, CONTACT);
  const legacy = text(scope, LEGACY_CONTACT);
  if (contact !== null && legacy !== null && contact !== legacy) {
    issue(scope, { field: CONTACT, message: '「项目推荐人」和「项目对接人」不同，请保留一个值或将两列改为相同值' });
  }
  return contact ?? legacy;
}

function operationsOf(scope: Row, images: readonly ScopedImage[]): ArchiveRow['imageOperations'] {
  const operations: Partial<Record<ImageSlot, 'hide' | 'replace'>> = {};
  for (const slot of IMAGE_SLOTS) {
    const field = imageOperation(slot);
    const operation = text(scope, field);
    if (operation === null) continue;
    const hasEmbeddedImage = images.some((image) => image.slot === slot);
    if (operation === '隐藏' && !hasEmbeddedImage) operations[slot] = 'hide';
    else if (operation === '替换' && hasEmbeddedImage) operations[slot] = 'replace';
    else if (operation === '隐藏') issue(scope, { field, message: '同一包装栏位不能同时嵌入图片和填写「隐藏」' });
    else if (operation === '替换') issue(scope, { field, message: '填写「替换」时，请在这一行对应栏位嵌入新图片' });
    else issue(scope, { field, message: '此列留空，或填写「隐藏」「替换」' });
  }
  return operations;
}

type ScopedImage = NonNullable<SheetLike['images']>[number] & { readonly slot: ImageSlot };

function imageRows(sheet: SheetLike, { columns, issues }: Pick<Row, 'columns' | 'issues'>): Map<number, ScopedImage[]> {
  const byRow = new Map<number, ScopedImage[]>();
  for (const image of sheet.images ?? []) {
    if (image.row < 2) continue;
    const slot = IMAGE_SLOTS.find((key) => columns.get(IMAGE_COLUMNS[key]) === image.col);
    if (slot === undefined) {
      const address = XLSX.utils.encode_cell({ r: image.row - 1, c: image.col - 1 });
      issues.push({ sheet: sheet.name, row: image.row, field: '包装图片', message: `图片起始位置 ${address} 未对准包装图列，请移动到对应的内包装或外包装图片格` });
      continue;
    }
    const row = byRow.get(image.row) ?? [];
    row.push({ ...image, slot });
    byRow.set(image.row, row);
  }
  return byRow;
}

function validateImageCells(scope: Row, images: readonly ScopedImage[]): void {
  for (const slot of IMAGE_SLOTS) {
    const field = IMAGE_COLUMNS[slot];
    if (hasCellValue(cell(scope, field)) && !images.some((image) => image.slot === slot)) {
      issue(scope, { field, message: '此格含图片公式或文字，请将 PNG、JPEG 或 WebP 嵌入此格' });
    }
  }
}

async function storeImages(scope: Row, { images, put }: { readonly images: readonly ScopedImage[]; readonly put: PutImage }): Promise<ArchiveRow['images']> {
  const stored: { slot: ImageSlot; sha256: string }[] = [];
  for (const image of images) {
    if (image.data.byteLength === 0) {
      issue(scope, { field: IMAGE_COLUMNS[image.slot], message: '此包装图片无法读取，请删除后重新嵌入' });
      continue;
    }
    const mime = productWorkbookImageMime(image.data);
    if (mime === null || image.data.byteLength > ATTACHMENT_MAX_BYTES) {
      issue(scope, { field: IMAGE_COLUMNS[image.slot], message: '请嵌入不超过 10 MB 的 PNG、JPEG 或 WebP 图片' });
      continue;
    }
    const sha256 = await put({ bytes: image.data, originalName: image.fileName, mime });
    if (!stored.some((item) => item.slot === image.slot && item.sha256 === sha256)) stored.push({ slot: image.slot, sha256 });
  }
  return stored;
}

export function productWorkbookImageMime(bytes: Uint8Array): string | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if ([255, 216, 255].every((byte, index) => bytes[index] === byte)) return 'image/jpeg';
  if ([82, 73, 70, 70].every((byte, index) => bytes[index] === byte) && [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)) return 'image/webp';
  return null;
}

function materialRows(sheet: SheetLike, context: ParseContext): MaterialRow[] {
  const columns = columnsOf(sheet, { required: [BARCODE, PART_BARCODE], issues: context.issues });
  const existing = new Set<string>();
  const result: MaterialRow[] = [];
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    const scope = { ...context, sheet, row, columns };
    if (!hasValues(scope, MATERIAL_COLUMNS)) continue;
    const built = materialRow(scope, existing);
    if (built !== null) result.push(built);
  }
  return result;
}

function materialRow(scope: Row, existing: Set<string>): MaterialRow | null {
  const barcode = barcodeOf(scope);
  const partCode = partCodeOf(scope);
  const operation = text(scope, OPERATION);
  if (partCode === null) issue(scope, { field: PART_BARCODE, message: '请填写此产品下的完整子件条码' });
  if (barcode === null || partCode === null) return null;
  if (!uniqueRow(scope, { seen: existing, key: JSON.stringify([barcode, partCode]), field: PART_BARCODE, message: '此产品的子件前面已有一行，请合并后重新上传' })) return null;
  const identity = { row: scope.row, barcode, partCode };
  if (operation === '删除') return { ...identity, operation: 'remove' };
  if (operation !== null && operation !== '更新') issue(scope, { field: OPERATION, message: '此列留空，或填写「更新」「删除」' });
  return { ...identity, operation: 'upsert', ...materialFields(scope) };
}

function partCodeOf(scope: Row): string | null {
  const raw = text(scope, PART_BARCODE);
  if (raw === null) return null;
  const input = cell(scope, PART_BARCODE);
  const display = input?.kind === 'number' ? input.displayText?.normalize('NFKC').trim() : undefined;
  const isPadded = display !== undefined && /^0+\d+$/u.test(display) && display.replace(/^0+(?=\d)/u, '') === raw;
  return parseItemCode(isPadded ? display : raw, { isBomPartColumn: true }).value?.codeNorm ?? raw;
}

function materialFields(scope: Row) {
  const owner = text(scope, OWNER);
  if (owner !== null && owner.length > OWNER_LENGTH) issue(scope, { field: OWNER, message: '负责人最多填写 100 个字符' });
  const reorderCount = quantity(scope, { field: '成品翻单次数', scale: 0, max: 2_147_483_647 });
  const cumulativeQty = quantity(scope, { field: '累计数量', scale: 4, max: 999_999_999_999.9999 });
  return {
    owner, reorderCount, cumulativeQty,
    productName: text(scope, '产品名称'), partName: text(scope, '子件名称'),
    mergedFill: ['成品翻单次数', '累计数量'].some((field) => cell(scope, field)?.mergedFrom !== undefined),
  };
}

function quantity(scope: Row, { field, scale, max }: { readonly field: string; readonly scale: number; readonly max: number }): number | null {
  const input = cell(scope, field);
  if (input !== null && !validateFormula(scope, { field, value: input })) return null;
  if (input === null || isNotProvided(input.text)) return null;
  const value = exactQty(input, scale);
  if (value === null || value > max) {
    issue(scope, { field, message: field === '累计数量' ? '请填写非负数量，最多保留 4 位小数' : '请填写有效的非负整数' });
    return null;
  }
  return value;
}

function barcodeOf(scope: Row): string | null {
  const cellValue = text(scope, BARCODE);
  const raw = validBarcode(cellValue, scope.anchorBarcode);
  const displayed = validBarcode(cell(scope, BARCODE)?.displayText, scope.anchorBarcode);
  if (raw !== null && displayed !== null && raw !== displayed) {
    issue(scope, { field: BARCODE, message: '产品条码原值和单元格显示值不一致，请将完整条码填写为文本' });
    return null;
  }
  const barcode = raw ?? displayed;
  if (barcode !== null) {
    scope.barcodeRows.push({ sheet: scope.sheet.name, row: scope.row, barcode });
    return barcode;
  }
  issue(scope, { field: BARCODE, message: scope.anchorBarcode === null
    ? '请填写 13 位完整条码，渠道装保留「-2」等后缀'
    : `请填写当前产品的完整条码 ${scope.anchorBarcode}` });
  return null;
}

function validBarcode(input: string | null | undefined, anchorBarcode: string | null): string | null {
  if (input === null || input === undefined) return null;
  const { value, issues } = parseBarcode(input);
  return value === anchorBarcode || !issues.some(({ code }) => code === 'BARCODE_LENGTH') ? value : null;
}

function uniqueRow(scope: Row, { seen, key, field, message }: { readonly seen: Set<string>; readonly key: string; readonly field: string; readonly message: string }): boolean {
  if (seen.has(key)) {
    issue(scope, { field, message });
    return false;
  }
  seen.add(key);
  return true;
}

function hasValues(scope: Row, columns: readonly string[]): boolean {
  return columns.some((field) => hasCellValue(cell(scope, field)));
}

function hasCellValue(value: CellLike | null): boolean {
  return value?.kind === 'error' || value?.formula !== undefined || !isNotProvided(value?.text ?? '');
}

function text(scope: Row, field: string): string | null {
  const value = cell(scope, field);
  if (value !== null && !validateFormula(scope, { field, value })) return null;
  return readText(scope, compactHeader(field)).cell.value;
}

function validateFormula(scope: Row, { field, value }: { readonly field: string; readonly value: CellLike }): boolean {
  if (value.kind !== 'error' && (value.formula === undefined || value.text !== '')) return true;
  issue(scope, { field, message: '单元格公式没有有效结果，请改为明确的值' });
  return false;
}

function cell(scope: Row, field: string) {
  const column = scope.columns.get(compactHeader(field));
  return column === undefined ? null : scope.sheet.cell(scope.row, column);
}

function issue(scope: Row, { field, message }: { readonly field: string; readonly message: string }): void {
  scope.issues.push({ sheet: scope.sheet.name, row: scope.row, field, message });
}
