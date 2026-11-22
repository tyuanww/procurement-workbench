import type { ImportIssue } from '../entities/records.js';
import type { MissingReason } from '../vocabulary/access.js';

export type CellParse<T> = {
  readonly value: T;
  readonly raw: string;
  readonly issues: readonly ImportIssue[];
  readonly missingReason?: MissingReason;
};

export function parsedCell<T>(input: {
  readonly value: T;
  readonly raw: string;
  readonly issues: readonly ImportIssue[];
  readonly missingReason?: MissingReason;
}): CellParse<T> {
  if (input.missingReason === undefined) {
    return { value: input.value, raw: input.raw, issues: input.issues };
  }
  return {
    value: input.value,
    raw: input.raw,
    issues: input.issues,
    missingReason: input.missingReason,
  };
}

export function blankCell(raw: string): CellParse<null> {
  return parsedCell({ value: null, raw, issues: [], missingReason: 'not_provided' });
}

export function unparsedCell(raw: string, issues: readonly ImportIssue[]): CellParse<null> {
  return parsedCell({ value: null, raw, issues, missingReason: 'unparseable' });
}
