import multipart from '@fastify/multipart';
import { can } from '@sw/application';
import { DevelopmentWorkbookPreviewSchema, DevelopmentWorkbookScopeSchema } from '@sw/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { developmentWorkbookPreview } from '../../composition/product-development.js';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { HttpError } from '../plugins/errors.js';
import { wire } from '../wire.js';

const OVERHEAD = 1024 * 1024;
const MULTIPART_SYNTAX = /^(Multipart: Boundary not found|Unexpected end of multipart data|(?:Part|Header) terminated early due to unexpected end of multipart data)$/iu;

export function registerDevelopmentWorkbookPreview(app: FastifyInstance, path: string): void {
  const { maxBytes, preview } = developmentWorkbookPreview;
  app.register(async (scope) => {
    if (!scope.hasContentTypeParser('multipart/form-data')) await scope.register(multipart);
    scope.post(path, { bodyLimit: maxBytes + OVERHEAD }, async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      if (!can(requireActor(req), 'products.maintain')) {
        throw new HttpError({ code: 'FORBIDDEN', message: '角色不允许', details: { action: 'products.maintain' } });
      }
      const { store } = parse(DevelopmentWorkbookScopeSchema, req.query);
      return wire(DevelopmentWorkbookPreviewSchema, preview({ store, ...await readUpload(req, maxBytes) }));
    });
  });
}

async function readUpload(req: FastifyRequest, maxBytes: number): Promise<{ readonly bytes: Buffer; readonly fileName: string }> {
  try {
    if (!req.isMultipart()) throw inputError();
    let file: { readonly bytes: Buffer; readonly fileName: string } | undefined;
    for await (const part of req.parts({ limits: { fileSize: maxBytes, files: 1, parts: 2 } })) {
      if (part.type !== 'file' || part.fieldname !== 'file') throw inputError();
      file = { bytes: await part.toBuffer(), fileName: part.filename };
    }
    if (file === undefined) throw inputError();
    return file;
  } catch (error) {
    throw uploadError(error);
  }
}

function uploadError(error: unknown): unknown {
  if (error instanceof Error && MULTIPART_SYNTAX.test(error.message)) return inputError();
  if (typeof error !== 'object' || error === null || !('code' in error)) return error;
  if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
    return new HttpError({ code: 'FILE_TOO_LARGE', message: '超过大小上限', details: { kind: 'import' } });
  }
  if (error.code === 'FST_FILES_LIMIT' || error.code === 'FST_PARTS_LIMIT') return inputError();
  return error;
}

function inputError(): HttpError {
  return new HttpError({ code: 'VALIDATION_FAILED', message: '请上传一个 Excel 文件，上传字段为 file' });
}
