import { normalizeText, type OrderLineId } from '@sw/domain';
import type { MemoryBox } from './box.js';
import { idRepository } from './repository.js';

export function factoryReportRepository(box: MemoryBox) {
  const repo = idRepository(() => box.current.factoryReports, '代工厂上报');
  return {
    ...repo,
    async linkUnassignedTransit(rowId: string, lineId: OrderLineId) {
      const row = await repo.find(rowId);
      if (row?.kind !== 'in_transit' || row.linkedOrderLineId !== null) return false;
      await repo.save({ ...row, linkedOrderLineId: lineId, linkStatus: 'manual', linkReason: null });
      return true;
    },
    async listByCodeNorm(codeNorm: string) {
      return [...box.current.factoryReports.values()].filter((row) => reportCodes(row).some((code) => code === codeNorm));
    },
  };
}

function reportCodes(row: { readonly inTransit: { readonly itemCodeRaw: string | null; readonly barcodeRaw: string | null } | null; readonly demand: { readonly itemCodeRaw: string | null } | null }): string[] {
  return [row.inTransit?.itemCodeRaw, row.inTransit?.barcodeRaw, row.demand?.itemCodeRaw].flatMap((code) => {
    if (code === null || code === undefined) return [];
    const normalized = normalizeText(code);
    return normalized === '' ? [] : [normalized];
  });
}
