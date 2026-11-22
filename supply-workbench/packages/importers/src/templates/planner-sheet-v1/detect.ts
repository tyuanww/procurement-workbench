import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { headerOf } from './columns.js';

const FACTORY_REQUIRED_SHEETS = ['在途订单汇总', '成品出货明细', '库存数量汇总'] as const;
const FULL_SCORE = 100;

export function detectPlannerSheet(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] } {
  if (FACTORY_REQUIRED_SHEETS.some((title) => book.sheets.some((sheet) => sheet.name.trim() === title))) {
    return { score: 0, reasons: ['整本含代工厂进度必需表，仍归代工厂进度'] };
  }
  if (book.sheets.some((sheet) => headerOf(sheet) !== null)) return { score: FULL_SCORE, reasons: ['排产作业表表头齐全'] };
  return { score: 0, reasons: ['没有排产作业表表头'] };
}
