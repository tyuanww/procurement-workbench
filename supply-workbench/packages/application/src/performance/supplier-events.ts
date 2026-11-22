import { dateChangeCount, openExceptionCount, type KpiInput, type Lane } from '@sw/domain';
import { figure } from './use-cases/figures.js';
import type { SupplierEvents } from './views.js';

type Scope = { readonly partyId: string | null; readonly lane?: Lane | undefined };

export function scopedSupplierIds(input: KpiInput, lane?: Lane): string[] {
  const batches = input.batches.filter((batch) => lane === undefined || batch.lane === lane);
  const exceptions = input.exceptions.filter((event) => event.status === 'open' && (lane === undefined || event.lane === lane));
  const ids = new Set<string>();
  for (const { supplierPartyId } of [...batches, ...exceptions]) {
    if (supplierPartyId !== null && supplierPartyId !== undefined) ids.add(supplierPartyId);
  }
  return [...ids].sort();
}

export function supplierEventFigures(input: KpiInput, scope: Scope) {
  const measured = measureEvents(input, scope);
  return { dateChanges: figure(measured.dateChanges), openExceptions: figure(measured.openExceptions) };
}

export function supplierEvents(input: KpiInput, scope: Scope): SupplierEvents {
  const measured = measureEvents(input, scope);
  return { dateChanges: measured.dateChanges.numerator, openExceptions: measured.openExceptions.numerator };
}

function measureEvents(input: KpiInput, scope: Scope) {
  const scoped = {
    ...input,
    dateChanges: input.dateChanges.filter((event) => matches(event, scope)),
    exceptions: input.exceptions.filter((event) => matches(event, scope)),
  };
  return { dateChanges: dateChangeCount(scoped), openExceptions: openExceptionCount(scoped) };
}

function matches(event: KpiInput['dateChanges'][number] | KpiInput['exceptions'][number], scope: Scope): boolean {
  return (event.supplierPartyId ?? null) === scope.partyId && (scope.lane === undefined || event.lane === scope.lane);
}
