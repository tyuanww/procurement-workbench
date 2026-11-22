import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

export const PRINT_TOKEN_SECONDS = TOKEN_MINUTES * SECONDS_PER_MINUTE;

export function signPrintToken(input: { readonly reportId: string; readonly secret: string; readonly exp: number }): string {
  const payload = `${input.reportId}.${input.exp}`;
  return `${payload}.${sign(payload, input.secret)}`;
}

export function verifyPrintToken(input: { readonly token: string; readonly reportId: string; readonly secret: string; readonly nowMs: number }): boolean {
  const [id, expText, sig] = input.token.split('.');
  if (id !== input.reportId || expText === undefined || sig === undefined) return false;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * MS_PER_SECOND <= input.nowMs) return false;
  return same(sig, sign(`${id}.${expText}`, input.secret));
}

export function printExpiry(nowIso: string): number {
  return Math.floor(Date.parse(nowIso) / MS_PER_SECOND) + PRINT_TOKEN_SECONDS;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function same(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
