import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ImageSlot } from '@sw/domain';
import { INNER_IMAGE, OUTER_IMAGE } from './columns.js';

export type ArchiveImage = {
  readonly row: number;
  readonly col: number;
  readonly slot: ImageSlot;
  readonly fileName: string;
};

export function mountImages(sheet: SheetLike, columns: ReadonlyMap<string, number>): readonly ArchiveImage[] {
  const inner = columns.get(INNER_IMAGE);
  const outer = columns.get(OUTER_IMAGE);
  return (sheet.images ?? []).flatMap((image) => mounted({ image, inner, outer }));
}

function mounted({ image, inner, outer }: { readonly image: { readonly row: number; readonly col: number; readonly fileName: string }; readonly inner: number | undefined; readonly outer: number | undefined }): ArchiveImage[] {
  const slot = slotOf({ col: image.col, inner, outer });
  if (slot === null) return [];
  return [{ row: image.row, col: image.col, slot, fileName: image.fileName }];
}

function slotOf({ col, inner, outer }: { readonly col: number; readonly inner: number | undefined; readonly outer: number | undefined }): ImageSlot | null {
  if (col === inner) return 'inner';
  if (col === outer) return 'outer';
  return null;
}
