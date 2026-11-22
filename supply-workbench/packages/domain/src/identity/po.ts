// 位数是单号格式本身，不是可调的业务阈值。

import type { PoFormat } from '../vocabulary/identity.js';
import { cellIssue } from './issue.js';
import { parsedCell, type CellParse } from './parsed.js';
import { isNotProvided } from './text.js';

export type PoCell = {
  readonly poNorm: string | null;
  readonly poFormat: PoFormat;
  /** 其余单号按原文切片保留。主单号的匹配用 poNorm。 */
  readonly relatedPoRaws: readonly string[];
  readonly extraText: string | null;
};

type PoRule = { readonly format: PoFormat; readonly pattern: RegExp };

type Mapped = { readonly text: string; readonly origins: readonly number[] };

type PoHit = {
  readonly format: PoFormat;
  readonly start: number;
  readonly end: number;
  readonly norm: string;
};

const PO_RULES: readonly PoRule[] = [
  { format: 'PO14', pattern: /^PO\d{14}/ },
  { format: 'PO10', pattern: /^PO\d{10}/ },
  { format: 'P0_14', pattern: /^P0\d{14}/ },
  { format: 'P0_10', pattern: /^P0\d{10}/ },
  { format: 'HZSY', pattern: /^HZSY-\d{8}/ },
  { format: 'SY', pattern: /^SY-\d{8}/ },
  { format: 'PUR3500', pattern: /^3500-\d{12}/ },
  { format: 'PUR3505', pattern: /^3505-\d{12}/ },
];

const EMPTY_PO: PoCell = { poNorm: null, poFormat: 'NONE', relatedPoRaws: [], extraText: null };

export function parsePoCell(raw: string): CellParse<PoCell> {
  if (raw.trim() === '') return parsedCell({ value: EMPTY_PO, raw, issues: [], missingReason: 'not_provided' });
  if (isPoPlaceholder(raw)) return parsedCell({ value: EMPTY_PO, raw, issues: [cellIssue({ code: 'PO_PLACEHOLDER', raw })], missingReason: 'not_provided' });
  const mapped = normalizePo(raw);
  const hits = findPos(mapped.text);
  const primary = hits[0];
  if (primary === undefined) return unknownPo(raw, mapped.text);
  return recognized({ raw, mapped, hits, primary });
}

export function recognizedPoNumbers(raw: string): readonly string[] {
  return findPos(normalizePo(raw).text).map((hit) => hit.norm);
}

function isPoPlaceholder(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  if (trimmed === '不下单' || trimmed.normalize('NFKC') === '不下单') return true;
  return isNotProvided(trimmed);
}

function unknownPo(raw: string, norm: string): CellParse<PoCell> {
  return parsedCell({
    value: { poNorm: norm, poFormat: 'OTHER', relatedPoRaws: [], extraText: null },
    raw,
    issues: [cellIssue({ code: 'PO_UNKNOWN_FORMAT', raw })],
  });
}

function recognized(input: {
  readonly raw: string;
  readonly mapped: Mapped;
  readonly hits: readonly PoHit[];
  readonly primary: PoHit;
}): CellParse<PoCell> {
  const extraText = leftover({ raw: input.raw, mapped: input.mapped, hits: input.hits });
  return parsedCell({
    raw: input.raw,
    value: {
      poNorm: input.primary.norm,
      poFormat: input.primary.format,
      relatedPoRaws: input.hits.slice(1).map((hit) => originalSlice({ raw: input.raw, mapped: input.mapped, hit })),
      extraText,
    },
    issues: poIssues({ raw: input.raw, mapped: input.mapped, hits: input.hits, extraText }),
  });
}

function poIssues(input: {
  readonly raw: string;
  readonly mapped: Mapped;
  readonly hits: readonly PoHit[];
  readonly extraText: string | null;
}): ImportIssueList {
  const issues: ImportIssueList = [];
  if (input.hits.length > 1) issues.push(cellIssue({ code: 'PO_MULTI', raw: input.raw }));
  if (input.extraText !== null) issues.push(cellIssue({ code: 'PO_EXTRA_TEXT', raw: input.extraText }));
  for (const hit of input.hits) {
    if (isP0(hit.format)) issues.push(cellIssue({ code: 'PO_P0_PREFIX', raw: originalSlice({ raw: input.raw, mapped: input.mapped, hit }) }));
  }
  return issues;
}

type ImportIssueList = ReturnType<typeof cellIssue>[];

function isP0(format: PoFormat): boolean {
  return format === 'P0_10' || format === 'P0_14';
}

function findPos(text: string): PoHit[] {
  const hits: PoHit[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const hit = matchAt(text, cursor);
    if (hit === null || hit.end <= cursor) {
      cursor += 1;
      continue;
    }
    hits.push(hit);
    cursor = hit.end;
  }
  return hits;
}

function matchAt(text: string, cursor: number): PoHit | null {
  const rest = text.slice(cursor);
  for (const rule of PO_RULES) {
    const token = rule.pattern.exec(rest)?.[0];
    if (token === undefined) continue;
    return { format: rule.format, start: cursor, end: cursor + token.length, norm: token };
  }
  return null;
}

function leftover({ raw, mapped, hits }: { readonly raw: string; readonly mapped: Mapped; readonly hits: readonly PoHit[] }): string | null {
  const covered = coveredIndexes(hits);
  let text = '';
  const seen = new Set<number>();
  for (let index = 0; index < mapped.text.length; index += 1) {
    if (covered.has(index)) continue;
    const origin = mapped.origins[index];
    if (origin === undefined || seen.has(origin)) continue;
    seen.add(origin);
    text += raw[origin] ?? '';
  }
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

function coveredIndexes(hits: readonly PoHit[]): Set<number> {
  const covered = new Set<number>();
  for (const hit of hits) {
    for (let index = hit.start; index < hit.end; index += 1) covered.add(index);
  }
  return covered;
}

function originalSlice({ raw, mapped, hit }: { readonly raw: string; readonly mapped: Mapped; readonly hit: PoHit }): string {
  const start = mapped.origins[hit.start];
  const end = mapped.origins[hit.end - 1];
  if (start === undefined || end === undefined) return hit.norm;
  return raw.slice(start, end + 1);
}

function normalizePo(raw: string): Mapped {
  return uppercase(stripSpace(nfkcMap(raw)));
}

function nfkcMap(raw: string): Mapped {
  let text = '';
  const origins: number[] = [];
  let index = 0;
  for (const ch of raw) {
    for (const out of ch.normalize('NFKC')) {
      text += out;
      origins.push(index);
    }
    index += ch.length;
  }
  return { text, origins };
}

function stripSpace(mapped: Mapped): Mapped {
  let text = '';
  const origins: number[] = [];
  for (let index = 0; index < mapped.text.length; index += 1) {
    const ch = mapped.text[index];
    const origin = mapped.origins[index];
    if (ch === undefined || origin === undefined || /\s/u.test(ch)) continue;
    text += ch;
    origins.push(origin);
  }
  return { text, origins };
}

function uppercase(mapped: Mapped): Mapped {
  let text = '';
  const origins: number[] = [];
  for (let index = 0; index < mapped.text.length; index += 1) {
    const ch = mapped.text[index];
    const origin = mapped.origins[index];
    if (ch === undefined || origin === undefined) continue;
    for (const upper of ch.toUpperCase()) {
      text += upper;
      origins.push(origin);
    }
  }
  return { text, origins };
}
