import { ERROR_CODE_LABELS, type ErrorCode } from '@sw/domain';
import { errorText } from './errors.js';
import { noteWrite } from './invalidate.js';

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, details: unknown = null) {
    super(errorText(code));
    this.code = code;
    this.details = details;
  }
}

export function apiErrorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return undefined;
}

export async function apiGet<T>(path: string, schema: Schema<T>): Promise<T> {
  return apiGetWithSignal({ path, schema });
}

export async function apiGetWithSignal<T>(input: { readonly path: string; readonly schema: Schema<T>; readonly signal?: AbortSignal }): Promise<T> {
  const response = await fetch(input.path, { credentials: 'include', ...(input.signal === undefined ? {} : { signal: input.signal }) });
  return readBody(response, input.schema);
}

export async function apiSend<T>(input: {
  readonly path: string;
  readonly method: 'POST' | 'PUT' | 'PATCH';
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly schema: Schema<T>;
}): Promise<T> {
  const response = await fetch(input.path, {
    method: input.method,
    credentials: 'include',
    ...jsonInit(input.body, input.headers),
  });
  const body = await readBody(response, input.schema);
  noteWrite({ method: input.method, path: input.path });
  return body;
}

export async function apiUpload<T>(input: {
  readonly path: string;
  readonly body: FormData;
  readonly schema: Schema<T>;
}): Promise<T> {
  const response = await fetch(input.path, {
    method: 'POST',
    credentials: 'include',
    body: input.body,
  });
  const body = await readBody(response, input.schema);
  noteWrite({ method: 'POST', path: input.path });
  return body;
}

export async function apiPostEmpty(input: { readonly path: string }): Promise<void> {
  const response = await fetch(input.path, { method: 'POST', credentials: 'include' });
  await readEmpty(response);
  noteWrite({ method: 'POST', path: input.path });
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(path, { method: 'DELETE', credentials: 'include' });
  await readEmpty(response);
  noteWrite({ method: 'DELETE', path });
}

async function readEmpty(response: Response): Promise<void> {
  if (response.status === 204) return;
  throw failure(await response.json());
}

export async function apiDownload({ path, fileName, body }: { readonly path: string; readonly fileName: string; readonly body?: unknown }): Promise<void> {
  const request = body === undefined ? {} : { method: 'POST', ...jsonInit(body, undefined) };
  const response = await fetch(path, { credentials: 'include', ...request });
  if (!response.ok) throw new ApiError('INTERNAL');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function asArray<T>(item: Schema<T>): Schema<readonly T[]> {
  return {
    safeParse(value: unknown) {
      if (!Array.isArray(value)) return { success: false };
      const data: T[] = [];
      for (const entry of value) {
        const parsed = item.safeParse(entry);
        if (!parsed.success) return { success: false };
        data.push(parsed.data);
      }
      return { success: true, data };
    },
  };
}

function jsonInit(
  body: unknown,
  headers: Readonly<Record<string, string>> | undefined,
):
  | { readonly headers: Readonly<Record<string, string>>; readonly body: string }
  | undefined {
  if (body === undefined) return undefined;
  return { headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) };
}

async function readBody<T>(response: Response, schema: Schema<T>): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) throw failure(body);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('INTERNAL');
  return parsed.data;
}

function failure(body: unknown): ApiError {
  return new ApiError(codeOf(body), detailsOf(body));
}

function detailsOf(body: unknown): unknown {
  if (!isRecord(body) || !isRecord(body.error) || !('details' in body.error)) return null;
  return body.error.details;
}

function codeOf(body: unknown): ErrorCode {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== 'string')
    return 'INTERNAL';
  if (isErrorCode(body.error.code)) return body.error.code;
  return 'INTERNAL';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODE_LABELS, value);
}
