import { generateBlankPoMasterTemplate, importCommitExecutors, templates, workbookReader } from '@sw/importers';
import { bindCommitExecutors } from '../../../../packages/application/src/imports/commit/index.js';
import {
  makeCommitImport,
  makeDetectImportFile,
  makeDiscardImport,
  makeGetImportBatch,
  makeGetImportTemplate,
  makeGetProcurementPreview,
  makeIdempotentImportCommand,
  makeListImportBatches,
  makeListImportRows,
  makeSaveImportDecisions,
  makeStartImport,
} from '@sw/application';
import {
  aliasRepository,
  auditRepository,
  createUnitOfWork,
  deliveryBatchRepository,
  codeLinkRepository,
  factoryReportRepository,
  fileStore,
  importBatchRepository,
  procurementRepository,
  lineFactoryLinkRepository,
  ownerAssignmentRepository,
  itemCodeRepository,
  importQueries,
  orderLineRepository,
  partyRepository,
  placeholderStores,
  productContactRepository,
  productImageRepository,
  productRepository,
  bomLineRepository,
  purchaseOrderRepository,
  requireDatabase,
  rememberStoredFile,
  claimCommand,
  completeCommand,
  releaseCommand,
  type AppDatabase,
} from '@sw/persistence';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';
import type { ImportApi } from '../http/imports/routes.js';
import { generateBlankTemplate } from '../../../../packages/importers/src/templates/factory-progress-v1/generate.js';
import { discardStaleImportsTrigger } from '../jobs/discard-stale-imports.js';
import { hmacCoverageAttestation } from '../import-coverage-attestation.js';

bindCommitExecutors(importCommitExecutors);

export function register(): never {
  throw new Error('导入路由由 buildHttpApp 挂载');
}

export function importTriggers(run: () => Promise<void>) {
  return [discardStaleImportsTrigger(run)];
}

export function composeImports(input: { readonly db: AppDatabase; readonly uploadDir: string; readonly timeZone: string; readonly coverageAttestationSecret?: string; readonly coverageAttestationIssuers?: readonly string[] }): ImportApi {
  const clock = systemClock(input.timeZone);
  const ids = systemIds();
  const files = fileStore(input.uploadDir);
  const workbooks = workbookReader();
  const uow = createUnitOfWork(input.db, (tx) => stores(tx));
  const parse = { uow, clock, ids, files, workbooks, templates, ...(input.coverageAttestationSecret === undefined || input.coverageAttestationIssuers === undefined ? {} : { coverageAttestation: hmacCoverageAttestation(input.coverageAttestationSecret, input.coverageAttestationIssuers) }) };
  const write = { uow, clock };
  const queries = importQueries(input.db);
  const runMutation = importMutations({ db: input.db, clock });
  const commands = importCommands({
    runMutation,
    commit: makeCommitImport(write),
    discard: makeDiscardImport(write),
    decide: makeSaveImportDecisions(write),
  });
  return {
    detect: (file, actor) => rememberDetected({ db: input.db, parse, clock, file, actor }),
    start: makeStartImport(parse),
    ...commands,
    get: makeGetImportBatch({ imports: queries }),
    procurementPreview: makeGetProcurementPreview({ imports: queries }),
    list: makeListImportBatches({ imports: queries }),
    rows: makeListImportRows({ imports: queries }),
    template: (actor) => makeGetImportTemplate({ generate: generateBlankTemplate, fileName: 'factory-progress-v1.xlsx' })({}, actor),
    poMasterTemplate: (actor) => makeGetImportTemplate({ generate: generateBlankPoMasterTemplate, fileName: 'po-master-v1.xlsx' })({}, actor),
  };
}

type MutationResult = { readonly importBatchId: string };
type MutationRunner = ReturnType<typeof makeIdempotentImportCommand>;
type ImportActor = Parameters<ImportApi['commit']>[1];
type ImportCommand = (input: { readonly importBatchId: string; readonly expectedRevision?: number | undefined }, actor: ImportActor) => Promise<MutationResult>;

function importMutations(input: { readonly db: AppDatabase; readonly clock: ReturnType<typeof systemClock> }): MutationRunner {
  return makeIdempotentImportCommand({
    claim: (command) => claimCommand({ db: input.db, actorId: command.actorId, route: command.route, resourceId: command.resourceId, key: command.key, payload: command.payload, at: input.clock.now() }),
    complete: (claimed) => completeCommand({ db: input.db, id: claimed.id, result: claimed.result, at: input.clock.now() }),
    release: (id) => releaseCommand(input.db, id),
  });
}

async function rememberDetected(input: {
  readonly db: AppDatabase;
  readonly parse: Parameters<typeof makeDetectImportFile>[0];
  readonly clock: ReturnType<typeof systemClock>;
  readonly file: Parameters<ImportApi['detect']>[0];
  readonly actor: Parameters<ImportApi['detect']>[1];
}) {
  const detected = await makeDetectImportFile(input.parse)(input.file, input.actor);
  await rememberStoredFile(input.db, { sha256: detected.fileId, originalName: input.file.fileName, size: input.file.bytes.byteLength, mime: input.file.mime, uploadedBy: input.actor.id, at: input.clock.now() });
  return detected;
}

function importCommands(input: {
  readonly runMutation: MutationRunner;
  readonly commit: ReturnType<typeof makeCommitImport>;
  readonly discard: ReturnType<typeof makeDiscardImport>;
  readonly decide: ReturnType<typeof makeSaveImportDecisions>;
}): Pick<ImportApi, 'commit' | 'discard' | 'decide'> {
  const commit: ImportApi['commit'] = (...args) => commandOf({ route: 'commit', command: input.commit, runMutation: input.runMutation }, args);
  const discard: ImportApi['discard'] = (...args) => commandOf({ route: 'discard', command: input.discard, runMutation: input.runMutation }, args);
  const decide: ImportApi['decide'] = (body, actor) => input.runMutation({ route: 'decide', resourceId: body.importBatchId, actorId: actor.id, key: body.idempotencyKey, payload: body, run: () => input.decide({ importBatchId: body.importBatchId, decisions: body.decisions, expectedRevision: body.expectedRevision }, actor) });
  return { commit, discard, decide };
}

function commandOf(input: { readonly route: string; readonly command: ImportCommand; readonly runMutation: MutationRunner }, args: Parameters<ImportApi['commit']>): Promise<MutationResult> {
  const [id, actor, meta] = args;
  const normalizedMeta = meta ?? {};
  return input.runMutation({ route: input.route, resourceId: id, actorId: actor.id, key: normalizedMeta.idempotencyKey, payload: normalizedMeta, run: () => input.command({ importBatchId: id, expectedRevision: normalizedMeta.expectedRevision }, actor) });
}

function stores(tx: unknown) {
  const db = requireDatabase(tx);
  return {
    ...placeholderStores(),
    parties: partyRepository(db),
    aliases: aliasRepository(db),
    itemCodes: itemCodeRepository(db),
    codeLinks: codeLinkRepository(db),
    purchaseOrders: purchaseOrderRepository(db),
    orderLines: orderLineRepository(db),
    batches: deliveryBatchRepository(db),
    imports: importBatchRepository(db),
    procurement: procurementRepository(db),
    factoryReports: factoryReportRepository(db),
    products: productRepository(db),
    productImages: productImageRepository(db),
    productContacts: productContactRepository(db),
    bomLines: bomLineRepository(db),
    audit: auditRepository(db),
    ownerAssignments: ownerAssignmentRepository(db),
    factoryLinks: lineFactoryLinkRepository(db),
  };
}
