import { WorkbookUnreadableError } from '@sw/application/errors';
import { unzipSync, strFromU8 } from 'fflate';

export type ZipFiles = ReadonlyMap<string, Uint8Array>;

export function unzip(bytes: Uint8Array): ZipFiles {
  try {
    return new Map(Object.entries(unzipSync(bytes)));
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'number') {
      throw new WorkbookUnreadableError(error);
    }
    throw error;
  }
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
