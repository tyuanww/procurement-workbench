import { ProductWorkbookPreviewSchema } from '@sw/contracts';
import type { z } from 'zod';
import { apiDownload, apiGetWithSignal, apiSend, apiUpload } from '../../shared/api/client.js';

export type WorkbookBatch = z.infer<typeof ProductWorkbookPreviewSchema>;

export function workbookPath(productId: string | null): string {
  return `${workbookBase(productId)}/workbook-imports`;
}

export function workbookBatchPath(productId: string | null, batchId: string): string {
  return `${workbookPath(productId)}/${encodeURIComponent(batchId)}`;
}

export function downloadWorkbookTemplate(productId: string | null): Promise<void> {
  return apiDownload({
    path: `${workbookBase(productId)}/workbook-import-template`,
    fileName: '产品档案维护模板.xlsx',
  });
}

export function uploadWorkbook(productId: string | null, file: File): Promise<WorkbookBatch> {
  const body = new FormData();
  body.set('file', file);
  return apiUpload({ path: workbookPath(productId), body, schema: ProductWorkbookPreviewSchema });
}

export function readWorkbookBatch({ productId, batchId, signal }: {
  readonly productId: string | null;
  readonly batchId: string;
  readonly signal?: AbortSignal;
}): Promise<WorkbookBatch> {
  return apiGetWithSignal({
    path: workbookBatchPath(productId, batchId),
    schema: ProductWorkbookPreviewSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function commitWorkbookBatch(productId: string | null, batchId: string): Promise<WorkbookBatch> {
  return apiSend({ path: `${workbookBatchPath(productId, batchId)}/commit`, method: 'POST', schema: ProductWorkbookPreviewSchema });
}

function workbookBase(productId: string | null): string {
  return productId === null ? '/api/v1/products' : `/api/v1/products/${encodeURIComponent(productId)}`;
}
