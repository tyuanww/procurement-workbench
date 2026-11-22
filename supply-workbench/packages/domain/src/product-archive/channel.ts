import type { ChannelMatch, PurchaseScope } from '../vocabulary/index.js';
import { barcodeBase, comparableBarcode } from './barcode.js';

export type ChannelProduct = {
  readonly barcodeRaw: string;
};

export function matchChannel({ lineBarcode, product, scope }: { readonly lineBarcode: string; readonly product: ChannelProduct; readonly scope: PurchaseScope }): ChannelMatch | null {
  const line = comparableBarcode(lineBarcode);
  const raw = comparableBarcode(product.barcodeRaw);
  if (line === '' || raw === '') return null;
  if (scope === 'exact') return line === raw ? 'exact' : null;
  if (barcodeBase(line) !== barcodeBase(raw)) return null;
  return line === raw ? 'exact' : 'sibling_channel';
}
