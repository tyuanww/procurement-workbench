import type {
  DevelopmentWorkbookCandidate as Candidate, DevelopmentWorkbookEvidence as Evidence, DevelopmentWorkbookPreview as Preview,
} from '../../application/src/ports/development-workbook.js';
import { z } from 'zod';
import { DevelopmentProjectStageSchema, ProductDevelopmentStoreSchema } from './product-development.js';
import { nullable, optional, strictObject } from './shape.js';
import { LocalDateSchema } from './values.js';

export const DevelopmentWorkbookScopeSchema = strictObject({ store: ProductDevelopmentStoreSchema });
export const DevelopmentWorkbookEvidenceSchema = strictObject({
  sheet: z.string().min(1).max(31),
  row: z.number().int().positive(),
  cell: z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,6}$/u),
  label: z.string().min(1).max(255),
  rawValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  displayText: z.string(),
  formula: optional(z.string()),
  date: optional(LocalDateSchema),
}) satisfies z.ZodType<Evidence>;

const sourceRow = strictObject({
  source: strictObject({ sheet: z.string().min(1).max(31), row: z.number().int().positive() }),
  evidence: z.array(DevelopmentWorkbookEvidenceSchema),
});

const candidate = sourceRow.extend({
  id: z.uuid(),
  store: ProductDevelopmentStoreSchema,
  title: z.string().min(1),
  stage: nullable(DevelopmentProjectStageSchema),
  contacts: nullable(DevelopmentWorkbookEvidenceSchema),
  currentNote: nullable(DevelopmentWorkbookEvidenceSchema),
  required: nullable(DevelopmentWorkbookEvidenceSchema),
  forecast: nullable(DevelopmentWorkbookEvidenceSchema),
  conflicts: z.array(strictObject({
    kind: z.enum(['duplicate_title', 'tab_stage_mismatch', 'hidden_row', 'explicit_stage_conflict']),
    evidence: z.array(DevelopmentWorkbookEvidenceSchema),
    relatedCandidateIds: z.array(z.uuid()),
  })),
}) satisfies z.ZodType<Candidate>;

export const DevelopmentWorkbookPreviewSchema = strictObject({
  fileName: z.string().min(1).max(255),
  sheets: z.array(strictObject({ name: z.string().min(1).max(31), headerRow: nullable(z.number().int().positive()), hidden: z.boolean() })),
  candidates: z.array(candidate),
  unidentifiedRows: z.array(sourceRow),
}) satisfies z.ZodType<Preview>;

export type DevelopmentWorkbookPreview = z.output<typeof DevelopmentWorkbookPreviewSchema>;
export type DevelopmentWorkbookCandidate = z.output<typeof candidate>;
export type DevelopmentWorkbookEvidence = z.output<typeof DevelopmentWorkbookEvidenceSchema>;
