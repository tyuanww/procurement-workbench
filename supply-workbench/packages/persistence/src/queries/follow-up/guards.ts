import { roundQuantity } from '@sw/domain';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function oneOf<T extends string>(values: readonly T[], value: string): T {
  for (const item of values) if (item === value) return item;
  throw new Error(`未知枚举 ${value}`);
}

export function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function sumPresent(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return roundQuantity(present.reduce((total, value) => total + value, 0));
}
