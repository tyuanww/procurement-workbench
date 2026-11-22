import type { ImageSlot } from '@sw/domain';
import type { WorkbookLike } from '../../ports/workbook-reader.js';

const HEADER_SCAN = 40;
const INNER = '内包装图片';
const OUTER = '外包装图片';

export type ArchiveImageMount = {
  readonly rowNo: number;
  readonly slot: ImageSlot;
  readonly sha256: string;
};

export async function archiveImageMounts(
  book: WorkbookLike,
  put: (bytes: Uint8Array, fileName: string) => Promise<string>,
): Promise<ArchiveImageMount[]> {
  const sheet = book.sheets[0];
  if (sheet?.images === undefined) return [];
  const columns = headerColumns(sheet);
  const mounts: ArchiveImageMount[] = [];
  for (const image of sheet.images) {
    const slot = slotOf(image.col, columns);
    if (slot === null) continue;
    mounts.push({ rowNo: image.row, slot, sha256: await put(image.data, image.fileName) });
  }
  return mounts;
}

export function mountsOf(value: unknown): ArchiveImageMount[] {
  if (!isRecord(value) || !Array.isArray(value.images)) return [];
  return value.images.flatMap(mountOf);
}

function mountOf(value: unknown): ArchiveImageMount[] {
  if (!isRecord(value) || typeof value.rowNo !== 'number' || typeof value.sha256 !== 'string') return [];
  if (value.slot !== 'inner' && value.slot !== 'outer') return [];
  return [{ rowNo: value.rowNo, slot: value.slot, sha256: value.sha256 }];
}

function headerColumns(sheet: WorkbookLike['sheets'][number]): { readonly inner?: number; readonly outer?: number } {
  const found: { inner?: number; outer?: number } = {};
  for (let col = 1; col <= HEADER_SCAN; col += 1) {
    const name = compact(sheet.cell(1, col)?.text ?? '');
    if (name === INNER) found.inner = col;
    if (name === OUTER) found.outer = col;
  }
  return found;
}

function slotOf(col: number, columns: { readonly inner?: number; readonly outer?: number }): ImageSlot | null {
  if (col === columns.inner) return 'inner';
  if (col === columns.outer) return 'outer';
  return null;
}

function compact(text: string): string {
  return text.replace(/\s+/gu, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
