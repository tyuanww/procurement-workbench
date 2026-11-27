import { hash } from 'node:crypto';
import { FileTooLargeError, FileTypeNotAllowedError, ValidationFailedError, WorkbookUnreadableError } from '@sw/application/errors';
import type { DevelopmentWorkbookCandidate, DevelopmentWorkbookConflict, DevelopmentWorkbookEvidence, DevelopmentWorkbookPreview, DevelopmentWorkbookRow } from '../../../../application/src/ports/development-workbook.js';
import type { CellLike, SheetLike, WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { parseLocalDate, type DevelopmentProjectStage, type LocalDate, type ProductDevelopmentStore } from '@sw/domain';
import { excelSerialToLocalDate, readXlsx } from '../../workbook/index.js';

export const DEVELOPMENT_WORKBOOK_MAX_BYTES = 4 * 1024 * 1024;
const ARCHIVE_LIMITS = { entries: 96, uncompressedBytes: 24 * 1024 * 1024, sheets: 24, rows: 20_000, cells: 250_000, mergedRanges: 500 };
const MAX_HEADER_ROWS = 12;
const MAX_SHEET_ROWS = 2_500;
const MAX_HEADER_COLUMNS = 256;
const MAX_NAMED_COLUMNS = 40;
const MAX_ROW_TEXT = 65_536;
const MAX_TOTAL_TEXT = 1_500_000;
const MAX_DUPLICATE_REFERENCES = 12_000;

const TAB_STAGES = new Map<string, DevelopmentProjectStage>([['开发中产品', 'development'], ['已下单产品', 'ordered']]);
const FIELD_HEADERS = {
  title: ['产品名', '产品名称'],
  contacts: ['项目对接人'],
  currentNote: ['主要事项', '当前事项', '当前备注'],
  required: ['需求入仓时间', 'OA需求入仓时间', '需求入仓日期'],
  forecast: ['预计入仓时间', '预计入仓日期'],
  orderQty: ['订单数量', '下单数量'],
  stage: ['状态', '项目状态', '产品状态', '项目阶段', '产品阶段'],
} satisfies Record<string, readonly string[]>;

type WorkbookInput = { readonly bytes: Uint8Array; readonly fileName: string; readonly store: ProductDevelopmentStore };
type PreviewSheet = { readonly sheet: SheetLike; readonly tabStage: DevelopmentProjectStage };
type HeaderColumn = { readonly column: number; readonly label: string };
type Header = { readonly row: number; readonly title: HeaderColumn; readonly columns: readonly HeaderColumn[] };
type RowScope = { readonly sheet: SheetLike; readonly row: number; readonly date1904: boolean };
type PreviewRow = DevelopmentWorkbookRow & { readonly titleCell: DevelopmentWorkbookEvidence | null };
type BookContext = { readonly date1904: boolean; readonly fingerprint: string; readonly store: ProductDevelopmentStore };

export function previewDevelopmentWorkbook(input: WorkbookInput): DevelopmentWorkbookPreview {
  assertUpload(input);
  const { bytes, fileName, store } = input;
  const workbook = openWorkbook(input);
  const context = { date1904: workbook.date1904, fingerprint: hash('sha256', bytes, 'hex'), store };
  const result: DevelopmentWorkbookPreview = { fileName, sheets: [], candidates: [], unidentifiedRows: [] };
  let remaining = MAX_TOTAL_TEXT;
  for (const found of recognizedSheets(workbook)) {
    const { sheet } = found;
    const header = findHeader(sheet);
    result.sheets.push({ name: sheet.name, headerRow: header?.row ?? null, hidden: sheet.hidden });
    if (header !== null) remaining = appendRows({ ...found, header, context, result, remaining });
  }
  addDuplicateConflicts(result.candidates);
  return result;
}

function assertUpload({ bytes, fileName }: WorkbookInput): void {
  if (!/\.xlsx$/iu.test(fileName)) throw new FileTypeNotAllowedError();
  if (bytes.byteLength > DEVELOPMENT_WORKBOOK_MAX_BYTES) throw new FileTooLargeError('import');
  if (fileName.length > 255) throw new ValidationFailedError('文件名不能超过 255 个字符');
}

function appendRows({ sheet, tabStage, header, context, result, remaining }: PreviewSheet & {
  readonly header: Header; readonly context: BookContext; readonly result: DevelopmentWorkbookPreview; readonly remaining: number;
}): number {
  let available = remaining;
  for (let row = header.row + 1; row <= sheet.rowCount; row += 1) {
    const source = readRow({ sheet, row, date1904: context.date1904 }, header);
    if (source.evidence.length === 0) continue;
    available -= textSize(source.evidence);
    if (available < 0) throw new ValidationFailedError('预览内容过多，请将新品进度表分开上传');
    const candidate = candidateOf({ source, sheet, tabStage, ...context });
    if (candidate === null) result.unidentifiedRows.push({ source: source.source, evidence: source.evidence });
    else result.candidates.push(candidate);
  }
  return available;
}

function openWorkbook({ bytes, fileName }: WorkbookInput): WorkbookLike {
  try {
    return readXlsx({ bytes, fileName, options: { archiveLimits: ARCHIVE_LIMITS, captureCalendarDates: true } });
  } catch (error) {
    throw new WorkbookUnreadableError(error);
  }
}

function recognizedSheets(workbook: WorkbookLike): PreviewSheet[] {
  const result: PreviewSheet[] = [];
  const seen = new Set<string>();
  for (const sheet of workbook.sheets) {
    const name = sheet.name.trim();
    const tabStage = TAB_STAGES.get(name);
    if (tabStage === undefined) continue;
    if (seen.has(name)) throw new ValidationFailedError(`请为「${name}」保留一个工作表`);
    if (sheet.name.length > 31 || sheet.rowCount > MAX_SHEET_ROWS || sheet.columnCount > MAX_HEADER_COLUMNS) {
      throw new ValidationFailedError(`「${name}」的范围过大，请分开上传`);
    }
    seen.add(name);
    result.push({ sheet, tabStage });
  }
  return result;
}

function findHeader(sheet: SheetLike): Header | null {
  for (let row = 1; row <= Math.min(sheet.rowCount, MAX_HEADER_ROWS); row += 1) {
    const columns = headerColumns(sheet, row);
    const titleColumns = columns.filter(({ label }) => matchesField(label, 'title'));
    const title = titleColumns[0];
    if (title === undefined) continue;
    if (titleColumns.length > 1) throw new ValidationFailedError(`「${sheet.name}」有重复的产品名称列`);
    if (columns.length > MAX_NAMED_COLUMNS || columns.some(({ label }) => label.length > 255)) {
      throw new ValidationFailedError(`「${sheet.name}」的表头范围过大，请分开上传`);
    }
    return { row, title, columns };
  }
  return null;
}

function headerColumns(sheet: SheetLike, row: number): HeaderColumn[] {
  const columns: HeaderColumn[] = [];
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const cell = sheet.cell(row, column);
    if (cell?.kind === 'string' && cell.mergedFrom === undefined && cell.text.trim() !== '') columns.push({ column, label: cell.text });
  }
  return columns;
}

function matchesField(label: string, field: keyof typeof FIELD_HEADERS): boolean {
  const header = label.normalize('NFKC').replace(/\s/gu, '').replace(/[(@].*$/u, '').replace(/oa/giu, 'OA');
  return FIELD_HEADERS[field].includes(header);
}

function readRow(scope: RowScope, header: Header): PreviewRow {
  const source = { sheet: scope.sheet.name, row: scope.row };
  const evidence: DevelopmentWorkbookEvidence[] = [];
  let titleCell: DevelopmentWorkbookEvidence | null = null;
  for (const column of header.columns) {
    const cell = readEvidence(scope, column);
    if (cell === null) continue;
    evidence.push(cell);
    if (column.column === header.title.column) titleCell = cell;
  }
  if (textSize(evidence) > MAX_ROW_TEXT) throw new ValidationFailedError(`「${source.sheet}」第 ${source.row} 行的原文过长`);
  return { source, evidence, titleCell };
}

function readEvidence({ sheet, row, date1904 }: RowScope, { column, label }: HeaderColumn): DevelopmentWorkbookEvidence | null {
  const cell = sheet.cell(row, column);
  if (cell === null || cell.mergedFrom !== undefined) return null;
  const displayText = displayed(cell);
  if (displayText.trim() === '' && cell.formula === undefined && (cell.value === null || cell.value === '')) return null;
  const date = sourceDate(cell, date1904);
  return {
    sheet: sheet.name, row, cell: `${columnName(column)}${row}`, label,
    rawValue: rawValue(cell), displayText,
    ...(cell.formula === undefined ? {} : { formula: cell.formula }),
    ...(date === undefined ? {} : { date }),
  };
}

function displayed(cell: CellLike): string {
  return cell.displayText ?? (cell.text || cell.richText || '');
}

function rawValue(cell: CellLike): DevelopmentWorkbookEvidence['rawValue'] {
  return typeof cell.value === 'number' && !Number.isFinite(cell.value) ? null : cell.value;
}

function sourceDate(cell: CellLike, date1904: boolean): LocalDate | undefined {
  if (cell.formula !== undefined) return undefined;
  if (cell.kind === 'string') return textDate(cell.text);
  if (cell.kind !== 'number' || cell.calendarDateFormatted !== true || typeof cell.value !== 'number') return undefined;
  return nativeDate(cell.value, date1904);
}

function nativeDate(value: number, date1904: boolean): LocalDate | undefined {
  const [first, end] = date1904 ? [0, 2_957_004] : [61, 2_958_466];
  return value >= first && value < end ? excelSerialToLocalDate(value, date1904) : undefined;
}

function textDate(text: string): LocalDate | undefined {
  const fullDate = /^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?$/u.exec(text.trim());
  const [, year, month, day] = fullDate ?? [];
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const date = parseLocalDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  return date.ok ? date.value : undefined;
}

function columnName(number: number): string {
  let label = '';
  for (let column = number; column > 0; column = Math.floor((column - 1) / 26)) {
    label = String.fromCharCode(65 + (column - 1) % 26) + label;
  }
  return label;
}

function textSize(evidence: readonly DevelopmentWorkbookEvidence[]): number {
  return evidence.reduce((sum, cell) => sum + (typeof cell.rawValue === 'string' ? cell.rawValue.length : cell.displayText.length) + (cell.formula?.length ?? 0), 0);
}

type CandidateScope = PreviewSheet & { readonly source: PreviewRow; readonly fingerprint: string; readonly store: ProductDevelopmentStore };

function candidateOf({ source, sheet, tabStage, fingerprint, store }: CandidateScope): DevelopmentWorkbookCandidate | null {
  const { titleCell, evidence } = source;
  if (titleCell === null || titleCell.formula !== undefined || typeof titleCell.rawValue !== 'string') return null;
  const title = titleCell.rawValue.trim();
  if (title === '') return null;
  const { stage, conflicts } = inspectStages(evidence, tabStage);
  if (sheet.hidden || sheet.hiddenRows?.has(source.source.row) === true) conflicts.push(conflict('hidden_row', [titleCell]));
  return {
    source: source.source,
    id: stableCandidateId({ fingerprint, store, ...source.source }),
    store, title, stage, evidence, conflicts,
    contacts: fieldEvidence(evidence, 'contacts'),
    currentNote: fieldEvidence(evidence, 'currentNote'),
    required: fieldEvidence(evidence, 'required'),
    forecast: fieldEvidence(evidence, 'forecast'),
  };
}

function fieldEvidence(evidence: readonly DevelopmentWorkbookEvidence[], field: keyof typeof FIELD_HEADERS): DevelopmentWorkbookEvidence | null {
  return evidence.find(({ label }) => matchesField(label, field)) ?? null;
}

function inspectStages(evidence: readonly DevelopmentWorkbookEvidence[], tabStage: DevelopmentProjectStage) {
  const conflicts: DevelopmentWorkbookConflict[] = [];
  const stages = stageEvidence(evidence);
  const [firstStage] = stages.keys();
  const stage = stages.size === 1 && firstStage !== undefined ? firstStage : null;
  if (stages.size > 1) conflicts.push(conflict('explicit_stage_conflict', [...stages.values()].flat()));
  const wrongStage = [...stages].filter(([mark]) => mark !== tabStage && !(tabStage === 'ordered' && mark === 'received'));
  if (wrongStage.length > 0) conflicts.push(conflict('tab_stage_mismatch', wrongStage.flatMap(([, cells]) => cells)));
  return { stage, conflicts };
}

function stageEvidence(cells: readonly DevelopmentWorkbookEvidence[]): Map<DevelopmentProjectStage, DevelopmentWorkbookEvidence[]> {
  const stages = new Map<DevelopmentProjectStage, DevelopmentWorkbookEvidence[]>();
  for (const cell of cells) {
    const mark = explicitStage(cell);
    if (mark === null) continue;
    const group = stages.get(mark) ?? [];
    group.push(cell);
    stages.set(mark, group);
  }
  return stages;
}

function explicitStage(cell: DevelopmentWorkbookEvidence): DevelopmentProjectStage | null {
  if (typeof cell.rawValue !== 'string' || cell.formula !== undefined) return null;
  const value = cell.rawValue.normalize('NFKC').trim();
  if (matchesField(cell.label, 'forecast')) return value === '已入仓' ? 'received' : null;
  if (matchesField(cell.label, 'orderQty')) return /^\d[\d,.]*\s*\([暂尚仍还]?未下单\)$/u.test(value) ? 'development' : null;
  if (matchesField(cell.label, 'stage')) return markedStage(value);
  return matchesField(cell.label, 'currentNote') && /^(?:[暂尚仍还]?未下单|已下单)$/u.test(value) ? markedStage(value) : null;
}

function markedStage(value: string): DevelopmentProjectStage | null {
  if (/^(?:产品状态\s*:\s*|状态\s*:\s*)?(?:开发中|[暂尚仍还]?未下单)$/u.test(value)) return 'development';
  if (/^(?:产品状态\s*:\s*|状态\s*:\s*)?已下单$/u.test(value)) return 'ordered';
  if (/^(?:产品状态\s*:\s*|状态\s*:\s*)?(?:已入仓|已收货)$/u.test(value)) return 'received';
  return null;
}

function conflict(kind: DevelopmentWorkbookConflict['kind'], evidence: DevelopmentWorkbookEvidence[]): DevelopmentWorkbookConflict {
  return { kind, evidence, relatedCandidateIds: [] };
}

function addDuplicateConflicts(candidates: DevelopmentWorkbookCandidate[]): void {
  const byTitle = new Map<string, DevelopmentWorkbookCandidate[]>();
  for (const candidate of candidates) {
    const group = byTitle.get(candidate.title) ?? [];
    group.push(candidate);
    byTitle.set(candidate.title, group);
  }
  let references = 0;
  for (const group of byTitle.values()) {
    for (const item of group) {
      const peers = group.filter((other) => other.source.sheet !== item.source.sheet
        || (other.stage !== null && item.stage !== null && other.stage !== item.stage));
      references += peers.length;
      if (references > MAX_DUPLICATE_REFERENCES) throw new ValidationFailedError('重名候选过多，请将新品进度表分开上传');
      if (peers.length > 0) {
        const labels = item.evidence.filter(({ label }) => matchesField(label, 'title'));
        item.conflicts.push({ kind: 'duplicate_title', evidence: labels, relatedCandidateIds: peers.map(({ id }) => id) });
      }
    }
  }
}

function stableCandidateId({ fingerprint, store, sheet, row }: { readonly fingerprint: string; readonly store: ProductDevelopmentStore; readonly sheet: string; readonly row: number }): string {
  const bits = hash('sha256', JSON.stringify([fingerprint, store, sheet, row]), 'hex');
  return `${bits.slice(0, 8)}-${bits.slice(8, 12)}-8${bits.slice(13, 16)}-8${bits.slice(17, 20)}-${bits.slice(20, 32)}`;
}
