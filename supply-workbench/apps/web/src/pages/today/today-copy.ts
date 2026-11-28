import { App } from 'antd';
import type { TodayFactory } from '@sw/contracts';
import { createElement, useEffect, useRef, useState } from 'react';
import { nudgeOf } from '../../features/today/index.js';
import { fetchTodayChase } from '../../shared/api/catalog.js';
import { actionChaseSearch, type ActionQuery, type ChaseScope } from './action-query.js';

const COPY_SUCCESS_KEY = 'today-chase-copy';

type CopyOperation = 'preview' | 'copy';

export type ChasePreview = {
  readonly factories: readonly (TodayFactory & { readonly count: number })[];
  readonly count: number;
  readonly text: string;
  readonly scope: 'all' | 'filtered';
};

export function useChaseCopy({ query, buyerName }: { readonly query: ActionQuery; readonly buyerName: string }) {
  const { message } = App.useApp();
  const [copyBatchId, setCopyBatchId] = useState<string | null>(null);
  const [copyPreview, setCopyPreview] = useState<ChasePreview | null>(null);
  const request = useCopyRequest(actionChaseSearch(query, { kind: 'filtered' }), setCopyPreview);

  function onCopyChase(scope: ChaseScope): void {
    setCopyBatchId(scope.kind === 'batch' ? scope.id : null);
    message.destroy(COPY_SUCCESS_KEY);
    const summaryScope = scope.kind === 'all' || scope.kind === 'filtered' ? scope.kind : null;
    void request.run(summaryScope === null ? 'copy' : 'preview', async (signal) => {
      const rows = await fetchTodayChase(actionChaseSearch(query, scope), signal);
      if (signal.aborted) return;
      const text = nudgeOf({ chase: rows, buyerName });
      if (text === '') return '当前条件没有可复制的催单。';
      if (summaryScope !== null) {
        setCopyPreview(previewOf({ rows, scope: summaryScope, text }));
        return;
      }
      await navigator.clipboard.writeText(text);
      if (!signal.aborted) showCopySuccess({ message, copied: rows.length });
      return undefined;
    });
  }

  function onConfirmCopy(): void {
    if (copyPreview === null) return;
    void request.run('copy', async (signal) => {
      const title = `【内部催货汇总 · ${copyPreview.factories.length} 家工厂】`;
      await navigator.clipboard.writeText(title + '\n\n' + copyPreview.text);
      if (!signal.aborted) {
        setCopyPreview(null);
        showCopySuccess({ message, copied: copyPreview.count });
      }
    });
  }

  function onCancelCopyPreview(): void {
    request.cancelPreview();
    setCopyPreview(null);
  }

  return { isCopying: request.isCopying, copyNotice: request.notice, copyBatchId, copyPreview, onCopyChase, onConfirmCopy, onCancelCopyPreview };
}

function useCopyRequest(path: string, clearPreview: (value: null) => void) {
  const [isCopying, setCopying] = useState(false);
  const [notice, setNotice] = useState('');
  const active = useRef<{ readonly kind: CopyOperation; readonly controller: AbortController } | null>(null);

  useEffect(() => {
    setNotice('');
    setCopying(false);
    clearPreview(null);
    return () => {
      active.current?.controller.abort();
      active.current = null;
    };
  }, [path, clearPreview]);

  function cancelPreview(): void {
    if (active.current?.kind === 'copy') return;
    active.current?.controller.abort();
    active.current = null;
    setCopying(false);
    setNotice('');
  }

  async function run(kind: CopyOperation, operation: (signal: AbortSignal) => Promise<string | void>): Promise<void> {
    if (active.current !== null) return;
    const pending = { kind, controller: new AbortController() };
    const { signal } = pending.controller;
    active.current = pending;
    setCopying(true);
    setNotice('');
    try {
      const notice = await operation(signal);
      if (notice !== undefined && !signal.aborted) setNotice(notice);
    } catch { if (!signal.aborted) setNotice('复制催单失败，请重试。'); } finally {
      if (active.current === pending) {
        active.current = null;
        setCopying(false);
      }
    }
  }

  return { isCopying, notice, run, cancelPreview };
}

function previewOf({ rows, scope, text }: {
  readonly rows: readonly { readonly factory: TodayFactory }[];
  readonly scope: ChasePreview['scope'];
  readonly text: string;
}): ChasePreview {
  const factories = new Map<string, TodayFactory & { readonly count: number }>();
  for (const { factory } of rows) {
    factories.set(factory.id, { ...factory, count: (factories.get(factory.id)?.count ?? 0) + 1 });
  }
  return { factories: [...factories.values()], count: rows.length, text, scope };
}

function showCopySuccess({ message, copied }: { readonly message: ReturnType<typeof App.useApp>['message']; readonly copied: number }): void {
  void message.success({
    key: COPY_SUCCESS_KEY,
    duration: 2,
    content: createElement('span', { role: 'status' }, `已复制 ${copied} 条催单`),
  });
}
