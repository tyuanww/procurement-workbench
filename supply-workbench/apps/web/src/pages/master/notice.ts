import { ApiError } from '../../shared/api/client.js';

export type TabNotice = {
  readonly kind: 'success' | 'info' | 'error';
  readonly text: string;
};

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'FORBIDDEN';
}
