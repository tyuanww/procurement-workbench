import {
  CreateDevelopmentNodeSchema, CreateDevelopmentProjectSchema, DevelopmentMaterialsSchema, DevelopmentOrdersSchema,
  DevelopmentResultSchema, LinkDevelopmentNodeSchema, ProductDevelopmentSchema, ReplyToDevelopmentNodeSchema,
  UpdateDevelopmentNodeSchema, type ProductDevelopmentStoreSchema,
} from '@sw/contracts';
import type { z } from 'zod';
import { apiGetWithSignal, apiSend } from '../../shared/api/client.js';

const root = '/api/v1/product-development';

export function readDevelopment(store: z.output<typeof ProductDevelopmentStoreSchema> | 'all', signal: AbortSignal) {
  return apiGetWithSignal({ path: `${root}?store=${store}`, schema: ProductDevelopmentSchema, signal });
}

export function findDevelopmentOrders({ store, search, signal }: { readonly store: string; readonly search: string; readonly signal: AbortSignal }) {
  return apiGetWithSignal({ path: `${root}/orders?${new URLSearchParams({ store, search })}`, schema: DevelopmentOrdersSchema, signal });
}

export function findDevelopmentMaterials({ store, orderLineId, signal }: { readonly store: string; readonly orderLineId: string; readonly signal: AbortSignal }) {
  return apiGetWithSignal({ path: `${root}/materials?${new URLSearchParams({ store, orderLineId })}`, schema: DevelopmentMaterialsSchema, signal });
}

export function saveDevelopmentProject(body: z.input<typeof CreateDevelopmentProjectSchema>) {
  return apiSend({ path: `${root}/projects`, method: 'POST', body, schema: DevelopmentResultSchema });
}

export function saveDevelopmentNode(body: z.input<typeof CreateDevelopmentNodeSchema>) {
  return apiSend({ path: `${root}/nodes`, method: 'POST', body, schema: DevelopmentResultSchema });
}

export function updateDevelopmentNode(body: z.input<typeof UpdateDevelopmentNodeSchema>) {
  return apiSend({ path: `${root}/nodes`, method: 'PATCH', body, schema: DevelopmentResultSchema });
}

export function saveDevelopmentReply(body: z.input<typeof ReplyToDevelopmentNodeSchema>) {
  return apiSend({ path: `${root}/replies`, method: 'POST', body, schema: DevelopmentResultSchema });
}

export function linkDevelopmentNode(body: z.input<typeof LinkDevelopmentNodeSchema>) {
  return apiSend({ path: `${root}/links`, method: 'POST', body, schema: DevelopmentResultSchema });
}
