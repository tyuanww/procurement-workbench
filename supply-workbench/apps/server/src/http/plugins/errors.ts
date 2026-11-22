import { errorHttpStatus } from '@sw/contracts';

type Coded = { readonly code: string; readonly message: string; readonly details: Record<string, unknown> };

export class HttpError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor({ code, message, details = {} }: { readonly code: string; readonly message: string; readonly details?: Record<string, unknown> | undefined }) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function errorBody(error: unknown): { readonly status: number; readonly body: { error: Coded } } {
  const coded = codedOf(error);
  return { status: statusOf(coded.code), body: { error: coded } };
}

function codedOf(error: unknown): Coded {
  if (isCoded(error)) return { code: error.code, message: error.message, details: detailsOf(error) };
  return { code: 'INTERNAL', message: '内部错误', details: {} };
}

function detailsOf(error: { details?: unknown }): Record<string, unknown> {
  if (typeof error.details !== 'object' || error.details === null || Array.isArray(error.details)) return {};
  return Object.fromEntries(Object.entries(error.details));
}
function isCoded(error: unknown): error is { code: string; message: string; details?: unknown } {
  if (typeof error !== 'object' || error === null || !('code' in error) || !('message' in error)) return false;
  return typeof error.code === 'string' && typeof error.message === 'string';
}

function statusOf(code: string): number {
  for (const [key, status] of Object.entries(errorHttpStatus)) {
    if (key === code) return status;
  }
  return errorHttpStatus.INTERNAL;
}
