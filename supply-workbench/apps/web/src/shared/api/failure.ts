import type { ErrorCode } from '@sw/domain';
import { ApiError } from './client.js';
import { ReadCancelled } from './flights.js';

export type ReadFailure =
  | { readonly kind: 'api'; readonly code: ErrorCode; readonly text: string }
  | { readonly kind: 'network' }
  | { readonly kind: 'malformed' };

export class ReadError extends Error {
  readonly failure: ReadFailure;

  constructor(failure: ReadFailure) {
    super(failureText(failure));
    this.name = 'ReadError';
    this.failure = failure;
  }
}

export function failureText(failure: ReadFailure): string {
  if (failure.kind === 'api') return joinRetry(failure.text);
  if (failure.kind === 'network') return '网络没有连上。检查登录或网络后重试。';
  return '响应无法解析。检查登录或网络后重试。';
}

export function readFailureOf(error: unknown): ReadFailure | null {
  if (error instanceof ReadCancelled || isAbort(error)) return null;
  if (error instanceof ReadError) return error.failure;
  if (error instanceof ApiError) return { kind: 'api', code: error.code, text: error.message };
  if (error instanceof SyntaxError) return { kind: 'malformed' };
  return { kind: 'network' };
}

export function throwRead(error: unknown): never {
  if (error instanceof ReadCancelled || isAbort(error) || error instanceof ReadError) throw error;
  const failure = readFailureOf(error);
  if (failure === null) throw error;
  throw new ReadError(failure);
}

function joinRetry(label: string): string {
  const sentence = label.endsWith('。') ? label : `${label}。`;
  return `${sentence}检查登录或网络后重试。`;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
