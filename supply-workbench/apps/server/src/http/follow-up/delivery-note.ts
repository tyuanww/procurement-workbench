import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { DeliveryNoteRequestSchema } from '@sw/contracts';
import { HttpError } from '../plugins/errors.js';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import type { FollowUpApi } from './api.js';
import { deliveryBatchIdOf } from './commands.js';
import { isRecord } from './records.js';

const OVERHEAD = 1024 * 1024;
const ALLOWED = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export function registerDeliveryNote({ app, api, attachmentMaxBytes }: { readonly app: FastifyInstance; readonly api: FollowUpApi; readonly attachmentMaxBytes: number }): void {
  app.register(async (scope) => {
    if (!scope.hasContentTypeParser('multipart/form-data')) await scope.register(multipart, { limits: { fileSize: attachmentMaxBytes } });
    scope.post('/api/v1/batches/:id/delivery-note', { bodyLimit: attachmentMaxBytes + OVERHEAD }, async (req) => saveNote({ api, req, attachmentMaxBytes }));
  });
}

async function saveNote({ api, req, attachmentMaxBytes }: { readonly api: FollowUpApi; readonly req: FastifyRequest; readonly attachmentMaxBytes: number }) {
  const actor = requireActor(req);
  const batchId = deliveryBatchIdOf(req);
  const input = await readNote(req, attachmentMaxBytes);
  const created = await api.deliveryNote({ batchId, ...input }, actor);
  const batch = await api.getBatch({ batchId }, actor);
  if (batch.deliveryNote === null || batch.deliveryNote.id !== created.deliveryNoteId) throw new HttpError({ code: 'NOT_FOUND', message: '送货单不存在', details: { entity: '送货单', id: created.deliveryNoteId } });
  return batch.deliveryNote;
}

async function readNote(req: FastifyRequest, attachmentMaxBytes: number) {
  const fields: Record<string, string> = {};
  let file: { readonly bytes: Uint8Array; readonly fileName: string; readonly mime: string } | undefined;
  try {
    for await (const part of req.parts()) {
      if (part.type === 'file') file = await fileOf(part);
      else if (typeof part.value === 'string') fields[part.fieldname] = part.value;
    }
  } catch (error) {
    if (isTooLarge(error)) throw new HttpError({ code: 'FILE_TOO_LARGE', message: '超过大小上限', details: { kind: 'attachment' } });
    throw error;
  }
  if (file !== undefined) assertFile(file, attachmentMaxBytes);
  const parsed = parse(DeliveryNoteRequestSchema, fields);
  return file === undefined ? parsed : { ...parsed, file };
}

async function fileOf(part: { readonly filename: string; readonly mimetype: string; toBuffer(): Promise<Buffer> }) {
  return { bytes: await part.toBuffer(), fileName: part.filename, mime: part.mimetype };
}

function assertFile(file: { readonly bytes: Uint8Array; readonly fileName: string; readonly mime: string }, attachmentMaxBytes: number): void {
  const ext = file.fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED.has(ext) || !MIME.has(file.mime)) throw new HttpError({ code: 'FILE_TYPE_NOT_ALLOWED', message: '文件类型不允许' });
  if (file.bytes.byteLength > attachmentMaxBytes) throw new HttpError({ code: 'FILE_TOO_LARGE', message: '超过大小上限', details: { kind: 'attachment' } });
}

function isTooLarge(error: unknown): boolean {
  return isRecord(error) && error.code === 'FST_REQ_FILE_TOO_LARGE';
}
