import type { ImportRow, OrderLine } from '@sw/domain';
import type { ParsedImport, PoMasterPayload } from '../ports/parsed-rows.js';
import { StateConflictError } from '../shared/errors.js';
import { procurementSourceKey } from '../shared/procurement-source.js';
import type { CommitContext } from './commit/context.js';
import { poMasterPayloadDigest, samePoMasterPayload } from './po-master-payload.js';
import { latestPoMaster } from './use-cases/po-existing.js';

type Comparison = {
  readonly expected: Readonly<Record<string, unknown>> | undefined;
  readonly latest: ReadonlyMap<string, PoMasterPayload>;
};

export async function procurementComparisonMetadata(parsed: ParsedImport) {
  if (parsed.template !== 'po-master-v1' || parsed.procurement === undefined) return {};
  const entries = parsed.rows.flatMap((row) => row.comparedPayload === undefined ? [] : [
    digestForRow({ row, payload: row.comparedPayload }),
  ]);
  return { procurement: parsed.procurement, procurementComparison: Object.fromEntries(await Promise.all(entries)) };
}

async function digestForRow(input: { readonly row: Pick<ImportRow, 'sheetName' | 'rowNo'>; readonly payload: PoMasterPayload }) {
  return [procurementSourceKey(input.row), await poMasterPayloadDigest(input.payload)] as const;
}

export async function loadPoMasterComparison(ctx: CommitContext, isProcurementWorkbook: boolean): Promise<Comparison | undefined> {
  if (!isProcurementWorkbook) return undefined;
  const meta = ctx.batch.fileMeta;
  const expected = isRecord(meta) && isRecord(meta.procurementComparison) ? meta.procurementComparison : undefined;
  const sources = await latestPoMaster(ctx.tx);
  return { expected, latest: new Map(sources.map(({ candidateKey, values }) => [candidateKey, values])) };
}

export async function verifyPoMasterComparison({ comparison, row, existing, payload }: {
  readonly comparison: Comparison | undefined;
  readonly row: ImportRow;
  readonly existing: OrderLine | undefined;
  readonly payload: PoMasterPayload;
}): Promise<void> {
  if (comparison === undefined || row.targetId !== null) return;
  const latest = existing?.candidateKey == null ? undefined : comparison.latest.get(existing.candidateKey);
  if (latest !== undefined && samePoMasterPayload(latest, payload)) return;
  if (row.action !== 'unchanged' && await matchesBaseline({ expected: comparison.expected, latest, row, isNewLine: existing === undefined })) return;
  throw new StateConflictError('po_master_preview');
}

async function matchesBaseline({ latest, expected, row, isNewLine }: {
  readonly latest: PoMasterPayload | undefined;
  readonly expected: Comparison['expected'];
  readonly row: ImportRow;
  readonly isNewLine: boolean;
}): Promise<boolean> {
  if (expected === undefined) return isNewLine && row.action === 'create';
  const digest = expected[procurementSourceKey(row)];
  return latest === undefined ? digest === undefined : typeof digest === 'string' && await poMasterPayloadDigest(latest) === digest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
