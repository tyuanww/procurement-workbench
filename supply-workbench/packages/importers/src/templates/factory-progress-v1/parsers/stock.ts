import type { SheetLike } from '../../../../../application/src/ports/workbook-reader.js';
import type { FactoryStockPayload, ParsedCell, PendingCodeLink } from '../../../../../application/src/ports/parsed-rows.js';
import { type ImportIssue, type Settings } from '@sw/domain';
import { dateField, numberField, poField, textField, type DraftRow } from '../fingerprint.js';
import { codeLink, presentLinks } from '../links.js';
import { take, type SheetReader } from '../read-cell.js';
import { scanSheet } from '../scan.js';
import { OUR_ITEM_CODE, SHEETS } from '../spec/index.js';

export function parseStock(input: {
  readonly sheet: SheetLike;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
}): { readonly rows: DraftRow<FactoryStockPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  return scanSheet({
    sheet: input.sheet,
    columns: SHEETS.stock.columns,
    date1904: input.date1904,
    dateSanityRange: input.dateSanityRange,
    fields: (payload) => stockFields(payload),
    build: ({ reader, row }) => buildRow({ sheetName: input.sheet.name, reader, row }),
  });
}

function buildRow(input: { readonly sheetName: string; readonly reader: SheetReader; readonly row: number }): { readonly payload: FactoryStockPayload; readonly issues: ImportIssue[]; readonly links: PendingCodeLink[] } {
  const issues: ImportIssue[] = [];
  const fields = payloadOf({ reader: input.reader, row: input.row, issues });
  const payload = { ...fields, inspected: inspectionOf(fields.inspectionRaw) };
  const ours = take(issues, input.reader.code(input.row, OUR_ITEM_CODE));
  return { payload, issues, links: presentLinks([codeLink({ sheetName: input.sheetName, rowNo: input.row, from: ours.value, to: payload.itemCodeRaw.value })]) };
}

function payloadOf({ reader, row, issues }: { readonly reader: SheetReader; readonly row: number; readonly issues: ImportIssue[] }): Omit<FactoryStockPayload, 'inspected'> {
  return {
    po: take(issues, reader.po(row, '订单号')),
    itemCodeRaw: take(issues, reader.code(row, '编码')),
    nameRaw: take(issues, reader.text({ row, name: '品名' })),
    lotRaw: take(issues, reader.lot(row, '批号')),
    qtyOnHand: take(issues, reader.qty(row, '结存数量')),
    palletsRaw: take(issues, reader.text({ row, name: '托数' })),
    coaOn: take(issues, reader.date(row, '状态（coa时间）')),
    producedOn: take(issues, reader.date(row, '生产日期')),
    inspectionRaw: take(issues, reader.text({ row, name: '是否验货' })),
  };
}

function inspectionOf(cell: ParsedCell<string>): boolean | null {
  if (cell.value === '是') return true;
  if (cell.value === '否') return false;
  return null;
}

function stockFields(payload: FactoryStockPayload): string[] {
  return [
    poField(payload.po),
    textField(payload.itemCodeRaw),
    textField(payload.nameRaw),
    textField(payload.lotRaw),
    numberField(payload.qtyOnHand),
    textField(payload.palletsRaw),
    dateField(payload.coaOn),
    dateField(payload.producedOn),
    textField(payload.inspectionRaw),
    payload.inspected === null ? '' : String(payload.inspected),
  ];
}
