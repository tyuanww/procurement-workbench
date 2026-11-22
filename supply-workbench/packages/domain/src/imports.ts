import type { ImportStatus } from './vocabulary/imports.js';

export const FACTORY_SOURCE_POLICIES = {
  shipment: 'snapshot',
  in_transit: 'snapshot',
  stock: 'snapshot',
  schedule: 'snapshot',
  demand: 'snapshot',
  packaging_combo: 'snapshot',
  customer_supplied: 'snapshot',
} as const;
export type FactorySourcePolicy = (typeof FACTORY_SOURCE_POLICIES)[keyof typeof FACTORY_SOURCE_POLICIES];

export type FactorySnapshotSource = {
  readonly sourceKey: string;
  readonly fingerprint: string;
  readonly effectiveAt: string;
  readonly supersededAt: string | null;
};

export type ImportCoverageAttestation = {
  readonly attestationId: string;
  readonly template: string;
  readonly factoryPartyId: string | null;
  readonly sourceKey: string | null;
  readonly coverage: ImportCoverage;
  readonly payloadSha256: string;
  readonly issuer: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
};

export function factorySourceKey(factoryPartyId: string): string {
  return `factory-progress-v1:${factoryPartyId}`;
}

/** 导入分区键只由模板和受信主体决定，不能由浏览器请求自定义。 */
export function importSourceKey(input: { readonly template: string; readonly factoryPartyId: string | null }): string | null {
  if (input.template === 'factory-progress-v1' && input.factoryPartyId !== null) return factorySourceKey(input.factoryPartyId);
  return null;
}

/**
 * 导入文件覆盖范围。
 *
 * partial 只代表本批出现的行，不足以推断未出现的行已消失。
 */
export const IMPORT_COVERAGES = ['full_snapshot', 'partial'] as const;
export type ImportCoverage = (typeof IMPORT_COVERAGES)[number];

export function importCoverageOf(value: unknown): ImportCoverage {
  if (value === undefined || value === null) return 'full_snapshot';
  if (value === 'full_snapshot' || value === 'partial') return value;
  throw new Error(`认不出的导入覆盖范围: ${String(value)}`);
}

export const LATEST_IMPORT_PRESENCES = ['present', 'missing', 'unknown', 'not_applicable'] as const;
export type LatestImportPresence = (typeof LATEST_IMPORT_PRESENCES)[number];

export function latestImportPresenceOf(input: { readonly value: unknown; readonly legacyMissing?: boolean; readonly origin?: string }): LatestImportPresence {
  if (isLatestImportPresence(input.value)) return input.value;
  if (hasValue(input.value)) throw new Error(`认不出的最新导入存在性: ${String(input.value)}`);
  if (input.origin !== undefined && input.origin !== 'import_po_master') return 'not_applicable';
  return input.legacyMissing === true ? 'missing' : 'present';
}

function isLatestImportPresence(value: unknown): value is LatestImportPresence {
  return value === 'present' || value === 'missing' || value === 'unknown' || value === 'not_applicable';
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function missingFlagOf(presence: LatestImportPresence): boolean {
  return presence === 'missing';
}

export type ImportCommand = 'decide' | 'commit' | 'discard';

export const IMPORT_TRANSITIONS = {
  parsed: { decide: 'parsed', commit: 'committed', discard: 'discarded' },
  committed: {},
  discarded: {},
  failed: {},
} as const satisfies Record<ImportStatus, Partial<Record<ImportCommand, ImportStatus>>>;

export function canTransitionImport(status: ImportStatus, command: ImportCommand): boolean {
  return nextStatus(status, command) !== undefined;
}

export function transitionImport(status: ImportStatus, command: ImportCommand): ImportStatus {
  const next = nextStatus(status, command);
  if (next === undefined) throw new Error(`导入批次 ${status} 不能执行 ${command}`);
  return next;
}

function nextStatus(status: ImportStatus, command: ImportCommand): ImportStatus | undefined {
  const transitions: Partial<Record<ImportCommand, ImportStatus>> = IMPORT_TRANSITIONS[status];
  return transitions[command];
}

export const UNLINKED_PROCUREMENT = 'unlinked';
