import type { ImportExisting } from '../../../../application/src/ports/parsed-rows.js';
import { plannerContentKey } from './identity.js';
import type { PlannerSheetParsed } from './parse.js';

export function diffPlannerSheet(parsed: PlannerSheetParsed, existing: ImportExisting): PlannerSheetParsed {
  const known = new Set(existing.factoryFingerprints);
  return { ...parsed, rows: parsed.rows.map((row) => mark(row, known)) };
}

function mark(row: PlannerSheetParsed['rows'][number], known: ReadonlySet<string>): PlannerSheetParsed['rows'][number] {
  return { ...row, action: actionOf(row, known) };
}

function actionOf(row: PlannerSheetParsed['rows'][number], known: ReadonlySet<string>): 'skip' | 'unchanged' | 'create' {
  if (row.skipReason !== null) return 'skip';
  return known.has(plannerContentKey(row)) ? 'unchanged' : 'create';
}
