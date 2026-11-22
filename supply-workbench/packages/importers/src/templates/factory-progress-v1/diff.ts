import type { ImportExisting, ParsedRow } from '../../../../application/src/ports/parsed-rows.js';

export function markRows<T>(rows: readonly ParsedRow<T>[], existing: ImportExisting): ParsedRow<T>[] {
  const known = new Set(existing.factoryFingerprints);
  return rows.map((row) => ({ ...row, action: actionOf(row, known) }));
}

function actionOf<T>(row: ParsedRow<T>, known: ReadonlySet<string>): 'skip' | 'unchanged' | 'create' {
  if (row.skipReason !== null) return 'skip';
  if (row.fingerprint === undefined) return 'create';
  return known.has(row.fingerprint) ? 'unchanged' : 'create';
}
