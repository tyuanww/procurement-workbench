import { App } from 'antd';
import type { TodayFactory } from '@sw/contracts';
import { createElement, useEffect, useRef, useState } from 'react';
import { nudgeOf } from '../../features/today/index.js';
import { fetchTodayChase } from '../../shared/api/catalog.js';
import { actionChaseSearch, type ActionQuery, type ChaseScope } from './action-query.js';

const COPY_SUCCESS_KEY = 'today-chase-copy';

export type ChasePreview = {
  readonly factories: readonly (TodayFactory & { readonly count: number })[];
  readonly count: number;
  readonly text: string;
  readonly scope: 'all' | 'filtered';
};

export function useChaseCopy({ query, buyerName }: { readonly query: ActionQuery; readonly buyerName: string }) {
  const { message } = App.useApp();
  const [copyPreview, setCopyPreview] = useState<ChasePreview | null>(null);
  const request = useCopyRequest(actionChaseSearch(query, { kind: 'filtered' }), setCopyPreview);

  function onCopyChase(scope: ChaseScope): void {
    message.destroy(COPY_SUCCESS_KEY);
    void request.run(async (signal) => {
      const rows = await fetchTodayChase(actionChaseSearch(query, scope), signal);
      if (signal.aborted) return;
      const text = nudgeOf({ chase: rows, buyerName });
      if (text === '') return '当前条件没有可复制的催单。';
      const preview = previewOf({ rows, scope, text });
      if (preview !== null) {
        setCopyPreview(preview);
        return;
      }
      await navigator.clipboard.writeText(text);
      if (!signal.aborted) showCopySuccess({ message, copied: rows.length });
    });
  }

  function onConfirmCopy(): void {
    if (copyPreview === null) return;
    void request.run(async (signal) => {
      const title = `【内部催货汇总 · ${copyPreview.factories.length} 家工厂】`;
      await navigator.clipboard.writeText(title + '\n\n' + copyPreview.text);
      if (!signal.aborted) showCopySuccess({ message, copied: copyPreview.count });
    }, () => setCopyPreview(null));
  }

  return { isCopying: request.isCopying, copyNotice: request.notice, copyPreview, onCopyChase, onConfirmCopy, onCancelCopy: () => setCopyPreview(null) };
}

function useCopyRequest(path: string, clearPreview: (value: null) => void) {
  const [isCopying, setCopying] = useState(false);
  const [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    setNotice('');
    setCopying(false);
    clearPreview(null);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [path, clearPreview]);

  async function run(operation: (signal: AbortSignal) => Promise<string | void>, finish?: () => void): Promise<void> {
    if (active.current !== null) return;
    const pending = new AbortController();
    active.current = pending;
    setCopying(true);
    setNotice('');
    try {
      const notice = await operation(pending.signal);
      if (notice !== undefined && !pending.signal.aborted) setNotice(notice);
    } catch {
      if (!pending.signal.aborted) setNotice('复制催单失败，请重试。');
    } finally {
      if (active.current === pending) {
        active.current = null;
        setCopying(false);
        finish?.();
      }
    }
  }

  return { isCopying, notice, run };
}

function previewOf({ rows, scope, text }: {
  readonly rows: readonly { readonly factory: TodayFactory }[];
  readonly scope: ChaseScope;
  readonly text: string;
}): ChasePreview | null {
  if (scope.kind !== 'all' && scope.kind !== 'filtered') return null;
  const factories = new Map<string, TodayFactory & { readonly count: number }>();
  for (const { factory } of rows) {
    factories.set(factory.id, { ...factory, count: (factories.get(factory.id)?.count ?? 0) + 1 });
  }
  return factories.size > 1 ? { factories: [...factories.values()], count: rows.length, text, scope: scope.kind } : null;
}

function showCopySuccess({ message, copied }: { readonly message: ReturnType<typeof App.useApp>['message']; readonly copied: number }): void {
  void message.success({
    key: COPY_SUCCESS_KEY,
    duration: 2,
    content: createElement('span', { role: 'status' }, `已复制 ${copied} 条催单`),
  });
}
