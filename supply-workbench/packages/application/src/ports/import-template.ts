import type { TemplateId } from '@sw/domain';
import type { ImportExisting, ImportParseContext, ParsedImport } from './parsed-rows.js';
import type { WorkbookLike } from './workbook-reader.js';

export type ImportFingerprint = {
  readonly sheet: string;
  readonly rowNo: number;
  readonly fingerprint: string;
};

export type ImportFacts = {
  readonly ignoredSheets: readonly string[];
  readonly codeLinks: readonly { readonly fromCodeRaw: string; readonly toCodeRaw: string; readonly sheetName: string; readonly rowNo: number }[];
};

export type MountedImportImage = {
  readonly rowNo: number;
  readonly slot: 'inner' | 'outer';
  readonly sha256: string;
};

export interface ImportTemplate<T extends ParsedImport = ParsedImport> {
  readonly id: T['template'] & TemplateId;
  readonly requiresFactory: boolean;
  /** 分数和理由，不抛「认不出」。认不出由用例决定。 */
  detect(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] };
  /** 打不开或加密才抛错。单元格问题进 issues，不抛。 */
  parse(book: WorkbookLike, ctx: ImportParseContext): T;
  /** 按 03 的比对键填 action。不写库。 */
  diff(parsed: T, existing: ImportExisting): T;
  identityOf(parsed: ParsedImport): readonly ImportFingerprint[];
  existingFrom(records: readonly ImportFingerprint[]): ImportExisting;
  factsOf(parsed: ParsedImport): ImportFacts;
  mountImages?(book: WorkbookLike, put: (bytes: Uint8Array, fileName: string) => Promise<string>): Promise<readonly MountedImportImage[]>;
}

export type { ImportExisting, ImportParseContext, ParsedImport } from './parsed-rows.js';

export type DetectCandidate = {
  readonly template: TemplateId;
  readonly score: number;
  readonly reasons: readonly string[];
};
