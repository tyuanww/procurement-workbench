import { useEffect, useState } from 'react';
import type { ImportBatchSummary, ProcurementPreviewSelection } from '@sw/contracts';
import { apiErrorMessage } from '../../shared/api/client.js';
import { fetchProcurementPreview } from './procurement-preview-model.js';

type Selection = Pick<ImportBatchSummary, 'id' | 'status'> & { readonly oa: string | null };
type Load = { readonly kind: 'ready'; readonly preview: ProcurementPreviewSelection } | { readonly kind: 'failed'; readonly message: string };
type Read = { readonly request: Selection; readonly selectedOa: string | null; readonly load: Load | null };

export function useProcurementPreviewLoad(selection: Selection, hasRowSource: boolean) {
  const [read, setRead] = useState<Read>(() => pending(selection));
  const current = selectRead(read, { selection, hasRowSource });
  if (current !== read) setRead(current);
  const { request, load } = current;

  useEffect(() => {
    const controller = new AbortController();
    function publish(result: Load) {
      if (controller.signal.aborted) return;
      setRead((active) => active.request === request ? { ...active, load: result } : active);
    }
    void fetchProcurementPreview({ ...request, signal: controller.signal }).then((preview) => {
      publish(preview === null ? { kind: 'failed', message: '这次导入没有可读取的关联预览' } : { kind: 'ready', preview });
    }).catch((error: unknown) => {
      publish({ kind: 'failed', message: apiErrorMessage(error) ?? '读取关联预览失败' });
    });
    return () => controller.abort();
  }, [request]);

  return { load, retry: () => setRead(pending(selection)) };
}

function pending(selection: Selection): Read {
  return { request: { ...selection }, selectedOa: selection.oa, load: null };
}

function selectRead(read: Read, { selection, hasRowSource }: { readonly selection: Selection; readonly hasRowSource: boolean }): Read {
  if (read.request.id === selection.id && read.request.status === selection.status) {
    if (read.selectedOa === selection.oa) return read;
    if (hasRowSource && read.selectedOa === null && read.load?.kind === 'ready' && read.load.preview.oa === selection.oa) {
      // 打开来源行会把已读的默认 OA 写入地址。保留 request 避免重复读取，用 selectedOa 记录地址变化。
      return { ...read, selectedOa: selection.oa };
    }
  }
  return pending(selection);
}
