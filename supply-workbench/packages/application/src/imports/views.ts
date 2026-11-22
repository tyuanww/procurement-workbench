import type {
  EntityId,
  ImportAction,
  ImportStatus,
  IssueCode,
  IssueSeverity,
  ImportCoverage,
  TemplateId,
} from '@sw/domain';
import type { DetectCandidate } from '../ports/import-template.js';
import type { PageQuery } from '../shared/page.js';
import type { PartyRef, UserRef } from '../shared/refs.js';

export type DetectResponse = {
  readonly fileId: string;
  readonly candidates: readonly DetectCandidate[];
  readonly requiresFactory: boolean;
  readonly sheets: readonly { readonly name: string; readonly hidden: boolean }[];
};

export type ImportDecisions = {
  readonly issueDecisions: { readonly DATE_NO_YEAR?: 'fill_file_year' | 'keep_null' };
  readonly rowSkips: readonly { readonly rowId: string; readonly reason: string }[];
  readonly conflictResolutions: readonly { readonly rowId: string; readonly targetOrderLineId: string | null }[];
};

export type ImportBatchSummary = {
  readonly id: string;
  readonly template: TemplateId;
  readonly factoryParty: PartyRef | null;
  readonly status: ImportStatus;
  readonly coverage?: ImportCoverage;
  readonly source?: {
    readonly key: string;
    readonly fingerprint: string | null;
    readonly effectiveAt: string | null;
    readonly supersededAt: string | null;
  };
  readonly candidateKeyVersion?: string;
  readonly revision: number;
  readonly file: { readonly originalName: string; readonly size: number; readonly sha256: string };
  readonly fileMeta: {
    readonly sheets: readonly { readonly name: string; readonly hidden: boolean }[];
    readonly coreXmlModifiedAt: string | null;
  };
  readonly hasProcurementPreview?: boolean;
  readonly procurementReplayOf?: string;
  readonly stats: {
    readonly rows: number;
    readonly byAction: Readonly<Record<ImportAction, number>>;
    readonly byIssue: Readonly<Record<IssueCode, number>>;
    readonly pendingAliases: number;
    readonly pendingCodes: number;
    readonly pendingLinks: number;
  };
  readonly issueGroups: readonly {
    readonly code: IssueCode;
    readonly severity: IssueSeverity;
    readonly count: number;
    readonly samples: readonly { readonly sheet: string; readonly rowNo: number; readonly column: string | null; readonly raw: string | null }[];
    readonly availableDecisions: readonly string[];
  }[];
  readonly ignoredSheets: readonly string[];
  readonly decisions: ImportDecisions;
  readonly unresolvedConflicts: number;
  readonly createdBy: UserRef;
  readonly createdAt: string;
  readonly committedBy: UserRef | null;
  readonly committedAt: string | null;
  readonly error: string | null;
};

export type ImportBatchListItem = {
  readonly id: string;
  readonly template: TemplateId;
  readonly factoryParty: PartyRef | null;
  readonly status: ImportStatus;
  readonly coverage?: ImportCoverage;
  readonly sourceKey?: string | null;
  readonly originalName: string;
  readonly createdBy: UserRef;
  readonly createdAt: string;
  readonly committedAt: string | null;
};

export type ImportRowView = {
  readonly id: string;
  readonly importBatchId: string;
  readonly sheetName: string;
  readonly rowNo: number;
  readonly raw: unknown;
  readonly parsed: unknown;
  readonly issues: readonly { readonly code: IssueCode; readonly severity: IssueSeverity; readonly column: string | null; readonly message: string; readonly raw: string | null }[];
  readonly action: ImportAction;
  readonly targetId: string | null;
  readonly skipReason: string | null;
};

export type DetectImportInput = {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mime: string;
};
/** coverage 只能由解析器或服务端验签声明，HTTP body 不接受该字段。 */
export type StartImportInput = { readonly fileId: EntityId; readonly template: TemplateId; readonly factoryPartyId?: EntityId; readonly coverageAttestationToken?: string };
export type ImportCommandMeta = { readonly expectedRevision?: number | undefined; readonly idempotencyKey?: string | undefined; readonly payloadHash?: string | undefined };
export type SaveDecisionsInput = { readonly importBatchId: string; readonly decisions: ImportDecisions } & ImportCommandMeta;
export type ImportBatchIdInput = { readonly importBatchId: string } & ImportCommandMeta;
export type ImportListQuery = PageQuery & { readonly template?: TemplateId; readonly status?: ImportStatus; readonly factoryPartyId?: string };
export type ImportRowsQuery = PageQuery & { readonly importBatchId: string; readonly action?: ImportAction; readonly issueCode?: IssueCode; readonly sheet?: string };
