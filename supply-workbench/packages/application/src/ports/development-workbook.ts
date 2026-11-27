import type { DevelopmentProjectStage, LocalDate, ProductDevelopmentStore } from '@sw/domain';

export type DevelopmentWorkbookEvidence = {
  readonly sheet: string;
  readonly row: number;
  readonly cell: string;
  readonly label: string;
  readonly rawValue: string | number | boolean | null;
  readonly displayText: string;
  readonly formula?: string;
  readonly date?: LocalDate;
};

export type DevelopmentWorkbookConflict = {
  readonly kind: 'duplicate_title' | 'tab_stage_mismatch' | 'hidden_row' | 'explicit_stage_conflict';
  readonly evidence: DevelopmentWorkbookEvidence[];
  readonly relatedCandidateIds: string[];
};

export type DevelopmentWorkbookRow = {
  readonly source: { readonly sheet: string; readonly row: number };
  readonly evidence: DevelopmentWorkbookEvidence[];
};

export type DevelopmentWorkbookCandidate = DevelopmentWorkbookRow & {
  readonly id: string;
  readonly store: ProductDevelopmentStore;
  readonly title: string;
  readonly stage: DevelopmentProjectStage | null;
  readonly contacts: DevelopmentWorkbookEvidence | null;
  readonly currentNote: DevelopmentWorkbookEvidence | null;
  readonly required: DevelopmentWorkbookEvidence | null;
  readonly forecast: DevelopmentWorkbookEvidence | null;
  readonly conflicts: DevelopmentWorkbookConflict[];
};

export type DevelopmentWorkbookPreview = {
  readonly fileName: string;
  readonly sheets: { readonly name: string; readonly headerRow: number | null; readonly hidden: boolean }[];
  readonly candidates: DevelopmentWorkbookCandidate[];
  readonly unidentifiedRows: DevelopmentWorkbookRow[];
};
