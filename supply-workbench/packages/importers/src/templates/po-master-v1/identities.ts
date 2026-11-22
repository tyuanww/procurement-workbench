import type { ParsedRow, PoMasterPayload } from '../../../../application/src/ports/parsed-rows.js';
import { normalizeText } from '@sw/domain';

export type PendingAlias = { readonly nameRaw: string; readonly normName: string };

export function pendingIdentities(rows: readonly ParsedRow<PoMasterPayload>[]): { readonly aliases: readonly PendingAlias[]; readonly barcodes: readonly string[] } {
  return { aliases: uniqueAliases(rows), barcodes: uniqueBarcodes(rows) };
}

function uniqueAliases(rows: readonly ParsedRow<PoMasterPayload>[]): PendingAlias[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const name = row.payload.supplierRaw.value;
    if (name === null) continue;
    const normName = normalizeText(name);
    if (!seen.has(normName)) seen.set(normName, name);
  }
  return [...seen].map(([normName, nameRaw]) => ({ nameRaw, normName }));
}

function uniqueBarcodes(rows: readonly ParsedRow<PoMasterPayload>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const code = row.payload.barcodeRaw.value;
    if (code !== null) seen.add(code);
  }
  return [...seen];
}
