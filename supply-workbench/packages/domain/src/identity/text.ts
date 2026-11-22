const PLACEHOLDER_TOKENS = new Set(['/', '-', '—', '／']);

/** 比较前：NFKC、去首尾空白、连续空白压成一个空格。不改大小写。原文另存。 */
export function normalizeText(input: string): string {
  return input.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/** 去空白后是空、`/`、`-`、`—`、`／`。这是未填写，不是解析失败。 */
export function isNotProvided(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed === '') return true;
  const folded = trimmed.normalize('NFKC');
  return PLACEHOLDER_TOKENS.has(trimmed) || PLACEHOLDER_TOKENS.has(folded);
}
