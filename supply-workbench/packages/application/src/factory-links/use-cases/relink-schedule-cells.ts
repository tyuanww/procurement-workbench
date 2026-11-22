import { orderLineId as brandOrderLineId, type FactoryReportRow } from '@sw/domain';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import type { RelinkScheduleCells, RelinkScheduleCellsDeps } from '../boundary.js';
import { planScheduleCell, SCHEDULE_LINK_REVIEW, type ScheduleDecision } from '../schedule-plan.js';
import type { FactoryRowMatchRef } from '../views.js';
import { authorize } from '../../shared/authorize.js';

type Counters = { linked: number; unlinked: number; ambiguous: number; manual: number; review: number };

export const makeRelinkScheduleCells =
  (deps: RelinkScheduleCellsDeps): RelinkScheduleCells =>
  async (_input, actor) => {
    authorize(actor, 'master.review');
    const [orderLines, cells] = await Promise.all([deps.links.listOrderLineRefs(), deps.links.listActiveScheduleRefs()]);
    const counters = { linked: 0, unlinked: 0, ambiguous: 0, manual: 0, review: 0 };
    await deps.uow.run(async (tx) => {
      for (const cell of cells) await applyCell({ tx, cell, lines: orderLines, counters });
    });
    return { scheduleCells: cells.length, ...counters };
  };

async function applyCell(input: { readonly tx: UnitOfWorkStores; readonly cell: FactoryRowMatchRef; readonly lines: Parameters<typeof planScheduleCell>[1]; readonly counters: Counters }): Promise<void> {
  const decision = planScheduleCell(input.cell, input.lines);
  if (decision.kind === 'skip') {
    input.counters.manual += 1;
    return;
  }
  const found = await input.tx.factoryReports.find(input.cell.rowId);
  if (found === undefined || found.kind !== 'schedule' || found.linkStatus === 'manual') return;
  if (decision.kind === 'keep') {
    input.counters.review += 1;
    if (found.linkStatus === 'linked' && found.linkedOrderLineId === decision.lineId && found.linkReason === SCHEDULE_LINK_REVIEW) return;
    await input.tx.factoryReports.save({ ...found, linkedOrderLineId: brandOrderLineId(decision.lineId), linkStatus: 'linked', linkReason: SCHEDULE_LINK_REVIEW });
    return;
  }
  await writeDecision({ tx: input.tx, found, decision, counters: input.counters });
}

async function writeDecision(input: { readonly tx: UnitOfWorkStores; readonly found: FactoryReportRow; readonly decision: Extract<ScheduleDecision, { readonly kind: 'write' }>; readonly counters: Counters }): Promise<void> {
  const lineId = input.decision.lineId === null ? null : brandOrderLineId(input.decision.lineId);
  if (input.found.linkStatus === input.decision.status && input.found.linkedOrderLineId === lineId && input.found.linkReason === input.decision.reason) {
    countWrite(input.counters, input.decision.status);
    return;
  }
  await input.tx.factoryReports.save({ ...input.found, linkedOrderLineId: lineId, linkStatus: input.decision.status, linkReason: input.decision.reason });
  countWrite(input.counters, input.decision.status);
}

function countWrite(counters: Counters, status: 'linked' | 'unlinked' | 'ambiguous'): void {
  if (status === 'linked') counters.linked += 1;
  else if (status === 'ambiguous') counters.ambiguous += 1;
  else counters.unlinked += 1;
}
