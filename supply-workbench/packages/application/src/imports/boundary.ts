import type { Actor } from '../shared/actor.js';
import type { FileBytes, NoInput } from '../shared/refs.js';
import type { Clock } from '../ports/clock.js';
import type { FileStore } from '../ports/file-store.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ImportQueries } from '../ports/import-queries.js';
import type { ImportTemplate } from '../ports/import-template.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { WorkbookReader } from '../ports/workbook-reader.js';
import type { ImportCoverageAttestationVerifier } from '../ports/import-coverage-attestation.js';
import type { ListResult } from '../shared/page.js';
import type {
  DetectImportInput,
  DetectResponse,
  ImportBatchIdInput,
  ImportBatchListItem,
  ImportBatchSummary,
  ImportListQuery,
  ImportRowView,
  ImportRowsQuery,
  SaveDecisionsInput,
  StartImportInput,
} from './views.js';

export type * from './views.js';

type ImportWrite = { readonly uow: UnitOfWork; readonly clock: Clock };
type ImportParse = ImportWrite & {
  readonly ids: IdGenerator;
  readonly files: FileStore;
  readonly workbooks: WorkbookReader;
  readonly templates: readonly ImportTemplate[];
  readonly coverageAttestation?: ImportCoverageAttestationVerifier;
};

export type DetectImportFileDeps = ImportParse;
export type DetectImportFile = (input: DetectImportInput, actor: Actor) => Promise<DetectResponse>;

export type StartImportDeps = ImportParse;
export type StartImport = (input: StartImportInput, actor: Actor) => Promise<{ readonly importBatchId: string }>;

export type SaveImportDecisionsDeps = ImportWrite;
export type SaveImportDecisions = (input: SaveDecisionsInput, actor: Actor) => Promise<{ readonly importBatchId: string }>;

export type CommitImportDeps = ImportWrite;
export type CommitImport = (input: ImportBatchIdInput, actor: Actor) => Promise<{ readonly importBatchId: string }>;

export type DiscardImportDeps = ImportWrite;
export type DiscardImport = (input: ImportBatchIdInput, actor: Actor) => Promise<{ readonly importBatchId: string }>;


export type DiscardStaleImportsDeps = ImportWrite;
export type DiscardStaleImports = (input: NoInput, actor: Actor) => Promise<{ readonly discarded: number }>;

export type GetImportBatchDeps = { readonly imports: ImportQueries };
export type GetImportBatch = (input: ImportBatchIdInput, actor: Actor) => Promise<ImportBatchSummary>;

export type ListImportBatchesDeps = { readonly imports: ImportQueries };
export type ListImportBatches = (input: ImportListQuery, actor: Actor) => Promise<ListResult<ImportBatchListItem>>;

export type ListImportRowsDeps = { readonly imports: ImportQueries };
export type ListImportRows = (input: ImportRowsQuery, actor: Actor) => Promise<ListResult<ImportRowView>>;

export type GetImportTemplateDeps = { readonly generate: () => Uint8Array; readonly fileName: string };
export type GetImportTemplate = (input: NoInput, actor: Actor) => Promise<FileBytes>;
