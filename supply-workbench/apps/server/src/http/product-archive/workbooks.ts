import multipart from '@fastify/multipart';
import { can } from '@sw/application';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { EntityIdSchema, ProductIdSchema, ProductWorkbookPreviewSchema } from '@sw/contracts';
import { z } from 'zod';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { HttpError } from '../plugins/errors.js';
import { wire } from '../wire.js';
import type { ProductApi } from './api.js';

const IdParams = z.object({ id: ProductIdSchema.optional() }).strict();
const BatchParams = IdParams.extend({ batchId: EntityIdSchema });
const ImageParams = BatchParams.extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/u) });
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const OVERHEAD = 1024 * 1024;
const MULTIPART_SYNTAX = /^(Multipart: Boundary not found|Unexpected end of multipart data|(?:Part|Header) terminated early due to unexpected end of multipart data)$/i;

export function registerProductWorkbookRoutes(app: FastifyInstance, api: ProductApi): void {
  registerScope(app, { api, base: '/api/v1/products' });
  registerScope(app, { api, base: '/api/v1/products/:id' });
}

function registerScope(app: FastifyInstance, { api, base }: { readonly api: ProductApi; readonly base: string }): void {
  const { workbooks, workbookMaxBytes } = api;
  const upload = `${base}/workbook-imports`;
  app.register(async (scope) => {
    if (!scope.hasContentTypeParser('multipart/form-data')) await scope.register(multipart);
    scope.post(upload, { bodyLimit: workbookMaxBytes + OVERHEAD }, async (req) => {
      const actor = requireActor(req);
      if (!can(actor, 'imports.write')) throw new HttpError({ code: 'FORBIDDEN', message: '角色不允许', details: { action: 'imports.write' } });
      const { id: productId } = parse(IdParams, req.params);
      const file = await readWorkbookUpload(req, workbookMaxBytes);
      return wire(ProductWorkbookPreviewSchema, await workbooks.preview({ productId: productId ?? null, ...file }, actor));
    });
    scope.get(`${upload}/:batchId`, async (req, reply) => {
      const { id: productId, batchId } = parse(BatchParams, req.params);
      reply.header('Cache-Control', 'private, no-store');
      return wire(ProductWorkbookPreviewSchema, await workbooks.get({ productId: productId ?? null, batchId }, requireActor(req)));
    });
    scope.post(`${upload}/:batchId/commit`, async (req) => {
      const { id: productId, batchId } = parse(BatchParams, req.params);
      return wire(ProductWorkbookPreviewSchema, await workbooks.commit({ productId: productId ?? null, batchId }, requireActor(req)));
    });
    scope.get(`${base}/workbook-import-template`, async (req, reply) => {
      const bytes = await workbooks.template(parse(IdParams, req.params).id ?? null, requireActor(req));
      return reply.type(XLSX_MIME).header('content-disposition', 'attachment; filename="product-archive.xlsx"').send(Buffer.from(bytes));
    });
    scope.get(`${upload}/:batchId/images/:sha256`, async (req, reply) => {
      const { id: productId, batchId, sha256 } = parse(ImageParams, req.params);
      const image = await workbooks.image({ productId: productId ?? null, batchId, sha256 }, requireActor(req));
      return reply.type(image.mime).header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').send(Buffer.from(image.bytes));
    });
  });
}

async function readWorkbookUpload(req: FastifyRequest, maxBytes: number): Promise<{ readonly bytes: Buffer; readonly fileName: string }> {
  try {
    if (!req.isMultipart()) throw inputError();
    let upload: { readonly bytes: Buffer; readonly fileName: string } | undefined;
    for await (const part of req.parts({ limits: { fileSize: maxBytes, files: 1, parts: 2 } })) {
      if (part.type !== 'file' || part.fieldname !== 'file') throw inputError();
      upload = { bytes: await part.toBuffer(), fileName: part.filename };
    }
    if (upload === undefined) throw inputError();
    return upload;
  } catch (error) {
    throw uploadError(error);
  }
}

function inputError() {
  return new HttpError({ code: 'VALIDATION_FAILED', message: '请上传一个 Excel 文件，上传字段为 file' });
}

function uploadError(error: unknown): unknown {
  if (error instanceof Error && MULTIPART_SYNTAX.test(error.message)) return inputError();
  if (typeof error !== 'object' || error === null || !('code' in error)) return error;
  if (error.code === 'FST_REQ_FILE_TOO_LARGE') return new HttpError({ code: 'FILE_TOO_LARGE', message: '超过大小上限', details: { kind: 'import' } });
  if (error.code === 'FST_FILES_LIMIT' || error.code === 'FST_PARTS_LIMIT') return inputError();
  return error;
}
