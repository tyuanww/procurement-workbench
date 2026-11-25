import type { DetectResponse, FreshnessResponse, ImportBatchListItem, ImportBatchSummary, ImportRowView } from '@sw/application';
import type { ConfirmedArrivalPayload } from '../../application/src/ports/parsed-rows.js';
import { z } from 'zod';
import { ImportActionSchema, ImportCoverageSchema, ImportStatusSchema, IssueCodeSchema, IssueSeveritySchema, TemplateIdSchema } from './enums.js';
import { nullable, optional, strictObject } from './shape.js';
import { UserRef, partyRef } from './refs.js';
import { parsedDate } from './parsed-cell.js';

export const ConfirmedArrivalPayloadSchema: z.ZodType<ConfirmedArrivalPayload> = strictObject({
  batchId: z.string(),
  po: nullable(z.string()),
  name: nullable(z.string()),
  sequence: nullable(z.string()),
  warehouse: nullable(z.string()),
  exportedDate: parsedDate,
  exportedReceiverPartyId: nullable(z.string()),
  exportedLineId: nullable(z.string()),
  date: parsedDate,
  reason: nullable(z.string()),
});

const actionCounts = strictObject({
  create: z.number(),
  update: z.number(),
  unchanged: z.number(),
  conflict: z.number(),
  skip: z.number(),
});

export const FreshnessSourceSchema = strictObject({
  template: TemplateIdSchema,
  factoryPartyId: nullable(z.string()),
  label: z.string(),
  lastCommittedAt: nullable(z.string()),
  fileModifiedAt: nullable(z.string()),
});

export const FreshnessResponseSchema: z.ZodType<FreshnessResponse> = strictObject({
  sources: z.array(FreshnessSourceSchema),
  procurementUploadedAt: z.string().optional(),
});

export const DetectResponseSchema: z.ZodType<DetectResponse> = strictObject({
  fileId: z.string(),
  candidates: z.array(strictObject({
    template: TemplateIdSchema,
    score: z.number(),
    reasons: z.array(z.string()),
  })),
  requiresFactory: z.boolean(),
  sheets: z.array(strictObject({ name: z.string(), hidden: z.boolean() })),
});

export const ImportDecisionsSchema = strictObject({
  issueDecisions: strictObject({
    DATE_NO_YEAR: z.exactOptional(z.enum(['fill_file_year', 'keep_null'])),
  }),
  rowSkips: z.array(strictObject({ rowId: z.string(), reason: z.string() })),
  conflictResolutions: z.array(strictObject({
    rowId: z.string(),
    targetOrderLineId: nullable(z.string()),
  })),
});

export const ImportBatchSummarySchema: z.ZodType<ImportBatchSummary> = strictObject({
  id: z.string(),
  template: TemplateIdSchema,
  factoryParty: nullable(partyRef),
  status: ImportStatusSchema,
  coverage: optional(ImportCoverageSchema),
  source: optional(strictObject({ key: z.string(), fingerprint: nullable(z.string()), effectiveAt: nullable(z.string()), supersededAt: nullable(z.string()) })),
  candidateKeyVersion: optional(z.string()),
  revision: z.number().int().nonnegative(),
  file: strictObject({ originalName: z.string(), size: z.number(), sha256: z.string() }),
  fileMeta: strictObject({
    sheets: z.array(strictObject({ name: z.string(), hidden: z.boolean() })),
    coreXmlModifiedAt: nullable(z.string()),
  }),
  hasProcurementPreview: optional(z.boolean()),
  procurementReplayOf: optional(z.string()),
  stats: strictObject({
    rows: z.number(),
    byAction: actionCounts,
    byIssue: z.record(IssueCodeSchema, z.number()),
    pendingAliases: z.number(),
    pendingCodes: z.number(),
    pendingLinks: z.number(),
  }),
  issueGroups: z.array(strictObject({
    code: IssueCodeSchema,
    severity: IssueSeveritySchema,
    count: z.number(),
    samples: z.array(strictObject({
      sheet: z.string(),
      rowNo: z.number(),
      column: nullable(z.string()),
      raw: nullable(z.string()),
    })),
    availableDecisions: z.array(z.string()),
  })),
  ignoredSheets: z.array(z.string()),
  decisions: ImportDecisionsSchema,
  unresolvedConflicts: z.number(),
  createdBy: UserRef,
  createdAt: z.string(),
  committedBy: nullable(UserRef),
  committedAt: nullable(z.string()),
  error: nullable(z.string()),
});

export const ImportBatchListItemSchema: z.ZodType<ImportBatchListItem> = strictObject({
  id: z.string(),
  template: TemplateIdSchema,
  factoryParty: nullable(partyRef),
  status: ImportStatusSchema,
  coverage: optional(ImportCoverageSchema),
  sourceKey: optional(nullable(z.string())),
  originalName: z.string(),
  createdBy: UserRef,
  createdAt: z.string(),
  committedAt: nullable(z.string()),
});

export const ImportRowViewSchema: z.ZodType<ImportRowView> = strictObject({
  id: z.string(),
  importBatchId: z.string(),
  sheetName: z.string(),
  rowNo: z.number(),
  raw: z.unknown(),
  parsed: z.unknown(),
  issues: z.array(strictObject({
    code: IssueCodeSchema,
    severity: IssueSeveritySchema,
    column: nullable(z.string()),
    message: z.string(),
    raw: nullable(z.string()),
  })),
  action: ImportActionSchema,
  targetId: nullable(z.string()),
  skipReason: nullable(z.string()),
});

export type { DetectResponse, FreshnessResponse, ImportBatchListItem, ImportBatchSummary, ImportRowView };
