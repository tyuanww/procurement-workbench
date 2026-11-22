import type { ErrorCode } from '@sw/domain';
import { z } from 'zod';
import { ErrorCodeSchema } from './enums.js';

/** 05 第 2 节。领域规则码不在这张表里，由错误插件另接。 */
export const errorHttpStatus = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  UNDO_WINDOW_EXPIRED: 409,
  UNDO_NOT_OWNER: 409,
  FIELD_OWNED_BY_IMPORT: 409,
  DATE_CHANGE_REASON_REQUIRED: 400,
  BATCH_HAS_RECORDS: 409,
  IMPORT_TEMPLATE_UNKNOWN: 400,
  IMPORT_FACTORY_REQUIRED: 400,
  IMPORT_NOT_PARSED: 409,
  IMPORT_HAS_CONFLICTS: 409,
  FORBIDDEN_PAIR_CONFIRM_REQUIRED: 409,
  FEISHU_NOT_CONFIGURED: 409,
  FILE_TOO_LARGE: 413,
  FILE_TYPE_NOT_ALLOWED: 415,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

export { ErrorCodeSchema };

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
