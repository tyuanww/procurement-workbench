import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ParsedRow, PoMasterPayload } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue, type ImportIssue, type Settings } from '@sw/domain';
import { readBarcode, readDate, readPo, readQty, readStatus, readText } from './cells.js';

type ReadInput = {
  readonly sheet: SheetLike;
  readonly columns: ReadonlyMap<string, number>;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
};

export function readBody(input: ReadInput): ParsedRow<PoMasterPayload>[] {
  const rows: ParsedRow<PoMasterPayload>[] = [];
  for (let row = 2; row <= input.sheet.rowCount; row += 1) rows.push(oneRow(input, row));
  return rows;
}

function oneRow(input: ReadInput, row: number): ParsedRow<PoMasterPayload> {
  const issues: ImportIssue[] = [];
  const payload = payloadOf({ input, row, issues });
  if (isBlankIdentity(payload)) issues.push(cellIssue({ code: 'ROW_NO_IDENTITY', raw: null }));
  const skipReason = errorCode(issues);
  return {
    sheetName: input.sheet.name,
    rowNo: row,
    issues,
    action: skipReason === null ? null : 'skip',
    targetId: null,
    skipReason,
    payload,
  };
}

function payloadOf({ input, row, issues }: { readonly input: ReadInput; readonly row: number; readonly issues: ImportIssue[] }): PoMasterPayload {
  const fields = fieldsOf(input, row);
  for (const field of Object.values(fields)) issues.push(...field.issues);
  return {
    oaDemandRef: fields.oaDemandRef.cell,
    supplierRaw: fields.supplierRaw.cell,
    nameRaw: fields.nameRaw.cell,
    barcodeRaw: fields.barcodeRaw.cell,
    qtyOrdered: fields.qtyOrdered.cell,
    oaSubmittedOn: fields.oaSubmittedOn.cell,
    oaRequiredOn: fields.oaRequiredOn.cell,
    plannedDurationDays: fields.plannedDurationDays.cell,
    po: fields.po.cell,
    actualStartOn: fields.actualStartOn.cell,
    firstDeliveryOn: fields.firstDeliveryOn.cell,
    actualEndOn: fields.actualEndOn.cell,
    actualDurationDays: fields.actualDurationDays.cell,
    factoryStockReported: fields.factoryStockReported.cell,
    shippedQtyReported: fields.shippedQtyReported.cell,
    qtyDiffReported: fields.qtyDiffReported.cell,
    statusReported: fields.statusReported.cell,
    ownerRaw: fields.ownerRaw.cell,
    factoryRaw: fields.factoryRaw.cell,
  };
}

function fieldsOf(input: ReadInput, row: number) {
  const slot = { sheet: input.sheet, row, columns: input.columns, date1904: input.date1904, dateSanityRange: input.dateSanityRange };
  return {
    oaDemandRef: readText(slot, 'OA需求编号'),
    supplierRaw: readText(slot, '供应商'),
    nameRaw: readText(slot, '产品名称'),
    barcodeRaw: readBarcode(slot, '产品条码'),
    qtyOrdered: readQty(slot, '订单数量'),
    oaSubmittedOn: readDate(slot, 'OA提报时间'),
    oaRequiredOn: readDate(slot, 'OA需求时间'),
    plannedDurationDays: readQty(slot, '计划时长'),
    po: readPo(slot, '采购订单号'),
    actualStartOn: readDate(slot, '实际开始（半成品订单创建）'),
    firstDeliveryOn: readDate(slot, '订单首批交付时间'),
    actualEndOn: readDate(slot, '实际结束（成品交付完成）'),
    actualDurationDays: readQty(slot, '实际时长'),
    factoryStockReported: readQty(slot, '工厂成品库存'),
    shippedQtyReported: readQty(slot, '实际发货数量'),
    qtyDiffReported: readQty(slot, '订单数量差额'),
    statusReported: readStatus(slot, '状态'),
    ownerRaw: readText(slot, '采购负责人'),
    factoryRaw: readText(slot, '工厂'),
  };
}

function isBlankIdentity(payload: PoMasterPayload): boolean {
  return payload.po.value === null && payload.barcodeRaw.value === null && payload.nameRaw.value === null;
}

function errorCode(issues: readonly ImportIssue[]): string | null {
  return issues.find((issue) => issue.severity === 'error')?.code ?? null;
}
