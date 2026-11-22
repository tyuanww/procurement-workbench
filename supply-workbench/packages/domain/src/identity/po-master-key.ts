import { normalizeText } from './text.js';

const EMPTY = '∅';

/** 03 第 4.4 节。空单号、空条码用 ∅，避免和真有值的行撞成同一个键。 */
export function poMasterBaseKey(input: {
  readonly poNorm: string | null;
  readonly barcode: string | null;
  readonly nameRaw: string | null;
}): string {
  const po = input.poNorm === null || input.poNorm === '' ? EMPTY : input.poNorm;
  const barcode = input.barcode === null || input.barcode === '' ? EMPTY : input.barcode;
  return `${po}|${barcode}|${normalizeText(input.nameRaw ?? '')}`;
}

export function poMasterCandidateKey(base: string, occurrence: number): string {
  return `${base}#${occurrence}`;
}
