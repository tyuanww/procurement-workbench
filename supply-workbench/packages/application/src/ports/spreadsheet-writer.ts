import type { LocalDate } from '@sw/domain';

export type SheetCell = string | number | null | { readonly kind: 'date'; readonly day: LocalDate };

export interface SpreadsheetWriter {
  /** 单元格缺失用 null，不用 0 或空字符串代替。 */
  write(input: { readonly sheets: readonly { readonly name: string; readonly rows: readonly (readonly SheetCell[])[] }[] }): Uint8Array;
}
