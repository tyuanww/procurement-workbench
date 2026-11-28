import { normalizeFactoryReportCode, type OrderLineId } from '@sw/domain';
import type { FactoryReportRepository } from '../../../application/src/ports/factory-report-repository.js';
import type { MemoryBox } from './box.js';
import { idRepository } from './repository.js';

export function factoryReportRepository(box: MemoryBox) {
  const repo = idRepository(() => box.current.factoryReports, '代工厂上报');
  return {
    ...repo,
    async getForDemandGeneration(id: string) {
      return { row: await repo.get(id), version: null };
    },
    async demandSourcesAtGeneration() { return new Map<never, never>(); },
    lockSnapshotSource: async () => {},
    lockReportSources: async () => {},
    effectiveReportOwners: async () => [],
    lockSnapshotOrders: async () => {},
    async linkUnassignedTransit(rowId: string, lineId: OrderLineId) {
      const row = await repo.find(rowId);
      if (row?.kind !== 'in_transit' || row.linkedOrderLineId !== null) return false;
      await repo.save({ ...row, linkedOrderLineId: lineId, linkStatus: 'manual', linkReason: null });
      return true;
    },
    async listByCodeNorm(codeNorm: string) {
      const requested = normalizeFactoryReportCode(codeNorm);
      if (requested === '') return [];
      return [...box.current.factoryReports.values()].filter((row) => reportCodes(row).includes(requested));
    },
    async lockRelinkRows({ codeNorms, candidates }: Parameters<FactoryReportRepository['lockRelinkRows']>[0]) {
      const requested = new Set(codeNorms.map(normalizeFactoryReportCode).filter((code) => code !== ''));
      return candidates.flatMap((candidate) => {
        const row = box.current.factoryReports.get(candidate.id);
        if (row?.kind !== candidate.kind || row.factoryPartyId !== candidate.factoryPartyId || row.linkStatus === 'manual') return [];
        const po = (row.inTransit ?? row.demand)?.poNorm;
        if (po === undefined || po === null || po === '') return [];
        return reportCodes(row).some((code) => requested.has(code)) ? [row] : [];
      });
    },
  };
}

function reportCodes(row: { readonly inTransit: { readonly itemCodeRaw: string | null; readonly barcodeRaw: string | null } | null; readonly demand: { readonly itemCodeRaw: string | null } | null }): string[] {
  return [row.inTransit?.itemCodeRaw, row.inTransit?.barcodeRaw, row.demand?.itemCodeRaw]
    .map(normalizeFactoryReportCode).filter((code) => code !== '');
}
