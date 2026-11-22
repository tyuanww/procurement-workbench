import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ParsedRow, ProductArchivePayload } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportIssue } from '@sw/domain';
import { readBarcode, readText } from './cells.js';
import { compactHeader } from './columns.js';

type ReadInput = { readonly sheet: SheetLike; readonly columns: ReadonlyMap<string, number> };

export function readBody(input: ReadInput): ParsedRow<ProductArchivePayload>[] {
  const rows: ParsedRow<ProductArchivePayload>[] = [];
  for (let row = 2; row <= input.sheet.rowCount; row += 1) {
    const built = oneRow(input, row);
    if (built !== null) rows.push(built);
  }
  return rows;
}

function oneRow(input: ReadInput, row: number): ParsedRow<ProductArchivePayload> | null {
  const issues: ImportIssue[] = [];
  const payload = payloadOf({ input, row, issues });
  if (isEmpty(payload)) return null;
  return { sheetName: input.sheet.name, rowNo: row, issues, action: null, targetId: null, skipReason: null, payload };
}

function payloadOf({ input, row, issues }: { readonly input: ReadInput; readonly row: number; readonly issues: ImportIssue[] }): ProductArchivePayload {
  const fields = fieldsOf({ sheet: input.sheet, row, columns: input.columns });
  for (const field of Object.values(fields)) issues.push(...field.issues);
  return {
    filingName: fields.filingName.cell,
    filingNo: fields.filingNo.cell,
    skuName: fields.skuName.cell,
    barcodeRaw: fields.barcodeRaw.cell,
    netContent: fields.netContent.cell,
    casePack: fields.casePack.cell,
    outerSize: fields.outerSize.cell,
    contactNameRaw: fields.contactNameRaw.cell,
  };
}

function fieldsOf(slot: { readonly sheet: SheetLike; readonly row: number; readonly columns: ReadonlyMap<string, number> }) {
  return {
    filingName: readText(slot, compactHeader('备案名称')),
    filingNo: readText(slot, compactHeader('备案号')),
    skuName: readText(slot, compactHeader('SKU名称')),
    barcodeRaw: readBarcode(slot, compactHeader('产品条码')),
    netContent: readText(slot, compactHeader('净含量')),
    casePack: readText(slot, compactHeader('箱规')),
    outerSize: readText(slot, compactHeader('外包装尺寸（长*宽*高）（单位：mm）')),
    contactNameRaw: readText(slot, compactHeader('项目对接人')),
  };
}

function isEmpty(payload: ProductArchivePayload): boolean {
  return payload.barcodeRaw.value === null && payload.filingName.value === null && payload.skuName.value === null && payload.contactNameRaw.value === null;
}
