import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { REQUIRED_SHEET_TITLES, sheetKind } from './spec/index.js';

const FULL_SCORE = 100;
const PARTIAL_SCORE = 40;

export type SheetGroups = {
  readonly ignored: readonly string[];
  readonly missingRequired: readonly string[];
};

export function detectFactoryProgress(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] } {
  const found = REQUIRED_SHEET_TITLES.filter((title) => hasSheet(book, title));
  if (found.length === 0) return { score: 0, reasons: ['没有代工厂进度的必需表'] };
  if (found.length < REQUIRED_SHEET_TITLES.length) return { score: PARTIAL_SCORE, reasons: found.map((title) => `找到 ${title}`) };
  return { score: FULL_SCORE, reasons: found.map((title) => `找到 ${title}`) };
}

export function groupSheets(book: WorkbookLike): SheetGroups {
  return {
    ignored: book.sheets.filter((sheet) => sheetKind(sheet.name) === 'ignored').map((sheet) => sheet.name),
    missingRequired: REQUIRED_SHEET_TITLES.filter((title) => !hasSheet(book, title)),
  };
}

export function findSheet(book: WorkbookLike, title: string) {
  return book.sheets.find((sheet) => sheet.name.trim() === title);
}

function hasSheet(book: WorkbookLike, title: string): boolean {
  return findSheet(book, title) !== undefined;
}
