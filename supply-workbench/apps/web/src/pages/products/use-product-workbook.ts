import { useLayoutEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../shared/api/client.js';
import { commitWorkbookBatch, downloadWorkbookTemplate, readWorkbookBatch, uploadWorkbook, type WorkbookBatch } from './product-workbook-api.js';

export type WorkbookRead =
  | { readonly kind: 'upload' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly id: string }
  | { readonly kind: 'batch'; readonly batch: WorkbookBatch };
type WorkbookCache = Extract<WorkbookRead, { readonly kind: 'batch' | 'unavailable' }>;
type Mutation = 'upload' | 'commit' | 'template';
type WorkbookError = Pick<WorkbookInput, 'productId' | 'batchId'> & { readonly message: string };

type WorkbookInput = {
  readonly isOpen: boolean;
  readonly productId: string | null;
  readonly batchId: string | null;
  readonly setBatchId: (batchId: string | null) => void;
  readonly onCommitted: () => void;
};

export function useProductWorkbook(input: WorkbookInput) {
  const current = useCurrentWorkbook(input);
  const batch = useWorkbookRead(input);
  const [file, setFile] = useState<File | null>(null);
  const [error, setScopedError] = useState<WorkbookError | null>(null);
  const setError = (message: string | null) => setScopedError(message === null ? null : {
    productId: input.productId, batchId: input.batchId, message,
  });
  const { busy, mutation, run } = useWorkbookMutation(current, setError);
  return {
    read: batch.read, file, busy,
    error: error?.productId === input.productId && error.batchId === input.batchId ? error.message : null,
    isDownloading: busy === 'template', retryRead: batch.retry,
    download: () => run('template', () => downloadWorkbookTemplate(input.productId)),
    chooseFile(chosen: File) {
      if (mutation.current) return;
      if (!/\.xlsx$/i.test(chosen.name) || chosen.size === 0) return setError('请选择非空的 .xlsx 文件。');
      setError(null);
      setFile(chosen);
    },
    newFile() {
      if (mutation.current) return;
      setFile(null);
      setError(null);
      input.setBatchId(null);
    },
    preview() {
      if (file === null) return setError('请先选择一份 .xlsx 文件。');
      void run('upload', () => previewWorkbook({ current, file, acceptUpload: batch.acceptUpload }));
    },
    commit(value: WorkbookBatch) {
      if (value.status === 'ready') void run('commit', () => confirmWorkbook({ current, batchId: value.id, cache: batch.cache }));
    },
  };
}

type CurrentWorkbook = ReturnType<typeof useCurrentWorkbook>;
function useCurrentWorkbook(input: WorkbookInput) {
  const current = useRef<WorkbookInput | null>(input);
  useLayoutEffect(() => {
    current.current = input;
    return () => { current.current = null; };
  }, [input]);
  return current;
}

function useWorkbookRead({ isOpen, productId, batchId }: WorkbookInput) {
  const [cached, setCached] = useState<WorkbookCache | null>(null);
  const [attempt, setAttempt] = useState(0);
  const activeRead = useRef<AbortController | null>(null);
  const lastUpload = useRef<{ readonly productId: string | null; readonly batch: WorkbookBatch } | null>(null);
  const cachedId = cached?.kind === 'batch' ? cached.batch.id : cached?.id;
  useLayoutEffect(() => {
    const uploaded = lastUpload.current;
    lastUpload.current = null;
    if (!isOpen || batchId === null) return;
    if (uploaded?.productId === productId && uploaded.batch.id === batchId) {
      setCached({ kind: 'batch', batch: uploaded.batch });
      return;
    }
    const controller = new AbortController();
    activeRead.current = controller;
    setCached(null);
    void readWorkbookBatch({ productId, batchId, signal: controller.signal }).then(
      (batch) => { if (!controller.signal.aborted) setCached({ kind: 'batch', batch }); },
      () => { if (!controller.signal.aborted) setCached({ kind: 'unavailable', id: batchId }); },
    );
    return () => controller.abort();
  }, [isOpen, productId, batchId, attempt]);
  const read: WorkbookRead = batchId === null ? { kind: 'upload' }
    : cached === null || cachedId !== batchId ? { kind: 'loading' } : cached;
  return {
    read,
    acceptUpload: (batch: WorkbookBatch) => { lastUpload.current = { productId, batch }; },
    cache: (batch: WorkbookBatch) => {
      activeRead.current?.abort();
      setCached({ kind: 'batch', batch });
    },
    retry: () => setAttempt(value => value + 1),
  };
}

function useWorkbookMutation(current: CurrentWorkbook, setError: (message: string | null) => void) {
  const [busy, setBusy] = useState<Mutation | null>(null);
  const mutation = useRef(false);
  async function run(action: Mutation, work: () => Promise<void>) {
    if (mutation.current) return;
    const initial = current.current;
    mutation.current = true;
    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (cause) {
      const latest = current.current;
      if (initial !== null && latest?.isOpen && latest.productId === initial.productId && latest.batchId === initial.batchId) {
        setError(mutationError(action, cause));
      }
    } finally {
      mutation.current = false;
      setBusy(null);
    }
  }
  return { busy, mutation, run };
}

function mutationError(action: Mutation, cause: unknown): string {
  if (action === 'template') return '模板没有下载，请重试。';
  if (action === 'commit' && cause instanceof Error) return cause.message;
  return apiErrorMessage(cause) ?? '预览没有生成，请检查连接后用原文件重试。';
}

async function previewWorkbook({ current, file, acceptUpload }: {
  readonly current: CurrentWorkbook;
  readonly file: File;
  readonly acceptUpload: (batch: WorkbookBatch) => void;
}) {
  const initial = current.current;
  if (initial === null) return;
  const batch = await uploadWorkbook(initial.productId, file);
  const latest = current.current;
  if (latest === null || latest.productId !== initial.productId) return;
  if (latest.batchId === initial.batchId) {
    if (latest.isOpen) acceptUpload(batch);
    latest.setBatchId(batch.id);
  }
  if (batch.status === 'committed') latest.onCommitted();
}

async function confirmWorkbook({ current, batchId, cache }: {
  readonly current: CurrentWorkbook;
  readonly batchId: string;
  readonly cache: (batch: WorkbookBatch) => void;
}) {
  const initial = current.current;
  if (initial === null) return;
  const batch = await confirmedBatch(initial.productId, batchId);
  const latest = current.current;
  if (latest === null || latest.productId !== initial.productId) return;
  if (latest.isOpen && latest.batchId === batch.id) cache(batch);
  if (batch.status === 'committed') latest.onCommitted();
}

async function confirmedBatch(productId: string | null, batchId: string): Promise<WorkbookBatch> {
  try {
    return await commitWorkbookBatch(productId, batchId);
  } catch {
    const latest = await readWorkbookBatch({ productId, batchId }).catch(() => null);
    if (latest === null) throw new Error('暂时无法确认导入结果。请用同一批次重试。');
    if (latest.status === 'ready') throw new Error('这次没有完成导入。请用同一批次重试。');
    return latest;
  }
}
