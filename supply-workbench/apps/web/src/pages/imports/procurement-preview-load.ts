import { useEffect, useState } from 'react';
import type { ImportBatchSummary, ProcurementPreviewSelection } from '@sw/contracts';
import { apiErrorMessage } from '../../shared/api/client.js';
import { fetchProcurementPreview } from './procurement-preview-model.js';

type Selection = Pick<ImportBatchSummary, 'id' | 'status'> & { readonly oa: string | null };
type Load = { readonly kind: 'ready'; readonly preview: ProcurementPreviewSelection } | { readonly kind: 'failed'; readonly message: string };
type Read = { readonly request: Selection; readonly load: Load | null };

export function useProcurementPreviewLoad(selection: Selection) {
  const [read, setRead] = useState<Read>(() => pending(selection));
  const current = readsSelection(read, selection) ? read : pending(selection);
  if (current !== read) setRead(current);
  const { request, load } = current;

  useEffect(() => {
    const controller = new AbortController();
    function publish(result: Load) {
      if (controller.signal.aborted) return;
      setRead((active) => active.request === request ? { request, load: result } : active);
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
  return { request: { ...selection }, load: null };
}

function readsSelection({ request, load }: Read, selection: Selection): boolean {
  if (request.id !== selection.id || request.status !== selection.status) return false;
  return request.oa === selection.oa
    || (request.oa === null && load?.kind === 'ready' && load.preview.oa === selection.oa);
}
