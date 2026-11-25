import { isLocalDate } from '@sw/domain';
import { z } from 'zod';
import { entrySchema, type WorkspaceEntry } from './workspace-model.js';
import { sampleEntries } from './workspace-samples.js';

const storedEntry = z.union([entrySchema, z.object({ kind: z.literal('note') })]);

function prefix(userId: string) {
  return 'sw.personal-preview.v1.' + encodeURIComponent(userId) + ':';
}

export function loadEntries({ userId, today }: { userId: string; today: string }): WorkspaceEntry[] {
  const key = prefix(userId);
  const storedDay = localStorage.getItem(key + 'startedOn');
  const day = storedDay !== null && isLocalDate(storedDay) ? storedDay : today;
  if (day !== storedDay) localStorage.setItem(key + 'startedOn', day);
  const items = new Map(sampleEntries(day).map((entry) => [entry.item.id, entry]));
  for (const name of Object.keys(localStorage)) {
    if (!name.startsWith(key + 'entry:')) continue;
    const raw = localStorage.getItem(name);
    if (raw === null) continue;
    const entry = storedEntry.parse(JSON.parse(raw));
    if (entry.kind !== 'note') items.set(entry.item.id, entry);
  }
  return [...items.values()];
}

export function saveEntry(userId: string, entry: WorkspaceEntry) {
  localStorage.setItem(prefix(userId) + 'entry:' + entry.item.id, JSON.stringify(entrySchema.parse(entry)));
}

export function isWorkspaceChange(userId: string, event: StorageEvent) {
  return event.storageArea === localStorage && (event.key === null || event.key.startsWith(prefix(userId)));
}
