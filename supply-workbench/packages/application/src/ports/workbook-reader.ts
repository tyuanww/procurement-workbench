export interface CellLike {
  readonly kind: 'string' | 'number' | 'bool' | 'error' | 'empty';
  readonly value: string | number | boolean | null;
  readonly text: string;
  readonly richText?: string;
  readonly formula?: string;
  readonly mergedFrom?: { readonly row: number; readonly col: number };
}

export interface SheetLike {
  readonly name: string;
  readonly hidden: boolean;
  readonly rowCount: number;
  cell(row: number, col: number): CellLike | null;
  readonly merges: readonly { readonly r1: number; readonly c1: number; readonly r2: number; readonly c2: number }[];
  readonly images?: readonly { readonly row: number; readonly col: number; readonly fileName: string; readonly data: Uint8Array }[];
}

export interface WorkbookLike {
  readonly source: {
    readonly kind: 'xlsx' | 'csv' | 'feishu_sheet';
    readonly fileName: string;
    readonly createdAt?: string;
    readonly modifiedAt?: string;
  };
  readonly date1904: boolean;
  readonly sheets: readonly SheetLike[];
}

export interface WorkbookReader {
  /** 文件打不开时抛 WorkbookUnreadableError。单元格问题不在这里抛。 */
  read(bytes: Uint8Array, fileName: string): Promise<WorkbookLike>;
}
