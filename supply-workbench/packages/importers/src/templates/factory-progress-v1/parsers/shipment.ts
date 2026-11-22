import type { SheetLike } from '../../../../../application/src/ports/workbook-reader.js';
import type { FactoryShipmentPayload, PendingCodeLink } from '../../../../../application/src/ports/parsed-rows.js';
import { type ImportIssue, type Settings } from '@sw/domain';
import { dateField, numberField, poField, textField, type DraftRow } from '../fingerprint.js';
import { codeLink, presentLinks } from '../links.js';
import { take, type SheetReader } from '../read-cell.js';
import { scanSheet } from '../scan.js';
import { OUR_ITEM_CODE, SHEETS } from '../spec/index.js';

export function parseShipment(input: {
  readonly sheet: SheetLike;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
}): { readonly rows: DraftRow<FactoryShipmentPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  return scanSheet({
    sheet: input.sheet,
    columns: SHEETS.shipment.columns,
    date1904: input.date1904,
    dateSanityRange: input.dateSanityRange,
    fields: shipmentFields,
    build: ({ reader, row }) => buildRow({ sheetName: input.sheet.name, reader, row }),
  });
}

function buildRow(input: { readonly sheetName: string; readonly reader: SheetReader; readonly row: number }): { readonly payload: FactoryShipmentPayload; readonly issues: ImportIssue[]; readonly links: PendingCodeLink[] } {
  const issues: ImportIssue[] = [];
  const payload = payloadOf({ reader: input.reader, row: input.row, issues });
  const ours = take(issues, input.reader.code(input.row, OUR_ITEM_CODE));
  return { payload, issues, links: presentLinks([codeLink({ sheetName: input.sheetName, rowNo: input.row, from: ours.value, to: payload.itemCodeRaw.value })]) };
}

function payloadOf({ reader, row, issues }: { readonly reader: SheetReader; readonly row: number; readonly issues: ImportIssue[] }): FactoryShipmentPayload {
  return {
    po: take(issues, reader.po(row, '订单号')),
    itemCodeRaw: take(issues, reader.code(row, '品号')),
    nameRaw: take(issues, reader.text({ row, name: '品名' })),
    lotRaw: take(issues, reader.lot(row, '批号')),
    qty: take(issues, reader.qty(row, '数量')),
    casePackRaw: take(issues, reader.text({ row, name: '装箱规格' })),
    palletsRaw: take(issues, reader.text({ row, name: '托数' })),
    shipmentKindRaw: take(issues, reader.text({ row, name: '备注', occurrence: 1 })),
    shipOrArriveOn: take(issues, reader.date(row, '出货时间（到货时间）')),
    destinationRaw: take(issues, reader.text({ row, name: '客户仓+托数' })),
    vehicleRaw: take(issues, reader.text({ row, name: '车型' })),
    note2Raw: take(issues, reader.text({ row, name: '备注', occurrence: 2 })),
  };
}

function shipmentFields(payload: FactoryShipmentPayload): string[] {
  return [
    poField(payload.po),
    textField(payload.itemCodeRaw),
    textField(payload.nameRaw),
    textField(payload.lotRaw),
    numberField(payload.qty),
    textField(payload.casePackRaw),
    textField(payload.palletsRaw),
    textField(payload.shipmentKindRaw),
    dateField(payload.shipOrArriveOn),
    textField(payload.destinationRaw),
    textField(payload.vehicleRaw),
    textField(payload.note2Raw),
  ];
}
