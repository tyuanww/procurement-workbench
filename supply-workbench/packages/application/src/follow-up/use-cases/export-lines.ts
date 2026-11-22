import { lineColumnsInOrder, lineStageLabel, visibleLineDeskColumns, type LineDeskColumnKey } from '@sw/domain';
import type { SheetCell } from '../../ports/spreadsheet-writer.js';
import type { ExportLines, ExportLinesDeps } from '../boundary.js';
import type { LinesQuery, OrderLineRow } from '../views.js';

const CELLS: Record<LineDeskColumnKey, (row: OrderLineRow) => SheetCell> = {
  po: poCell,
  name: (row) => row.nameRaw,
  supplier: (row) => row.supplier.displayName ?? row.supplier.rawName,
  factory: (row) => row.factory?.displayName ?? '未关联',
  receiver: (row) => row.receiver?.displayName ?? null,
  qtyOrdered: (row) => row.qtyOrdered,
  received: (row) => row.receivedQty,
  factoryDelivered: (row) => row.factoryDeliveredQty.value,
  stage: (row) => lineStageLabel(row.stage),
  nextDue: nextDueCell,
  factoryRequired: factoryRequiredCell,
  daysInStage: (row) => row.daysInStage,
  buyer: (row) => row.buyer?.name ?? '未分配',
  status: (row) => row.statusReported,
};

export const makeExportLines =
  (deps: ExportLinesDeps): ExportLines =>
  async (input) => {
    const query = unpaged(input.query);
    const columns = input.columnKeys.length === 0
      ? visibleLineDeskColumns({ lane: query.lane, hiddenKeys: input.hiddenKeys })
      : lineColumnsInOrder({ lane: query.lane, keys: input.columnKeys });
    const listed = await deps.lines.list(query);
    const rows = [columns.map((column) => column.title), ...listed.items.map((row) => columns.map((column) => CELLS[column.key](row)))];
    return { bytes: deps.sheets.write({ sheets: [{ name: '订单行', rows }] }), fileName: 'lines.xlsx' };
  };

function unpaged(query: LinesQuery): LinesQuery {
  const { page, pageSize, ...filter } = query;
  void page;
  void pageSize;
  return filter;
}

function poCell(row: OrderLineRow): SheetCell {
  return row.po.poRaw ?? '无单号';
}

function nextDueCell(row: OrderLineRow): SheetCell {
  const day = row.nextDue?.dateBuyerConfirmed;
  if (day === undefined || day === null) return null;
  return { kind: 'date', day };
}

function factoryRequiredCell(row: OrderLineRow): SheetCell {
  const day = row.nextDue?.dateFactoryRequired;
  if (day === undefined || day === null) return null;
  return { kind: 'date', day };
}
