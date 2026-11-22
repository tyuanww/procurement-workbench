import type { LocalDate } from '@sw/domain';

export type ProcurementSource = {
  readonly sheetName: string;
  readonly rowNo: number;
};

export type ProcurementCellSource = ProcurementSource & {
  readonly column: number;
  readonly range: {
    readonly startRow: number;
    readonly endRow: number;
    readonly startColumn: number;
    readonly endColumn: number;
  } | null;
};

export type ProcurementProjectDate = {
  readonly field: 'releasedOn' | 'projectOrderedOn' | 'projectTargetOn';
  readonly source: ProcurementCellSource;
  readonly raw: string;
  readonly value: LocalDate | null;
};

export type ProcurementOaRef = {
  readonly raw: string;
  readonly main: string;
};

export type ProcurementPreview = {
  readonly finishedRows: readonly {
    readonly source: ProcurementSource;
    readonly oaRaw: string | null;
    readonly oaRefs: readonly ProcurementOaRef[];
    readonly productCodeRaw: string | null;
    readonly productNameRaw: string | null;
    readonly poRaw: string | null;
    readonly quantity: number | null;
  }[];
  readonly componentFacts: readonly ProcurementPreviewFact[];
  readonly links: readonly {
    readonly finishedRow: ProcurementSource;
    readonly component: ProcurementSource;
    readonly kind: 'direct' | 'shared' | 'group' | 'candidate';
  }[];
};

export type ProcurementPreviewSelection = Omit<ProcurementPreview, 'componentFacts'> & {
  readonly componentFacts: readonly ProcurementFact[];
  readonly oa: string;
  readonly groups: readonly { readonly oa: string; readonly count: number }[];
  readonly submission?: ProcurementSubmission;
};

export type ProcurementPreviewFact = ProcurementFact & (
  | { readonly buyerFromRichText?: never }
  | { readonly buyerRaw: string; readonly buyerFromRichText: true }
);

export type ProcurementFact = {
  readonly source: ProcurementSource;
  readonly status: 'active' | 'completed';
  readonly oa: {
    readonly raw: string | null;
    readonly refs: readonly ProcurementOaRef[];
    readonly source: ProcurementCellSource | null;
  };
  readonly productCodes: {
    readonly raw: string | null;
    readonly source: ProcurementCellSource | null;
  };
  readonly componentCodeRaw: string | null;
  readonly componentNameRaw: string | null;
  readonly poRaw: string | null;
  readonly supplierRaw: string | null;
  readonly buyerRaw: string | null;
  readonly deliveryProgressRaw?: string | null;
  readonly quantityRaw: string | null;
  readonly quantityUnitConflict?: true;
  readonly quantity: number | null;
  readonly unitRaw: string | null;
};

export type ProcurementReviewReason =
  | 'missing_po'
  | 'invalid_po'
  | 'invalid_component_code'
  | 'quantity_unit_conflict'
  | 'duplicate_identity'
  | 'supplier_conflict'
  | 'unresolved_history'
  | 'no_confirmed_finished_line';

export type ProcurementResolution = {
  readonly materialLineId: string | null;
  readonly reasons: readonly ProcurementReviewReason[];
};

export type ProcurementSubmission = {
  readonly originalBatchId: string;
  readonly finished: readonly (ProcurementSource & { readonly orderLineId: string })[];
  readonly observations: readonly (ProcurementSource & ProcurementResolution)[];
};
