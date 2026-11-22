import type { SheetLike } from '../../../../../application/src/ports/workbook-reader.js';
import type { PackagingComboPayload, PendingCodeLink } from '../../../../../application/src/ports/parsed-rows.js';
import { cellIssue, type ImportIssue, type Settings } from '@sw/domain';
import { numberField, poField, textField, type DraftRow } from '../fingerprint.js';
import { scanSheet } from '../scan.js';
import { take, type SheetReader } from '../read-cell.js';
import { SHEETS } from '../spec/index.js';

const BLANK_MARKS = new Set(['OK', '待定']);

export function parsePackagingCombo(input: {
  readonly sheet: SheetLike;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
}): { readonly rows: DraftRow<PackagingComboPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  const parsed = scanSheet({
    sheet: input.sheet,
    columns: SHEETS.packagingCombo.columns,
    date1904: input.date1904,
    dateSanityRange: input.dateSanityRange,
    fields: comboFields,
    build: ({ reader, row }) => buildRow(reader, row),
  });
  return { ...parsed, rows: parsed.rows.filter((row) => !isRepeatedHeader(row.payload)) };
}

function buildRow(reader: SheetReader, row: number): { readonly payload: PackagingComboPayload; readonly issues: ImportIssue[]; readonly links: PendingCodeLink[] } {
  const issues: ImportIssue[] = [];
  const payload = {
    po: take(issues, reader.po(row, '客户订单号')),
    itemCodeRaw: take(issues, reader.code(row, 'ERP编码')),
    nameRaw: take(issues, reader.text({ row, name: '产品名' })),
    specRaw: take(issues, reader.text({ row, name: '规格' })),
    qty: take(issues, reader.qty(row, '订单量')),
    comboSuppliersRaw: take(issues, reader.text({ row, name: '内包材组合供应商名称（容器或已塞膜）+花盒' })),
    bomCodeRaw: blankMark({ cell: take(issues, reader.code(row, '生产成品BOM')), issues, column: '生产成品BOM' }),
    materialPoRaw: blankMark({ cell: take(issues, reader.po(row, '采购单号')), issues, column: '采购单号' }),
  };
  return { payload, issues, links: [] };
}

function blankMark<T>({ cell, issues, column }: { readonly cell: { readonly raw: string | null; readonly value: T | null }; readonly issues: ImportIssue[]; readonly column: string }): { readonly raw: string | null; readonly value: T | null } {
  if (cell.raw === null || !BLANK_MARKS.has(cell.raw.trim())) return cell;
  issues.push(cellIssue({ code: 'ROW_EMPTY_LIKE', raw: cell.raw, column }));
  dropUnknown(issues, column);
  return { raw: cell.raw, value: null };
}

function dropUnknown(issues: ImportIssue[], column: string): void {
  for (let index = issues.length - 1; index >= 0; index -= 1) {
    const issue = issues[index];
    if (issue !== undefined && issue.column === column && (issue.code === 'CODE_UNKNOWN_PATTERN' || issue.code === 'PO_UNKNOWN_FORMAT' || issue.code === 'PO_PLACEHOLDER')) {
      issues.splice(index, 1);
    }
  }
}

function isRepeatedHeader(payload: PackagingComboPayload): boolean {
  return payload.nameRaw.value === '产品名' && payload.itemCodeRaw.raw === 'ERP编码';
}

function comboFields(payload: PackagingComboPayload): string[] {
  return [poField(payload.po), textField(payload.itemCodeRaw), textField(payload.nameRaw), textField(payload.specRaw), numberField(payload.qty), textField(payload.comboSuppliersRaw), textField(payload.bomCodeRaw), poField(payload.materialPoRaw)];
}
