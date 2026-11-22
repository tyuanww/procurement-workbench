import type { SheetLike } from '../../../../../application/src/ports/workbook-reader.js';
import type { InTransitPayload, PendingCodeLink } from '../../../../../application/src/ports/parsed-rows.js';
import { cellIssue, isFactoryMismatch, type ImportIssue, type Settings } from '@sw/domain';
import { dateField, hashFields, numberField, poField, textField, type DraftRow } from '../fingerprint.js';
import { codeLink, presentLinks } from '../links.js';
import { take, type SheetReader } from '../read-cell.js';
import { scanSheet } from '../scan.js';
import { OUR_ITEM_CODE, SHEETS } from '../spec/index.js';

const COLUMN_M = 13;
const COLUMN_O = 15;

export function parseInTransit(input: {
  readonly sheet: SheetLike;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
  readonly factoryName: string | null;
}): { readonly rows: DraftRow<InTransitPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  return scanSheet({
    sheet: input.sheet,
    columns: SHEETS.inTransit.columns,
    date1904: input.date1904,
    dateSanityRange: input.dateSanityRange,
    fields: transitFields,
    build: ({ reader, row, isOk }) => buildRow({ sheetName: input.sheet.name, reader, row, factoryName: input.factoryName, isOk }),
  });
}

function buildRow(input: { readonly sheetName: string; readonly reader: SheetReader; readonly row: number; readonly factoryName: string | null; readonly isOk: boolean }): { readonly payload: InTransitPayload; readonly issues: ImportIssue[]; readonly links: PendingCodeLink[] } {
  const issues: ImportIssue[] = [];
  const payload = payloadOf({ reader: input.reader, row: input.row, issues });
  const ours = take(issues, input.reader.code(input.row, OUR_ITEM_CODE));
  issues.push(...mismatch(payload.supplierRaw.value, input.factoryName));
  return { payload, issues, links: linksOf({ sheetName: input.sheetName, row: input.row, barcode: payload.barcodeRaw.value, item: payload.itemCodeRaw.value, ours: ours.value }) };
}

function payloadOf({ reader, row, issues }: { readonly reader: SheetReader; readonly row: number; readonly issues: ImportIssue[] }): InTransitPayload {
  return {
    po: take(issues, reader.po(row, '订单号')),
    nameRaw: take(issues, reader.text({ row, name: '品名' })),
    supplierRaw: take(issues, reader.text({ row, name: '供应商' })),
    barcodeRaw: take(issues, reader.barcode(row, '产品69码')),
    orderedOn: take(issues, reader.date(row, '下单时间')),
    qtyRequired: take(issues, reader.qty(row, '采购需求量')),
    qtyDeliveredFactory: take(issues, reader.qty(row, '已交货数量')),
    qtyFactoryStock: take(issues, reader.qty(row, '工厂现货库存数量')),
    qtyUnproduced: take(issues, reader.qty(row, '未生产数量')),
    closedRaw: take(issues, reader.text({ row, name: '是否结单' })),
    itemCodeRaw: take(issues, reader.code(row, '品号')),
    materialPoRaws: take(issues, reader.po(row, '客供包材采购单号')),
    buyerNameRaw: take(issues, reader.text({ row, name: '采购' })),
    extra: { M: take(issues, reader.extra(row, COLUMN_M)), O: take(issues, reader.extra(row, COLUMN_O)) },
  };
}

function linksOf(input: { readonly sheetName: string; readonly row: number; readonly barcode: string | null; readonly item: string | null; readonly ours: string | null }): PendingCodeLink[] {
  return presentLinks([
    codeLink({ sheetName: input.sheetName, rowNo: input.row, from: input.barcode, to: input.item }),
    codeLink({ sheetName: input.sheetName, rowNo: input.row, from: input.ours, to: input.item ?? input.barcode }),
  ]);
}

function transitFields(payload: InTransitPayload): string[] {
  return [
    poField(payload.po),
    textField(payload.nameRaw),
    textField(payload.supplierRaw),
    textField(payload.barcodeRaw),
    dateField(payload.orderedOn),
    numberField(payload.qtyRequired),
    numberField(payload.qtyDeliveredFactory),
    numberField(payload.qtyFactoryStock),
    numberField(payload.qtyUnproduced),
    textField(payload.closedRaw),
    textField(payload.itemCodeRaw),
    poField(payload.materialPoRaws),
    textField(payload.buyerNameRaw),
    textField(payload.extra.M),
    textField(payload.extra.O),
  ];
}

export function rehashTransit(row: DraftRow<InTransitPayload>): DraftRow<InTransitPayload> {
  return { ...row, base: hashFields(row.sheetName, transitFields(row.payload)) };
}

function mismatch(supplier: string | null, factoryName: string | null): ImportIssue[] {
  if (!isFactoryMismatch(supplier, factoryName)) return [];
  return [cellIssue({ code: 'FACTORY_MISMATCH', raw: supplier, column: '供应商' })];
}
