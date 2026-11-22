import { templateIdLabel } from '@sw/domain';
import type { CommitContext, CommitResult } from '../../../application/src/imports/commit/context.js';
import type { ImportFacts, ImportFingerprint, ImportTemplate } from '../../../application/src/ports/import-template.js';
import type { ImportExisting, ImportParseContext, ParsedImport } from '../../../application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../../application/src/ports/workbook-reader.js';

/** 一个模板的完整登记项，检测、解析、比对、身份和提交都在这一份描述里。 */
export type TemplateManifest = {
  readonly id: string;
  readonly label: string;
  readonly requiresFactory: boolean;
  readonly columns: readonly string[];
  readonly detect: (book: WorkbookLike) => { readonly score: number; readonly reasons: readonly string[] };
  readonly parse: (book: WorkbookLike, ctx: ImportParseContext) => ParsedImport;
  readonly diff: (parsed: ParsedImport, existing: ImportExisting) => ParsedImport;
  readonly identityOf: (parsed: ParsedImport) => readonly ImportFingerprint[];
  readonly existingFrom: (records: readonly ImportFingerprint[]) => ImportExisting;
  readonly factsOf: (parsed: ParsedImport) => ImportFacts;
  readonly commit: (ctx: CommitContext) => Promise<CommitResult>;
  readonly importTemplate: () => ImportTemplate | null;
};

export function knownManifest(input: {
  readonly template: ImportTemplate;
  readonly columns: readonly string[];
  readonly commit: TemplateManifest['commit'];
}): TemplateManifest {
  const template = input.template;
  return {
    id: template.id,
    label: templateIdLabel(template.id),
    requiresFactory: template.requiresFactory,
    columns: input.columns,
    detect: (book) => template.detect(book),
    parse: (book, ctx) => template.parse(book, ctx),
    diff: (parsed, existing) => template.diff(parsed, existing),
    identityOf: (parsed) => template.identityOf(parsed),
    existingFrom: (records) => template.existingFrom(records),
    factsOf: (parsed) => template.factsOf(parsed),
    commit: input.commit,
    importTemplate: () => template,
  };
}
