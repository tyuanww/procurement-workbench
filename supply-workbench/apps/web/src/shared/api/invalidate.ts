import { dropFor, type ReadFamily } from './drops.js';
import { abortFlights } from './flights.js';
import { clearFamily, sessionId } from './slots.js';

export function noteWrite(input: { readonly method: string; readonly path: string }): void {
  const drop = dropFor({ path: input.path, sessionId: sessionId() });
  if (drop === null) return;
  if (drop.isSessionEnd) abortFlights();
  drop.families.forEach((family) => clearFamily(family, { isSilent: drop.isSessionEnd }));
}

export type { ReadFamily };
