import type { ProcurementFact, ProcurementPreviewFact, ProcurementSource } from '../ports/procurement-preview.js';

export function procurementSourceKey(source: ProcurementSource): string {
  return JSON.stringify([source.sheetName, source.rowNo]);
}

export function procurementSourceFact(fact: ProcurementPreviewFact): ProcurementFact {
  const { buyerFromRichText: isFromRichText, ...source } = fact;
  return isFromRichText === true ? source : fact;
}
