import type { ListLatestNotes, ListLatestNotesDeps } from '../boundary.js';

export const makeListLatestNotes =
  (deps: ListLatestNotesDeps): ListLatestNotes =>
  async (input) => ({ items: await deps.notes.latest(input.orderLineIds) });
