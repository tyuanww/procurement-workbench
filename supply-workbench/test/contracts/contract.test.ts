import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ERROR_CODES } from '../../packages/domain/src/vocabulary/index.js';
import { errorHttpStatus, OrderLineRowSchema, StartImportRequestSchema, UpdateBatchRequestSchema } from '../../packages/contracts/src/index.js';
import { expect, expectTypeOf, it } from 'vitest';
import { contractExportNames } from './contract-exports.js';
import type { OrderLineRow } from '../../packages/application/src/follow-up/boundary.js';

const httpStatus = {
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
} as const;

it('每个错误码都有 05 第 2 节的 HTTP 状态', () => {
  expect(Object.keys(errorHttpStatus).sort()).toEqual([...ERROR_CODES].sort());
  expect(errorHttpStatus).toEqual(httpStatus);
});

it('UpdateBatchRequest 带了 status 就校验失败', () => {
  const parsed = UpdateBatchRequestSchema.safeParse({ plannedQty: 1, status: 'closed' });
  expect(parsed.success).toBe(false);
});

it('UpdateBatchRequest 只接受 05 列出的字段', () => {
  expect(UpdateBatchRequestSchema.safeParse({ plannedQty: 2 }).success).toBe(true);
});

it('coverage 不能由 HTTP 客户端伪造', () => {
  expect(StartImportRequestSchema.safeParse({ fileId: 'file-1', template: 'po-master-v1', coverage: 'partial' }).success).toBe(false);
});

it('读模型多一个字段时，现有 schema 不能再当成那个类型', () => {
  type Output = ReturnType<typeof OrderLineRowSchema.parse>;
  expectTypeOf<Output>().toEqualTypeOf<OrderLineRow>();
  // @ts-expect-error 读模型没有 surplus，schema 输出也不能有
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type _Surplus = Output['surplus'];
});


it('合同包导出和 05 第 5 节的名字一致', () => {
  const source = readFileSync(path.resolve(import.meta.dirname, '../../packages/contracts/src/index.ts'), 'utf8');
  const declared = [...source.matchAll(/export (?:type )?\{([^}]+)\} from/g)]
    .flatMap((match) => match[1]?.split(',') ?? [])
    .map((item) => item.trim().split(' as ')[0]?.replace(/^type /, '') ?? '')
    .filter((item) => item.length > 0);
  expect(declared.sort()).toEqual([...contractExportNames].sort());
});
