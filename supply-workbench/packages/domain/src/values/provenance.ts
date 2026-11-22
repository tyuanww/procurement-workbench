import type { MissingReason, TemplateId } from '../vocabulary/index.js';

export type Provenance =
  | { readonly kind: 'manual'; readonly by: string; readonly at: string }
  | {
      readonly kind: 'import';
      readonly importBatchId: string;
      readonly template: TemplateId;
      readonly sheet: string;
      readonly rowNo: number;
      readonly at: string;
    }
  | {
      readonly kind: 'factory_report';
      readonly importBatchId: string;
      readonly factoryPartyId: string;
      readonly sheet: string;
      readonly rowNo: number;
      readonly at: string;
    }
  | { readonly kind: 'system'; readonly rule: string; readonly at: string };

export type Missing = {
  readonly value: null;
  readonly reason: MissingReason;
  readonly raw?: string;
};

export type Provenanced<T> = {
  readonly value: T | null;
  readonly missingReason?: MissingReason;
  readonly raw?: string;
  readonly provenance: Provenance;
};

export function missing(reason: MissingReason, raw?: string): Missing {
  return raw === undefined ? { value: null, reason } : { value: null, reason, raw };
}

export function withValue<T>(value: T, provenance: Provenance): Provenanced<T> {
  return { value, provenance };
}

export function withoutValue({ reason, provenance, raw }: { readonly reason: MissingReason; readonly provenance: Provenance; readonly raw?: string | undefined }): Provenanced<null> {
  return raw === undefined
    ? { value: null, missingReason: reason, provenance }
    : { value: null, missingReason: reason, raw, provenance };
}
