import { entityId, normalizeText, type EntityId, type PartyAlias } from '@sw/domain';
import type { ImportTemplate } from '../../ports/import-template.js';
import type { ImportExisting, ParsedImport } from '../../ports/parsed-rows.js';
import type { WorkbookLike } from '../../ports/workbook-reader.js';
import type { ImportRow } from '@sw/domain';

const EMPTY_EXISTING: ImportExisting = { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };

export function parseChosen(input: {
  readonly templates: readonly ImportTemplate[];
  readonly templateId: ImportTemplate['id'];
  readonly book: WorkbookLike;
  readonly uploadedAt: string;
  readonly factoryPartyId: string | null;
  readonly factoryNameRaw?: string | null;
  readonly existing?: ImportExisting;
}): ParsedImport {
  const template = input.templates.find((item) => item.id === input.templateId);
  if (template === undefined) throw new Error(`没有模板 ${input.templateId}`);
  const parsed = template.parse(input.book, {
    uploadedAt: input.uploadedAt,
    factoryPartyId: input.factoryPartyId,
    ...(input.factoryNameRaw === undefined ? {} : { factoryNameRaw: input.factoryNameRaw }),
  });
  return template.diff(parsed, input.existing ?? EMPTY_EXISTING);
}

export function importRowsOf(input: { readonly batchId: EntityId; readonly parsed: ParsedImport; readonly ids: { next(): EntityId } }): ImportRow[] {
  return rowsOf(input.parsed).map((row) => ({
    id: input.ids.next(),
    importBatchId: input.batchId,
    sheetName: row.sheetName,
    rowNo: row.rowNo,
    raw: row.payload,
    parsed: parsedWithFingerprint(row.payload, row.fingerprint),
    issues: row.issues,
    action: row.action ?? 'create',
    targetId: null,
    skipReason: row.skipReason,
  }));
}

function parsedWithFingerprint(payload: unknown, fingerprint: string | undefined): unknown {
  if (fingerprint === undefined) return payload;
  if (!isRecord(payload)) return { fingerprint };
  return { ...payload, fingerprint };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function aliasOf({ name, at, batchId = null }: { readonly name: string; readonly at: string; readonly batchId?: EntityId | null | undefined }): PartyAlias {
  const normName = normalizeText(name);
  return {
    id: entityId(`alias:${normName}`),
    createdAt: at,
    updatedAt: at,
    rawName: name,
    normName,
    partyId: null,
    status: 'pending',
    firstSeenImportBatchId: batchId,
    seenCount: 1,
    reviewedBy: null,
    reviewedAt: null,
  };
}

function rowsOf(parsed: ParsedImport): readonly { readonly sheetName: string; readonly rowNo: number; readonly payload: unknown; readonly fingerprint?: string; readonly issues: ImportRow['issues']; readonly action: ImportRow['action'] | null; readonly skipReason: string | null }[] {
  if (parsed.template === 'factory-progress-v1') {
    return [...parsed.inTransit, ...parsed.shipments, ...parsed.stock, ...parsed.schedule, ...parsed.demand, ...parsed.packagingCombo, ...parsed.customerSupplied];
  }
  return parsed.rows;
}
