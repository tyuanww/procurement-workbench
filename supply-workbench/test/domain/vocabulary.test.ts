import { expect, it } from 'vitest';
import {
  BATCH_STATUSES,
  BATCH_STATUS_LABELS,
  DOMAIN_RULE_CODES,
  ERROR_CODES,
  ISSUE_CATALOG,
  ISSUE_CODES,
  LANES,
  MISSING_REASONS,
  PERMISSION_ACTIONS,
  PO_FORMATS,
  PRODUCT_CONTACT_ROLES,
  ROLES,
  TIMELINE_KINDS,
  TODO_REASONS,
  batchStatusLabel,
  timelineKindLabel,
} from '../../packages/domain/src/vocabulary/index.js';
import { importCoverageOf, latestImportPresenceOf, missingFlagOf } from '../../packages/domain/src/index.js';

it('角色、线和单号格式与文档表格一致', () => {
  expect([...ROLES]).toEqual(['buyer', 'reviewer', 'manager', 'lead', 'admin']);
  expect([...LANES]).toEqual(['finished', 'material']);
  expect([...PO_FORMATS]).toEqual([
    'PO14',
    'PO10',
    'P0_10',
    'P0_14',
    'HZSY',
    'SY',
    'PUR3500',
    'PUR3505',
    'NONE',
    'OTHER',
  ]);
});

it('导入 presence 不把 partial 的 unknown 当成 missing', () => {
  expect(latestImportPresenceOf({ value: 'unknown' })).toBe('unknown');
  expect(missingFlagOf('unknown')).toBe(false);
  expect(latestImportPresenceOf({ value: undefined, legacyMissing: true, origin: 'manual' })).toBe('not_applicable');
  expect(importCoverageOf(undefined)).toBe('full_snapshot');
  expect(() => importCoverageOf('invalid')).toThrow(/覆盖范围/);
  expect(() => latestImportPresenceOf({ value: 'invalid' })).toThrow(/存在性/);
});

it('批次状态和待办原因与文档表格一致', () => {
  expect([...BATCH_STATUSES]).toEqual([
    'awaiting_date',
    'confirmed',
    'shipped',
    'partially_received',
    'received',
    'closed',
    'cancelled',
  ]);
  expect([...TODO_REASONS]).toEqual([
    'overdue',
    'demand_before_confirmed',
    'due_today',
    'missing_date',
    'shipped_not_received',
    'note_missing',
    'upcoming',
    'unshipped',
    'fulfillment_review',
    'exception_open',
    'review_pending',
    'import_pending',
    'unassigned',
  ]);
  expect(batchStatusLabel('awaiting_date')).toBe('待确认日期');
  expect(BATCH_STATUS_LABELS.received).toBe('已收货');
});

it('权限动作、缺失原因、领域错误码与文档一致', () => {
  expect([...PERMISSION_ACTIONS]).toEqual([
    'dashboard.read',
    'reports.read',
    'data.read',
    'imports.read',
    'master.read',
    'products.read',
    'plan.read',
    'today.read',
    'search.read',
    'session.read',
    'lines.write',
    'records.write',
    'imports.write',
    'master.review',
    'products.maintain',
    'reports.generate',
    'reports.export',
    'admin',
  ]);
  expect([...MISSING_REASONS]).toEqual([
    'not_provided',
    'unparseable',
    'no_matching_record',
    'not_applicable',
    'no_source',
  ]);
  expect([...DOMAIN_RULE_CODES]).toEqual([
    'STATE_CONFLICT',
    'DATE_CHANGE_REASON_REQUIRED',
    'FIELD_OWNED_BY_IMPORT',
    'BATCH_HAS_RECORDS',
    'UNDO_WINDOW_EXPIRED',
    'UNDO_NOT_OWNER',
    'FORBIDDEN_PAIR_CONFIRM_REQUIRED',
  ]);
  for (const code of DOMAIN_RULE_CODES) expect(ERROR_CODES).toContain(code);
});

it('环节联系人六个职责与文档一致', () => {
  expect([...PRODUCT_CONTACT_ROLES]).toEqual([
    'product_info',
    'packaging',
    'purchasing',
    'production_coord',
    'quality',
    'warehouse',
  ]);
});

it('问题码目录的代码和级别与 03 第 3.6 节一致', () => {
  expect(ISSUE_CATALOG.map((item) => [item.code, item.severity])).toEqual(ISSUE_TABLE);
  expect(ISSUE_CODES).toEqual(ISSUE_TABLE.map(([code]) => code));
});

it('每个枚举值都有中文名', () => {
  for (const item of ISSUE_CATALOG) expect(item.label.length).toBeGreaterThan(0);
  for (const status of BATCH_STATUSES) expect(batchStatusLabel(status).length).toBeGreaterThan(0);
  for (const kind of TIMELINE_KINDS) expect(timelineKindLabel(kind).length).toBeGreaterThan(0);
});

const ISSUE_TABLE: readonly (readonly [string, string])[] = [
  ['HEADER_NOT_FOUND', 'error'],
  ['SHEET_IGNORED', 'info'],
  ['ROW_REPEATED_HEADER', 'info'],
  ['ROW_EMPTY_LIKE', 'info'],
  ['ROW_NO_IDENTITY', 'error'],
  ['OWNER_NAME_MISSING', 'error'],
  ['DATE_NO_YEAR', 'warning'],
  ['DATE_TEXT', 'warning'],
  ['DATE_INVALID', 'warning'],
  ['DATE_OUT_OF_RANGE', 'warning'],
  ['QTY_TEXT', 'warning'],
  ['QTY_WAN', 'info'],
  ['QTY_THOUSANDS_SEP', 'info'],
  ['FORMULA_ERROR', 'warning'],
  ['FORMULA_VALUE', 'info'],
  ['DERIVED_ZERO_NO_SOURCE', 'warning'],
  ['DERIVED_NEGATIVE', 'info'],
  ['MERGED_FILL', 'info'],
  ['CONTEXT_INHERITED', 'info'],
  ['PO_PLACEHOLDER', 'warning'],
  ['PO_MULTI', 'warning'],
  ['PO_EXTRA_TEXT', 'warning'],
  ['PO_P0_PREFIX', 'warning'],
  ['PO_UNKNOWN_FORMAT', 'warning'],
  ['BARCODE_SUFFIX', 'info'],
  ['BARCODE_LENGTH', 'warning'],
  ['CODE_CASE', 'info'],
  ['CODE_UNKNOWN_PATTERN', 'warning'],
  ['STATUS_UNKNOWN', 'warning'],
  ['PARTY_PENDING', 'info'],
  ['CODE_PENDING', 'info'],
  ['KEY_DUPLICATE_IN_FILE', 'warning'],
  ['KEY_AMBIGUOUS_EXISTING', 'conflict'],
  ['FACTORY_MISMATCH', 'warning'],
  ['PRODUCT_FIELD_KEPT', 'info'],
  ['ARRIVAL_BATCH_ID_MISSING', 'error'],
  ['ARRIVAL_BATCH_NOT_FOUND', 'error'],
  ['ARRIVAL_BATCH_NOT_EDITABLE', 'error'],
  ['ARRIVAL_EXPORTED_DATE_INVALID', 'error'],
  ['ARRIVAL_EXPORTED_RECEIVER_MISSING', 'error'],
  ['ARRIVAL_BATCH_RECEIVER_CHANGED', 'conflict'],
  ['ARRIVAL_EXPORTED_BATCH_IDENTITY_MISSING', 'error'],
  ['ARRIVAL_BATCH_IDENTITY_CHANGED', 'conflict'],
  ['ARRIVAL_CONFIRM_DATE_CHANGED', 'conflict'],
  ['ARRIVAL_CONFIRM_DATE_REASON_MISSING', 'error'],
  ['ARRIVAL_CONFIRM_DATE_DUPLICATE', 'conflict'],
];
