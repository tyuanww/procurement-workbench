export const MISSING = '—';

export function missingGlyph(value: string | null): string {
  if (value === null) return MISSING;
  const trimmed = value.trim();
  if (trimmed === '') return MISSING;
  return trimmed;
}
