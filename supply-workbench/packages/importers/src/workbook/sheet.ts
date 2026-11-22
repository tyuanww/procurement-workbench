import type { CellLike, SheetLike } from '../../../application/src/ports/workbook-reader.js';

export type CellDraft = Omit<CellLike, 'mergedFrom'>;

export type MergeRange = { readonly r1: number; readonly c1: number; readonly r2: number; readonly c2: number };

export type ImageAnchor = { readonly row: number; readonly col: number; readonly fileName: string; readonly data: Uint8Array };

export function buildSheet(input: {
  readonly name: string;
  readonly hidden: boolean;
  readonly cells: ReadonlyMap<string, CellDraft>;
  readonly merges: readonly MergeRange[];
  readonly images?: readonly ImageAnchor[];
}): SheetLike {
  const rowCount = maxRow(input.cells, input.merges);
  return {
    name: input.name,
    hidden: input.hidden,
    rowCount,
    merges: input.merges,
    ...(input.images === undefined ? {} : { images: input.images }),
    cell(row, col) {
      return cellAt({ cells: input.cells, merges: input.merges, row, col });
    },
  };
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function cellAt(input: { readonly cells: ReadonlyMap<string, CellDraft>; readonly merges: readonly MergeRange[]; readonly row: number; readonly col: number }): CellLike | null {
  const direct = input.cells.get(cellKey(input.row, input.col));
  if (direct !== undefined) return direct;
  const origin = mergeOrigin({ merges: input.merges, row: input.row, col: input.col });
  if (origin === null) return null;
  return filledFrom(input.cells.get(cellKey(origin.row, origin.col)), origin);
}

function filledFrom(source: CellDraft | undefined, origin: { readonly row: number; readonly col: number }): CellLike {
  if (source === undefined) return { kind: 'empty', value: null, text: '', mergedFrom: origin };
  if (source.formula === undefined) return { ...source, mergedFrom: origin };
  return { ...source, formula: source.formula, mergedFrom: origin };
}

function mergeOrigin({ merges, row, col }: { readonly merges: readonly MergeRange[]; readonly row: number; readonly col: number }): { readonly row: number; readonly col: number } | null {
  for (const merge of merges) {
    if (!isInside({ merge, row, col }) || isOriginCell({ merge, row, col })) continue;
    return { row: merge.r1, col: merge.c1 };
  }
  return null;
}

function isInside({ merge, row, col }: { readonly merge: MergeRange; readonly row: number; readonly col: number }): boolean {
  return row >= merge.r1 && row <= merge.r2 && col >= merge.c1 && col <= merge.c2;
}

function isOriginCell({ merge, row, col }: { readonly merge: MergeRange; readonly row: number; readonly col: number }): boolean {
  return row === merge.r1 && col === merge.c1;
}

function maxRow(cells: ReadonlyMap<string, CellDraft>, merges: readonly MergeRange[]): number {
  let row = 0;
  for (const key of cells.keys()) {
    const parsed = Number(key.split(':')[0]);
    if (parsed > row) row = parsed;
  }
  for (const merge of merges) if (merge.r2 > row) row = merge.r2;
  return row;
}
