import type { ParsedImport } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportFacts, ImportFingerprint } from '../../../../application/src/ports/import-template.js';

export function factoryIdentity(parsed: ParsedImport): readonly ImportFingerprint[] {
  if (parsed.template !== 'factory-progress-v1') return [];
  return [...parsed.inTransit, ...parsed.shipments, ...parsed.stock, ...parsed.schedule, ...parsed.demand, ...parsed.packagingCombo, ...parsed.customerSupplied].flatMap((row) =>
    row.fingerprint === undefined ? [] : [{ sheet: row.sheetName, rowNo: row.rowNo, fingerprint: row.fingerprint }],
  );
}

export function factoryFacts(parsed: ParsedImport): ImportFacts {
  if (parsed.template !== 'factory-progress-v1') return { ignoredSheets: [], codeLinks: [] };
  return { ignoredSheets: parsed.ignoredSheets, codeLinks: parsed.codeLinks };
}
