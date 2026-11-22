import { useEffect, useRef, useState } from 'react';
import { nudgeOf } from '../../features/today/index.js';
import { fetchTodayChase } from '../../shared/api/catalog.js';
import { actionChaseSearch, type ActionQuery, type ChaseScope } from './action-query.js';

export function useChaseCopy({ query, buyerName }: { readonly query: ActionQuery; readonly buyerName: string }) {
  const [isCopying, setCopying] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  const filterPath = actionChaseSearch(query, { kind: 'filtered' });

  useEffect(() => {
    setCopyNotice('');
    setCopying(false);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [filterPath]);

  async function copy(scope: ChaseScope): Promise<void> {
    if (active.current !== null) return;
    const pending = new AbortController();
    active.current = pending;
    setCopying(true);
    setCopyNotice('');
    try {
      const rows = await fetchTodayChase(actionChaseSearch(query, scope), pending.signal);
      if (pending.signal.aborted) return;
      const text = nudgeOf({ chase: rows, buyerName });
      if (text === '') {
        setCopyNotice('当前条件没有可复制的催单。');
        return;
      }
      await navigator.clipboard.writeText(text);
      if (!pending.signal.aborted) setCopyNotice(`已复制 ${rows.length} 条催单`);
    } catch {
      if (!pending.signal.aborted) setCopyNotice('复制催单失败，请重试。');
    } finally {
      if (active.current === pending) {
        active.current = null;
        setCopying(false);
      }
    }
  }

  return { isCopying, copyNotice, onCopyChase: (scope: ChaseScope) => { void copy(scope); } };
}
