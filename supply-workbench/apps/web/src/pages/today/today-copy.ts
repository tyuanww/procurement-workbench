import { App } from 'antd';
import { createElement, useEffect, useRef, useState } from 'react';
import { nudgeOf } from '../../features/today/index.js';
import { fetchTodayChase } from '../../shared/api/catalog.js';
import { actionChaseSearch, type ActionQuery, type ChaseScope } from './action-query.js';

const COPY_SUCCESS_KEY = 'today-chase-copy';

export function useChaseCopy({ query, buyerName }: { readonly query: ActionQuery; readonly buyerName: string }) {
  const { message } = App.useApp();
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
    message.destroy(COPY_SUCCESS_KEY);
    try {
      const copied = await copyChaseText({ path: actionChaseSearch(query, scope), buyerName, signal: pending.signal });
      if (pending.signal.aborted) return;
      if (copied === 0) setCopyNotice('当前条件没有可复制的催单。');
      else showCopySuccess({ message, copied });
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

async function copyChaseText({ path, buyerName, signal }: {
  readonly path: string;
  readonly buyerName: string;
  readonly signal: AbortSignal;
}): Promise<number> {
  const rows = await fetchTodayChase(path, signal);
  if (signal.aborted) return 0;
  const text = nudgeOf({ chase: rows, buyerName });
  if (text === '') return 0;
  await navigator.clipboard.writeText(text);
  return rows.length;
}

function showCopySuccess({ message, copied }: { readonly message: ReturnType<typeof App.useApp>['message']; readonly copied: number }): void {
  void message.success({
    key: COPY_SUCCESS_KEY,
    duration: 2,
    content: createElement('span', { role: 'status' }, `已复制 ${copied} 条催单`),
  });
}
