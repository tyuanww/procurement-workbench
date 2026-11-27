import {
  CreateDevelopmentNodeSchema, CreateDevelopmentProjectSchema, DevelopmentMaterialsSchema, DevelopmentOrdersSchema,
  DevelopmentResultSchema, DevelopmentWorkbookPreviewSchema, LinkDevelopmentNodeSchema, ProductDevelopmentSchema, ReplyToDevelopmentNodeSchema,
  UpdateDevelopmentNodeSchema, UpdateDevelopmentProjectProgressSchema, type ProductDevelopmentStoreSchema,
} from '@sw/contracts';
import type { z } from 'zod';
import { apiGetWithSignal, apiSend, apiUpload } from '../../shared/api/client.js';

const root = '/api/v1/product-development';
const developmentReaders = new Set<() => void>();

export function onDevelopmentChange(reload: () => void): () => void {
  developmentReaders.add(reload);
  return () => { developmentReaders.delete(reload); };
}

async function writeDevelopment(input: {
  readonly path: string; readonly method: 'POST' | 'PATCH'; readonly body: unknown;
}): Promise<z.output<typeof DevelopmentResultSchema>> {
  const result = await apiSend({ ...input, schema: DevelopmentResultSchema });
  for (const refresh of developmentReaders) refresh();
  return result;
}

export function readDevelopment(store: z.output<typeof ProductDevelopmentStoreSchema> | 'all', signal: AbortSignal) {
  return apiGetWithSignal({ path: `${root}?store=${store}&includeReceiptDates=1`, schema: ProductDevelopmentSchema, signal });
}

export function findDevelopmentOrders({ store, search, signal }: { readonly store: string; readonly search: string; readonly signal: AbortSignal }) {
  return apiGetWithSignal({ path: `${root}/orders?${new URLSearchParams({ store, search })}`, schema: DevelopmentOrdersSchema, signal });
}

export function findDevelopmentMaterials({ store, orderLineId, signal }: { readonly store: string; readonly orderLineId: string; readonly signal: AbortSignal }) {
  return apiGetWithSignal({ path: `${root}/materials?${new URLSearchParams({ store, orderLineId })}`, schema: DevelopmentMaterialsSchema, signal });
}

export function saveDevelopmentProject(body: z.input<typeof CreateDevelopmentProjectSchema>) {
  return writeDevelopment({ path: `${root}/projects`, method: 'POST', body });
}

export function saveDevelopmentNode(body: z.input<typeof CreateDevelopmentNodeSchema>) {
  return writeDevelopment({ path: `${root}/nodes`, method: 'POST', body });
}

export function updateDevelopmentNode(body: z.input<typeof UpdateDevelopmentNodeSchema>) {
  return writeDevelopment({ path: `${root}/nodes`, method: 'PATCH', body });
}

export function saveDevelopmentReply(body: z.input<typeof ReplyToDevelopmentNodeSchema>) {
  return writeDevelopment({ path: `${root}/replies`, method: 'POST', body });
}

export function linkDevelopmentNode(body: z.input<typeof LinkDevelopmentNodeSchema>) {
  return writeDevelopment({ path: `${root}/links`, method: 'POST', body });
}

export function updateDevelopmentProject(body: z.input<typeof UpdateDevelopmentProjectProgressSchema>) {
  return writeDevelopment({ path: `${root}/projects`, method: 'PATCH', body });
}

export function previewDevelopmentWorkbook(store: z.output<typeof ProductDevelopmentStoreSchema>, file: File) {
  const body = new FormData();
  body.set('file', file, file.name);
  return apiUpload({ path: `${root}/workbook/preview?store=${store}`, body, schema: DevelopmentWorkbookPreviewSchema });
}
