import type { SheetLike } from '../../../../../application/src/ports/workbook-reader.js';
import type { CustomerSuppliedPayload, PendingCodeLink } from '../../../../../application/src/ports/parsed-rows.js';
import { type ImportIssue, type Settings } from '@sw/domain';
import { dateField, numberField, textField, type DraftRow } from '../fingerprint.js';
import { scanSheet } from '../scan.js';
import { take, type SheetReader } from '../read-cell.js';
import { SHEETS } from '../spec/index.js';

export function parseCustomerSupplied(input: {
  readonly sheet: SheetLike;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
}): { readonly rows: DraftRow<CustomerSuppliedPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  return scanSheet({
    sheet: input.sheet,
    columns: SHEETS.customerSupplied.columns,
    date1904: input.date1904,
    dateSanityRange: input.dateSanityRange,
    fields: suppliedFields,
    build: ({ reader, row }) => buildRow(reader, row),
  });
}

function buildRow(reader: SheetReader, row: number): { readonly payload: CustomerSuppliedPayload; readonly issues: ImportIssue[]; readonly links: PendingCodeLink[] } {
  const issues: ImportIssue[] = [];
  return {
    issues,
    links: [],
    payload: {
      registeredOn: take(issues, reader.date(row, '登记时间')),
      seqRaw: take(issues, reader.text({ row, name: '序号' })),
      itemCodeRaw: take(issues, reader.code(row, '原料代码')),
      nameRaw: take(issues, reader.text({ row, name: '品名' })),
      lotRaw: take(issues, reader.text({ row, name: '批号' })),
      specKg: take(issues, reader.qty(row, '规格kg')),
      pieces: take(issues, reader.qty(row, '件数')),
      netQty: take(issues, reader.qty(row, '数量（净重）')),
      expiresOn: take(issues, reader.date(row, '有效日期')),
      ownerNoteRaw: take(issues, reader.text({ row, name: '备注' })),
    },
  };
}

function suppliedFields(payload: CustomerSuppliedPayload): string[] {
  return [
    dateField(payload.registeredOn),
    textField(payload.seqRaw),
    textField(payload.itemCodeRaw),
    textField(payload.nameRaw),
    textField(payload.lotRaw),
    numberField(payload.specKg),
    numberField(payload.pieces),
    numberField(payload.netQty),
    dateField(payload.expiresOn),
    textField(payload.ownerNoteRaw),
  ];
}
