const SUFFIX = /-(\d+)$/;

export function barcodeBase(barcodeRaw: string): string {
  return barcodeRaw.normalize('NFKC').trim().replace(SUFFIX, '');
}

export function comparableBarcode(barcodeRaw: string): string {
  return barcodeRaw.normalize('NFKC').trim();
}
