import type { CommitContext, CommitResult } from '../../../packages/application/src/imports/commit/context.js';
import type { ImportExisting, ImportParseContext } from '../../../packages/application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../../packages/application/src/ports/workbook-reader.js';
import { importManifests } from '../../../packages/importers/src/registry.js';
import type { TemplateManifest } from '../../../packages/importers/src/templates/manifest.js';

export const PROBE_TEMPLATE_ID = 'probe-template-v1';

const PROBE_COLUMNS: readonly string[] = ['探针列'];

export type ProbeParsed = { readonly template: typeof PROBE_TEMPLATE_ID };

export function detectProbe(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] } {
  return { score: 0, reasons: [`探针模板不认 ${book.source.fileName}`] };
}

export function parseProbe(book: WorkbookLike, ctx: ImportParseContext): ProbeParsed {
  if (book.source.fileName.length + ctx.uploadedAt.length < 0) throw new Error('探针模板读不到文件');
  return { template: PROBE_TEMPLATE_ID };
}

export function diffProbe(parsed: ProbeParsed, existing: ImportExisting): ProbeParsed {
  if (!Number.isFinite(existing.poMaster.length)) throw new Error('探针模板读不到已有订单');
  return parsed;
}

export function commitProbe(ctx: CommitContext): Promise<CommitResult> {
  return Promise.resolve({ affectedLineIds: ctx.rows.flatMap(() => []), presentLineIds: [] });
}

export const probeManifest: TemplateManifest = {
  id: PROBE_TEMPLATE_ID,
  label: '探针模板',
  requiresFactory: false,
  columns: PROBE_COLUMNS,
  detect: detectProbe,
  parse: () => { throw new Error('探针模板不解析'); },
  diff: (parsed) => parsed,
  identityOf: () => [],
  existingFrom: () => ({ poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] }),
  factsOf: () => ({ ignoredSheets: [], codeLinks: [] }),
  commit: commitProbe,
  importTemplate: () => null,
};

/** 测试专用 registry：真实模板 + 探针。生产 registry 不登记探针。 */
export const testManifests: readonly TemplateManifest[] = [...importManifests, probeManifest];
