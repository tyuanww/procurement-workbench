export function instant(value: string): string {
  return new Date(value).toISOString();
}

export function instantOrNull(value: string | null): string | null {
  return value === null ? null : instant(value);
}
