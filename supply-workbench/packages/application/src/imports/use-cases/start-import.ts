import { importCoverageOf, importSourceKey, type EntityId, type ImportCoverage, type TemplateId } from '@sw/domain';
import type { StartImport, StartImportDeps } from '../boundary.js';
import type { StartImportInput } from '../views.js';
import type { ImportFingerprint, ImportTemplate } from '../../ports/import-template.js';
import type { ParsedImport } from '../../ports/parsed-rows.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ImportFactoryRequiredError, ImportTemplateUnknownError, NotFoundError, ValidationFailedError } from '../../shared/errors.js';
import { importRowsOf, parseChosen } from './parse-batch.js';
import { latestPoMaster } from './po-existing.js';
import { procurementComparisonMetadata } from '../po-master-comparison.js';
import { sha256Hex } from '../sha256.js';
import { previewConfirmedArrivals } from '../confirmed-arrival.js';

export const makeStartImport =
  (deps: StartImportDeps): StartImport =>
  async (input, actor) => {
    authorize(actor, 'imports.write');
    if (input.template === 'batch-confirmed-arrival-v1') authorize(actor, 'records.write');
    const template = requireTemplate(deps, input);
    const at = deps.clock.now();
    const bytes = await readBytes(deps, input.fileId);
    const book = await deps.workbooks.read(bytes, nameOf(bytes));
    const context = await readContext({ deps, template, input });
    const parsed = parsedOf({ deps, input, book, at, context });
    const images = await imagesOf({ deps, template, book });
    const facts = template.factsOf(parsed);
    const coverage = await trustedCoverage({ deps, input, parsedCoverage: parsed.coverage ?? 'full_snapshot', bytes, at });
    const procurement = await procurementComparisonMetadata(parsed);
    const started = { procurement, fingerprints: template.identityOf(parsed), failure: structuralFailure(parsed), images, facts, parsed, coverage, bytes, book, at };
    const batchId = deps.ids.next();
    await deps.uow.run((tx) => saveStarted({ tx, deps, input, actor, batchId, started }));
    return { importBatchId: batchId };
  };

function requireTemplate(deps: StartImportDeps, input: StartImportInput): ImportTemplate {
  const template = deps.templates.find((item) => item.id === input.template);
  if (template === undefined) throw new ImportTemplateUnknownError();
  if (template.requiresFactory && input.factoryPartyId === undefined) throw new ImportFactoryRequiredError();
  return template;
}

async function readBytes(deps: StartImportDeps, fileId: EntityId): Promise<Uint8Array> {
  const bytes = await deps.files.read(fileId);
  if (bytes === undefined) throw new NotFoundError('文件', fileId);
  return bytes;
}

function parsedOf(input: { readonly deps: StartImportDeps; readonly input: StartImportInput; readonly book: Awaited<ReturnType<StartImportDeps['workbooks']['read']>>; readonly at: string; readonly context: { readonly factoryName: string | null; readonly existing: ReturnType<ImportTemplate['existingFrom']> } }): ParsedImport {
  return parseChosen({
    templates: input.deps.templates,
    templateId: input.input.template,
    book: input.book,
    uploadedAt: input.at,
    factoryPartyId: input.input.factoryPartyId ?? null,
    ...(input.context.factoryName === null ? {} : { factoryNameRaw: input.context.factoryName }),
    existing: input.context.existing,
  });
}

async function imagesOf(input: { readonly deps: StartImportDeps; readonly template: ImportTemplate; readonly book: Awaited<ReturnType<StartImportDeps['workbooks']['read']>> }): Promise<readonly { readonly rowNo: number; readonly slot: 'inner' | 'outer'; readonly sha256: string }[]> {
  if (input.template.mountImages === undefined) return [];
  return input.template.mountImages(input.book, (imageBytes, fileName) => storeImage({ deps: input.deps, bytes: imageBytes, fileName }));
}

type Started = {
  readonly fingerprints: readonly ImportFingerprint[];
  readonly failure: string | null;
  readonly images: readonly { readonly rowNo: number; readonly slot: 'inner' | 'outer'; readonly sha256: string }[];
  readonly facts: ReturnType<ImportTemplate['factsOf']>;
  readonly parsed: ParsedImport;
  readonly procurement: Awaited<ReturnType<typeof procurementComparisonMetadata>>;
  readonly coverage: { readonly coverage: ImportCoverage; readonly attestationId?: string };
  readonly bytes: Uint8Array;
  readonly book: Awaited<ReturnType<StartImportDeps['workbooks']['read']>>;
  readonly at: string;
};

async function saveStarted(input: { readonly tx: UnitOfWorkStores; readonly deps: StartImportDeps; readonly input: StartImportInput; readonly actor: Parameters<StartImport>[1]; readonly batchId: EntityId; readonly started: Started }): Promise<void> {
  await rejectUsedAttestation(input.tx, input.started.coverage.attestationId);
  const started = input.started;
  const parsed = started.parsed.template === 'batch-confirmed-arrival-v1' ? await previewConfirmedArrivals(input.tx, started.parsed) : started.parsed;
  const batch = batchOf({ id: input.batchId, fileId: input.input.fileId, template: input.input.template, factoryPartyId: input.input.factoryPartyId ?? null, coverage: started.coverage.coverage, ...(started.coverage.attestationId === undefined ? {} : { coverageAttestationId: started.coverage.attestationId }), ...(started.parsed.candidateKeyVersion === undefined ? {} : { candidateKeyVersion: started.parsed.candidateKeyVersion }), at: started.at, actorId: input.actor.id, bytes: started.bytes.byteLength, sheets: started.book.sheets.map((sheet) => ({ name: sheet.name, hidden: sheet.hidden })), modifiedAt: started.book.source.modifiedAt ?? null, ignoredSheets: started.facts.ignoredSheets, pendingLinks: started.facts.codeLinks.length, codeLinks: started.facts.codeLinks, fingerprints: started.fingerprints, images: started.images, failure: started.failure });
  await input.tx.imports.save({ ...batch, fileMeta: { ...batch.fileMeta, ...started.procurement } });
  for (const row of importRowsOf({ batchId: input.batchId, parsed, ids: input.deps.ids })) await input.tx.imports.saveRow(row);
  await input.tx.audit.record(auditOf({ action: 'import.start', subject: { id: input.batchId }, ctx: { actor: input.actor, at: started.at, entity: '导入批次' } }));
}

async function rejectUsedAttestation(tx: UnitOfWorkStores, attestationId: string | undefined): Promise<void> {
  if (attestationId === undefined) return;
  if ((await tx.imports.list()).some((batch) => attestationIdOf(batch.fileMeta) === attestationId)) {
    throw new ValidationFailedError('导入覆盖声明已使用', { field: 'coverage' });
  }
}

function structuralFailure(parsed: ParsedImport): string | null {
  const rows = parsedRows(parsed);
  const hasHeaderOnFile = 'fileIssues' in parsed && parsed.fileIssues.some((issue) => issue.code === 'HEADER_NOT_FOUND');
  const hasHeaderOnRow = rows.some((row) => row.skipReason === 'HEADER_NOT_FOUND' || row.issues.some((issue) => issue.code === 'HEADER_NOT_FOUND'));
  const canImport = rows.some((row) => row.skipReason === null && row.action !== 'skip');
  if ((hasHeaderOnFile || hasHeaderOnRow) && !canImport) return '表头或必需的表找不到，不能当成导入成功';
  return null;
}

function parsedRows(parsed: ParsedImport): readonly { readonly skipReason: string | null; readonly action: string | null; readonly issues: readonly { readonly code: string }[] }[] {
  if ('inTransit' in parsed) {
    return [...parsed.inTransit, ...parsed.shipments, ...parsed.stock, ...parsed.schedule, ...parsed.demand, ...parsed.packagingCombo, ...parsed.customerSupplied];
  }
  return parsed.rows;
}

function batchOf(input: { readonly id: EntityId; readonly fileId: EntityId; readonly template: TemplateId; readonly factoryPartyId: EntityId | null; readonly coverage?: import('@sw/domain').ImportCoverage; readonly coverageAttestationId?: string; readonly candidateKeyVersion?: string; readonly at: string; readonly actorId: EntityId; readonly bytes: number; readonly sheets: readonly { readonly name: string; readonly hidden: boolean }[]; readonly modifiedAt: string | null; readonly ignoredSheets: readonly string[]; readonly pendingLinks: number; readonly codeLinks: readonly { readonly fromCodeRaw: string; readonly toCodeRaw: string; readonly rowNo: number; readonly sheetName: string }[]; readonly fingerprints: readonly { readonly sheet: string; readonly rowNo: number; readonly fingerprint: string }[]; readonly images: readonly { readonly rowNo: number; readonly slot: 'inner' | 'outer'; readonly sha256: string }[]; readonly failure: string | null }) {
  const sourceKey = importSourceKey({ template: input.template, factoryPartyId: input.factoryPartyId });
  return {
    id: input.id,
    createdAt: input.at,
    updatedAt: input.at,
    fileId: input.fileId,
    template: input.template,
    factoryPartyId: input.factoryPartyId,
    coverage: input.coverage ?? 'full_snapshot',
    sourceKey,
    sourceFingerprint: sourceKey === null ? null : input.fileId,
    effectiveAt: sourceKey === null ? null : input.modifiedAt ?? input.at,
    supersededAt: null,
    status: input.failure === null ? 'parsed' as const : 'failed' as const,
    revision: 0,
    fileMeta: { bytes: input.bytes, sheets: input.sheets, coreXmlModifiedAt: input.modifiedAt, coverageAttestationId: input.coverageAttestationId ?? null, candidateKeyVersion: input.candidateKeyVersion ?? null, ignoredSheets: input.ignoredSheets, pendingLinks: input.pendingLinks, codeLinks: input.codeLinks, fingerprints: input.fingerprints, images: input.images },
    stats: {},
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: input.actorId,
    committedBy: null,
    committedAt: null,
    rolledBackBy: null,
    rolledBackAt: null,
    error: input.failure,
  };
}

async function trustedCoverage(input: { readonly deps: StartImportDeps; readonly input: StartImportInput; readonly parsedCoverage: ImportCoverage; readonly bytes: Uint8Array; readonly at: string }): Promise<{ readonly coverage: ImportCoverage; readonly attestationId?: string }> {
  if (input.input.coverageAttestationToken === undefined) {
    if (input.parsedCoverage === 'partial') throw new ValidationFailedError('partial 导入缺少受信声明', { field: 'coverage' });
    return { coverage: input.parsedCoverage };
  }
  if (input.deps.coverageAttestation === undefined) throw new ValidationFailedError('未配置导入覆盖声明验证器', { field: 'coverage' });
  const attestation = await input.deps.coverageAttestation.verify({ token: input.input.coverageAttestationToken, now: input.at });
  const payloadSha256 = await sha256Hex(input.bytes);
  const sourceKey = importSourceKey({ template: input.input.template, factoryPartyId: input.input.factoryPartyId ?? null });
  if (!attestationMatches({ attestation, input: input.input, sourceKey, payloadSha256 })) {
    throw new ValidationFailedError('导入覆盖声明与文件或来源不匹配', { field: 'coverage' });
  }
  if (attestation === undefined) throw new ValidationFailedError('导入覆盖声明缺失', { field: 'coverage' });
  return { coverage: importCoverageOf(attestation.coverage), attestationId: attestation.attestationId };
}

function attestationMatches(input: { readonly attestation: import('@sw/domain').ImportCoverageAttestation | undefined; readonly input: StartImportInput; readonly sourceKey: string | null; readonly payloadSha256: string }): boolean {
  const attestation = input.attestation;
  return attestation !== undefined
    && attestation.template === input.input.template
    && attestation.factoryPartyId === (input.input.factoryPartyId ?? null)
    && attestation.sourceKey === input.sourceKey
    && attestation.payloadSha256 === input.payloadSha256;
}

const ZIP_P = 0x50;
const ZIP_K = 0x4b;

function nameOf(bytes: Uint8Array): string {
  return bytes[0] === ZIP_P && bytes[1] === ZIP_K ? 'upload.xlsx' : 'upload.csv';
}

async function readContext(input: { readonly deps: StartImportDeps; readonly template: ImportTemplate; readonly input: StartImportInput }) {
  return input.deps.uow.run(async (tx) => {
    const fingerprints = await fingerprintsOf({ tx, template: input.template, input: input.input });
    const base = input.template.existingFrom(fingerprints);
    const poMaster = base.poMaster.length > 0 ? base.poMaster : await latestPoMaster(tx);
    return { factoryName: await partyName(tx, input.input.factoryPartyId), existing: { ...base, poMaster } };
  });
}

async function partyName(tx: UnitOfWorkStores, factoryPartyId: EntityId | undefined): Promise<string | null> {
  if (factoryPartyId === undefined) return null;
  const party = await tx.parties.find(factoryPartyId);
  return party === undefined ? null : party.displayName;
}

async function fingerprintsOf(input: { readonly tx: UnitOfWorkStores; readonly template: ImportTemplate; readonly input: StartImportInput }): Promise<readonly ImportFingerprint[]> {
  const records: ImportFingerprint[] = [];
  for (const batch of await input.tx.imports.list()) {
    if (batch.status !== 'committed' || batch.template !== input.template.id) continue;
    if (input.template.requiresFactory && batch.factoryPartyId !== (input.input.factoryPartyId ?? null)) continue;
    if ((batch.supersededAt ?? null) !== null) continue;
    records.push(...storedFingerprints(batch.fileMeta));
  }
  return records;
}

function storedFingerprints(value: unknown): ImportFingerprint[] {
  if (!isRecord(value) || !Array.isArray(value.fingerprints)) return [];
  return value.fingerprints.flatMap(fingerprintOf);
}

function fingerprintOf(value: unknown): ImportFingerprint[] {
  if (!isRecord(value) || typeof value.fingerprint !== 'string') return [];
  return [{ sheet: typeof value.sheet === 'string' ? value.sheet : '', rowNo: typeof value.rowNo === 'number' ? value.rowNo : 0, fingerprint: value.fingerprint }];
}

function attestationIdOf(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.coverageAttestationId !== 'string' || value.coverageAttestationId.trim() === '') return undefined;
  return value.coverageAttestationId;
}

async function storeImage({ deps, bytes, fileName }: { readonly deps: StartImportDeps; readonly bytes: Uint8Array; readonly fileName: string }): Promise<string> {
  const stored = await deps.files.put({ bytes, originalName: fileName, mime: mimeOf(fileName) });
  return stored.sha256;
}

function mimeOf(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

