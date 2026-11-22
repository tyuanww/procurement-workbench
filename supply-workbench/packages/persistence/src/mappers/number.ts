export function numberOrNull(value: string | null): number | null {
  if (value === null) return null;
  return Number(value);
}

export function numberToDb(value: number | null): string | null {
  if (value === null) return null;
  return String(value);
}
