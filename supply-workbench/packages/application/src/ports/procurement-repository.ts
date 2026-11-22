import type { OrderLine, PurchaseOrder } from '@sw/domain';
import type { ProcurementFact, ProcurementPreview, ProcurementResolution } from './procurement-preview.js';

export type ProcurementObservation = ProcurementResolution & {
  readonly importBatchId: string;
  readonly identityKey: string | null;
  readonly finishedLineIds: readonly string[];
  readonly fact: ProcurementFact;
};

export type ProcurementLineDetail = {
  readonly relatedLines: readonly { readonly id: string; readonly nameRaw: string | null; readonly codeRaw: string | null; readonly poRaw: string | null }[];
  readonly sources: readonly { readonly importBatchId: string; readonly fileName: string | null; readonly committedAt: string | null; readonly finishedLineIds: readonly string[]; readonly fact: ProcurementFact }[];
};

export type ProcurementMaterials = {
  readonly orders: readonly PurchaseOrder[];
  readonly lines: readonly OrderLine[];
};

export interface ProcurementRepository {
  preview(importBatchId: string): Promise<ProcurementPreview | null>;
  lockCommit(): Promise<void>;
  originalBatchId(fileId: string): Promise<string | null>;
  recordFile(input: { readonly fileId: string; readonly importBatchId: string }): Promise<void>;
  materialsByPoNumbers(poNumbers: readonly string[]): Promise<ProcurementMaterials>;
  blockedIdentities(): Promise<ReadonlySet<string>>;
  recordObservations(rows: readonly ProcurementObservation[]): Promise<void>;
  linkFinishedLines(input: { readonly materialLineId: string; readonly finishedLineIds: readonly string[] }): Promise<void>;
}
