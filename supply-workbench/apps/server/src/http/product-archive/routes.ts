import type { FastifyInstance, FastifyRequest } from 'fastify';
import { EntityIdSchema, ProductIdSchema, SetProductContactsRequestSchema } from '@sw/contracts';
import { z } from 'zod';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import type { ProductApi } from './api.js';
import { registerProductImages } from './images.js';

const IdParams = z.object({ id: ProductIdSchema }).strict();
const ImageParams = z.object({ id: ProductIdSchema, imageId: EntityIdSchema }).strict();
const ListQuery = z.object({
  q: z.string().optional(),
  productLine: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function registerProductRoutes({ app, api, attachmentMaxBytes }: { readonly app: FastifyInstance; readonly api: ProductApi; readonly attachmentMaxBytes: number }): void {
  app.get('/api/v1/products', async (req) => api.list(pageQuery(req), requireActor(req)));
  app.get('/api/v1/products/:id', async (req) => api.overview({ productId: idOf(req) }, requireActor(req)));
  app.get('/api/v1/products/:id/purchases', async (req) => api.purchases(purchaseQuery(req), requireActor(req)));
  app.get('/api/v1/products/:id/stock', async (req) => api.stock({ productId: idOf(req) }, requireActor(req)));
  app.get('/api/v1/products/:id/materials', async (req) => api.materials({ productId: idOf(req) }, requireActor(req)));
  app.patch('/api/v1/products/:id', async (req) => update(api, req));
  app.post('/api/v1/products/:id/images/:imageId/hide', async (req) => hide(api, req));
  app.post('/api/v1/products/:id/images/:imageId/unhide', async (req) => unhide(api, req));
  app.put('/api/v1/products/:id/contacts', async (req) => contacts(api, req));
  registerProductImages({ app, api, attachmentMaxBytes });
}

async function update(api: ProductApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const productId = idOf(req);
  await api.update({ productId, ...bodyOf(req) }, actor);
  return api.overview({ productId }, actor);
}

async function hide(api: ProductApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const params = parse(ImageParams, req.params);
  const reason = isRecord(req.body) && typeof req.body.reason === 'string' ? req.body.reason : '';
  await api.hideImage({ productId: params.id, imageId: params.imageId, reason }, actor);
  return api.overview({ productId: params.id }, actor);
}

async function unhide(api: ProductApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const params = parse(ImageParams, req.params);
  await api.unhideImage({ productId: params.id, imageId: params.imageId, reason: '恢复' }, actor);
  return api.overview({ productId: params.id }, actor);
}

async function contacts(api: ProductApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const productId = idOf(req);
  await api.contacts({ productId, ...parse(SetProductContactsRequestSchema, req.body) }, actor);
  return api.overview({ productId }, actor);
}

function purchaseQuery(req: FastifyRequest) {
  const raw = isRecord(req.query) ? req.query : {};
  const scope = raw.scope === 'exact' ? 'exact' as const : 'all_channels' as const;
  return { productId: idOf(req), scope };
}

function pageQuery(req: FastifyRequest) {
  const { q, productLine, page, pageSize } = parse(ListQuery, req.query);
  return { page, pageSize, ...(q === undefined ? {} : { q }), ...(productLine === undefined ? {} : { productLine }) };
}

function bodyOf(req: FastifyRequest): Record<string, string> {
  if (!isRecord(req.body)) return {};
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body)) if (typeof value === 'string') body[key] = value;
  return body;
}

function idOf(req: FastifyRequest) {
  return parse(IdParams, req.params).id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
