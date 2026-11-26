import { useCallback, useEffect, useState } from 'react';
import { businessToday } from '../../features/follow-up/index.js';
import { isWorkspaceChange, loadEntries, saveEntry } from './workspace-store.js';
import type { WorkspaceEntry } from './workspace-model.js';

type Records = { kind: 'ready'; entries: readonly WorkspaceEntry[] } | { kind: 'error' | 'loading' };

export function usePersonalWorkspace(userId: string) {
  const [today, setToday] = useState(businessToday);
  const [records, setRecords] = useState<Records>({ kind: 'loading' });
  const reload = useCallback(() => {
    const day = businessToday();
    setToday(day);
    try {
      setRecords({ kind: 'ready', entries: loadEntries({ userId, today: day }) });
    } catch {
      setRecords({ kind: 'error' });
    }
  }, [userId]);
  useEffect(() => {
    reload();
    const sync = (event: StorageEvent) => { if (isWorkspaceChange(userId, event)) reload(); };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', reload);
    };
  }, [reload, userId]);
  function save(entry: WorkspaceEntry) {
    saveEntry(userId, entry);
    reload();
  }
  return { today, records, reload, save };
}
