import { WorkbookUnreadableError } from '@sw/application/errors';
import { Unzip, UnzipInflate, unzipSync, strFromU8 } from 'fflate';

export type ZipFiles = ReadonlyMap<string, Uint8Array>;

export type WorkbookArchiveLimits = {
  readonly entries: number; readonly uncompressedBytes: number;
  readonly sheets: number; readonly rows: number; readonly cells: number; readonly mergedRanges: number;
};

export function unzip(bytes: Uint8Array, limits?: WorkbookArchiveLimits): ZipFiles {
  try {
    if (bytes.length < 22) throw new WorkbookUnreadableError();
    return limits === undefined ? new Map(Object.entries(unzipSync(bytes))) : unzipBounded(bytes, limits);
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'number') {
      throw new WorkbookUnreadableError(error);
    }
    throw error;
  }
}

function unzipBounded(bytes: Uint8Array, limits: WorkbookArchiveLimits): ZipFiles {
  const files = new Map<string, Uint8Array>();
  const names = new Set<string>();
  let expanded = 0;
  const archive = new Unzip((file) => {
    const name = file.name.toLowerCase();
    if (names.size >= limits.entries || names.has(name) || (file.originalSize ?? 0) > limits.uncompressedBytes - expanded
      || name.startsWith('/') || /[\\\0]/u.test(name) || name.split('/').some((part) => part === '..' || part === '.')) {
      throw new WorkbookUnreadableError();
    }
    names.add(name);
    const chunks: Uint8Array[] = [];
    let length = 0;
    // fflate calls this callback with the error, output chunk, and final flag.
    // eslint-disable-next-line max-params
    file.ondata = (error, chunk, final) => {
      if (error !== null) throw new WorkbookUnreadableError(error);
      expanded += chunk.byteLength;
      if (expanded > limits.uncompressedBytes) throw new WorkbookUnreadableError();
      chunks.push(chunk);
      length += chunk.byteLength;
      if (final) {
        if (file.originalSize !== undefined && file.originalSize !== length) throw new WorkbookUnreadableError();
        files.set(file.name, joinChunks(chunks, length));
      }
    };
    file.start();
  });
  archive.register(UnzipInflate);
  const chunkSize = 4 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    archive.push(bytes.subarray(offset, offset + chunkSize), offset + chunkSize >= bytes.byteLength);
  }
  if (files.size !== names.size) throw new WorkbookUnreadableError();
  return files;
}

function joinChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function xmlText(files: ZipFiles, path: string): string | null {
  const bytes = files.get(path);
  if (bytes === undefined) return null;
  return strFromU8(bytes);
}

export function decodeXml(value: string): string {
  return value
    .replaceAll(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}
