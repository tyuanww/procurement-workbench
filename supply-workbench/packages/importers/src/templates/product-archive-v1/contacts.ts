import type { ParsedRow, ProductArchivePayload } from '../../../../application/src/ports/parsed-rows.js';

export type ProductInfoContact = {
  readonly role: 'product_info';
  readonly nameRaw: string;
  readonly source: 'import';
  readonly rowNo: number;
};

export function productInfoContacts(rows: readonly ParsedRow<ProductArchivePayload>[]): readonly ProductInfoContact[] {
  return rows.flatMap((row) => contactOf(row));
}

function contactOf(row: ParsedRow<ProductArchivePayload>): ProductInfoContact[] {
  const name = row.payload.contactNameRaw.value;
  if (name === null || row.skipReason !== null) return [];
  return [{ role: 'product_info', nameRaw: name, source: 'import', rowNo: row.rowNo }];
}
