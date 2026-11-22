import type { ImportIssue } from '@sw/domain';
import type { ParsedRow } from '../../../../../application/src/ports/parsed-rows.js';

/** I04 替换调用方。占位不报问题码，避免把还没解析的表说成不导入。 */
export function placeholder<T>(): { readonly rows: readonly ParsedRow<T>[]; readonly issues: readonly ImportIssue[] } {
  return { rows: [], issues: [] };
}
