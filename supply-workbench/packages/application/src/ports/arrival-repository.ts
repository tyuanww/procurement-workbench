import type { OrderLine, PurchaseOrder } from '@sw/domain';
import type { Arrival, ArrivalCandidate, RegisterArrivalInput } from '../follow-up/arrivals.js';

export interface ArrivalRepository {
  list(input: { readonly page: number; readonly pageSize: number; readonly pending: boolean }): Promise<{ readonly items: readonly Arrival[]; readonly total: number }>;
  get(id: string): Promise<Arrival>;
  lock(id: string): Promise<Arrival>;
  register(row: Arrival): Promise<void>;
  claimReference(key: string, arrivalId: string): Promise<string>;
  releaseReference(key: string, arrivalId: string): Promise<void>;
  replayKey(id: string, revision: number): Promise<string | undefined>;
  revise(row: Arrival, requestKey: string): Promise<void>;
  lockTargetLine(id: string): Promise<{ readonly line: OrderLine; readonly po: PurchaseOrder }>;
  candidates(input: Pick<RegisterArrivalInput, 'warehouseId' | 'itemCode'>): Promise<readonly ArrivalCandidate[]>;
}
