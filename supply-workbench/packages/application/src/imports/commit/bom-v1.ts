import type { BomLine, ImportRow } from '@sw/domain';
import type { CommitContext, CommitResult } from './context.js';

export async function commitBom(ctx: CommitContext): Promise<CommitResult> {
  const grouped = new Map<string, BomLine[]>();
  for (const row of ctx.rows) addLine(grouped, bomLine(ctx, row));
  for (const barcode of [...grouped.keys()].sort()) await ctx.tx.bomLines.replace(barcode, grouped.get(barcode) ?? []);
  return { affectedLineIds: [], presentLineIds: [] };
}

function addLine(grouped: Map<string, BomLine[]>, line: BomLine | null): void {
  if (line === null) return;
  const current = grouped.get(line.productBarcodeRaw);
  grouped.set(line.productBarcodeRaw, current === undefined ? [line] : [...current, line]);
}

function bomLine(ctx: CommitContext, row: ImportRow): BomLine | null {
  if (row.action === 'skip' || row.action === 'unchanged' || !isBom(row.parsed)) return null;
  return {
    productBarcodeRaw: row.parsed.productBarcodeRaw,
    productName: row.parsed.productName,
    reorderCount: row.parsed.reorderCount,
    cumulativeQty: row.parsed.cumulativeQty,
    partCodeRaw: row.parsed.partCodeRaw,
    partName: row.parsed.partName,
    importBatchId: ctx.batch.id,
    rowNo: row.rowNo,
    mergedFill: row.parsed.mergedFill,
  };
}

function isBom(value: unknown): value is Omit<BomLine, 'importBatchId' | 'rowNo'> {
  if (!isRecord(value) || typeof value.mergedFill !== 'boolean') return false;
  return isText(value, 'productBarcodeRaw') && isText(value, 'productName') && isText(value, 'partCodeRaw') && isText(value, 'partName') && isNumberOrNull(value, 'reorderCount') && isNumberOrNull(value, 'cumulativeQty');
}

function isText(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function isNumberOrNull(value: Record<string, unknown>, key: string): boolean {
  return value[key] === null || typeof value[key] === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
