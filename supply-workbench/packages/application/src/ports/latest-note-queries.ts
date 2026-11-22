import type { LatestNote } from '../follow-up/record-views.js';

export interface LatestNoteQueries {
  latest(orderLineIds: readonly string[]): Promise<readonly LatestNote[]>;
}
