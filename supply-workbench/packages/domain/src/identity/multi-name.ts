import { normalizeText } from './text.js';

export type CodeDecision = 'undecided' | 'same_material' | 'shared_spec';

export function codeDecisionOf(input: { readonly sharedCodeFlag: boolean; readonly decided: boolean }): CodeDecision {
  if (!input.decided) return 'undecided';
  return input.sharedCodeFlag ? 'shared_spec' : 'same_material';
}

export function itemCodeMatches(input: {
  readonly rowCode: string | null;
  readonly lineCode: string | null;
  readonly rowName: string | null;
  readonly lineName: string | null;
  readonly codeDecision: CodeDecision;
}): boolean {
  const rowCode = codeOf(input.rowCode);
  const lineCode = codeOf(input.lineCode);
  if (rowCode === null || lineCode === null || rowCode !== lineCode) return false;
  if (input.codeDecision === 'same_material') return true;
  return sameName(input.rowName, input.lineName);
}

function codeOf(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeText(value);
  return normalized === '' ? null : normalized;
}

function sameName(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  const a = normalizeText(left);
  const b = normalizeText(right);
  return a !== '' && a === b;
}
