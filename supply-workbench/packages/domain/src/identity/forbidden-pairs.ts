import { DomainRuleViolation } from '../errors.js';
import { normalizeText } from './text.js';

const GROUPS: readonly (readonly string[])[] = [
  ['甲包装厂', '甲代工厂'],
  ['乙包材厂', '乙加工厂'],
  ['丙代工厂', '丙包装厂', '丙加工厂'],
];

const UNSUGGESTED = ['丁印刷厂'];

export function isForbiddenPair(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === '' || b === '' || a === b) return false;
  return GROUPS.some((group) => has(group, a) && has(group, b));
}

export function isUnsuggestedName(name: string): boolean {
  const normalized = normalizeText(name);
  return UNSUGGESTED.some((item) => item === normalized);
}

export function confirmNameMerge({ left, right, confirmed }: { readonly left: string; readonly right: string; readonly confirmed: boolean }): void {
  if (!isForbiddenPair(left, right) || confirmed) return;
  throw new DomainRuleViolation({ code: 'FORBIDDEN_PAIR_CONFIRM_REQUIRED', message: '这两个名字属于禁止合并组合，需要二次确认', details: {
    left: normalizeText(left),
    right: normalizeText(right),
  } });
}

function has(group: readonly string[], name: string): boolean {
  return group.some((item) => item === name);
}
