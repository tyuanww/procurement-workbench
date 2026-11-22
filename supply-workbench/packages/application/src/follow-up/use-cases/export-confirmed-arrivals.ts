import type { SpreadsheetWriter } from '../../ports/spreadsheet-writer.js';
import { CONFIRMED_ARRIVAL_COLUMNS, CONFIRMED_ARRIVAL_SHEET, UNCONFIRMED_ARRIVAL } from '@sw/domain';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import type { ConfirmedArrivalExportRow, ExportConfirmedArrivals } from '../boundary.js';

export const makeExportConfirmedArrivals =
  (deps: { readonly rows: (lineIds: readonly string[]) => Promise<readonly ConfirmedArrivalExportRow[]>; readonly sheets: SpreadsheetWriter }): ExportConfirmedArrivals =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const selected = await deps.rows(input.lineIds);
    if (selected.length === 0) throw new ValidationFailedError('所选订单没有可改确认日的批次');
    const rows = [Object.values(CONFIRMED_ARRIVAL_COLUMNS), ...selected.map((row) => [
      row.id, row.po, row.name, row.seq, row.warehouse, row.confirmedDate ?? UNCONFIRMED_ARRIVAL, '', '', row.receiverPartyId, row.lineId,
    ])];
    const bytes = deps.sheets.write({ sheets: [{ name: CONFIRMED_ARRIVAL_SHEET, rows }] });
    return { bytes, fileName: `${CONFIRMED_ARRIVAL_SHEET}.xlsx` };
  };
