import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ProductIdSchema, ProductOverviewSchema } from '@sw/contracts';
import { HttpError } from '../plugins/errors.js';
import { wire } from '../wire.js';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import type { ProductApi } from './api.js';
import { z } from 'zod';

const OVERHEAD = 1024 * 1024;
const IdParams = z.object({ id: ProductIdSchema }).strict();

export function registerProductImages({ app, api, attachmentMaxBytes }: { readonly app: FastifyInstance; readonly api: ProductApi; readonly attachmentMaxBytes: number }): void {
  app.register(async (scope) => {
    if (!scope.hasContentTypeParser('multipart/form-data')) await scope.register(multipart, { limits: { fileSize: attachmentMaxBytes } });
    scope.post('/api/v1/products/:id/images', { bodyLimit: attachmentMaxBytes + OVERHEAD }, async (req) => upload(api, req));
  });
}

async function upload(api: ProductApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const productId = parse(IdParams, req.params).id;
  const file = await readImage(req);
  await api.addImage({ productId, slot: file.slot, file }, actor);
  return wire(ProductOverviewSchema, await api.overview({ productId }, actor));
}

async function readImage(req: FastifyRequest): Promise<{ readonly bytes: Uint8Array; readonly fileName: string; readonly mime: string; readonly slot: 'inner' | 'outer' }> {
  const fields: Record<string, string> = {};
  let file: { readonly bytes: Uint8Array; readonly fileName: string; readonly mime: string } | undefined;
  for await (const part of req.parts()) {
    if (part.type === 'file') file = { bytes: await part.toBuffer(), fileName: part.filename, mime: part.mimetype };
    else if (typeof part.value === 'string') fields[part.fieldname] = part.value;
  }
  if (file === undefined) throw new HttpError({ code: 'VALIDATION_FAILED', message: '没有图片文件' });
  return { ...file, slot: slotOf(fields.slot) };
}

function slotOf(value: string | undefined): 'inner' | 'outer' {
  if (value === 'inner' || value === 'outer') return value;
  throw new HttpError({ code: 'VALIDATION_FAILED', message: '要选择图片位置' });
}
