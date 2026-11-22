import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';

export const PLANNER_SHEET_COLUMNS = ['排产日期', '订单号', '品名', '下单品号', '要求排产', '包材组合', '生产品号', '采购单号', '备注'] as const;

const HEADER_SCAN_ROWS = 3;
const HEADER_SCAN_COLS = 40;

export type PlannerHeader = {
  readonly dateCol: number;
  readonly poCol: number;
  readonly nameCol: number;
  readonly orderItemCol: number;
  readonly qtyCol: number;
  readonly comboCol: number;
  readonly productionItemCol: number;
  readonly materialPoCol: number;
  readonly noteCol: number;
  readonly lastHeaderRow: number;
};

export function headerOf(sheet: SheetLike): PlannerHeader | null {
  const found = new Map<string, { readonly col: number; readonly row: number }>();
  const lastRow = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
  for (let row = 1; row <= lastRow; row += 1) collectRow({ sheet, row, found });
  return headerFrom(found);
}

export function compactHeader(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, '');
}

function collectRow(input: { readonly sheet: SheetLike; readonly row: number; readonly found: Map<string, { readonly col: number; readonly row: number }> }): void {
  for (let col = 1; col <= HEADER_SCAN_COLS; col += 1) {
    const name = canonicalName(input.sheet.cell(input.row, col)?.text ?? '');
    if (name === null || input.found.has(name)) continue;
    input.found.set(name, { col, row: input.row });
  }
}

function headerFrom(found: Map<string, { readonly col: number; readonly row: number }>): PlannerHeader | null {
  const date = found.get('排产日期');
  const po = found.get('订单号');
  const name = found.get('品名');
  const orderItem = found.get('下单品号');
  const qty = found.get('要求排产');
  const combo = found.get('包材组合');
  const productionItem = found.get('生产品号');
  const materialPo = found.get('采购单号');
  const note = found.get('备注');
  if (date === undefined || po === undefined || name === undefined || orderItem === undefined || qty === undefined || combo === undefined || productionItem === undefined || materialPo === undefined || note === undefined) return null;
  return {
    dateCol: date.col,
    poCol: po.col,
    nameCol: name.col,
    orderItemCol: orderItem.col,
    qtyCol: qty.col,
    comboCol: combo.col,
    productionItemCol: productionItem.col,
    materialPoCol: materialPo.col,
    noteCol: note.col,
    lastHeaderRow: Math.max(date.row, po.row, name.row, orderItem.row, qty.row, combo.row, productionItem.row, materialPo.row, note.row),
  };
}

function canonicalName(text: string): (typeof PLANNER_SHEET_COLUMNS)[number] | null {
  const compact = compactHeader(text);
  if (compact.startsWith('包材组合')) return '包材组合';
  for (const name of PLANNER_SHEET_COLUMNS) {
    if (compact === name) return name;
  }
  return null;
}
