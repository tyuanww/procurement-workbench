import type { PoMasterPayload } from '../ports/parsed-rows.js';
import { sha256Hex } from './sha256.js';

export function samePoMasterPayload(left: PoMasterPayload, right: PoMasterPayload): boolean {
  return sameValue(left, right);
}

export function poMasterPayloadDigest(payload: PoMasterPayload): Promise<string> {
  const serialized = JSON.stringify(payload, (_key, field: unknown) => (
    isRecord(field) ? Object.fromEntries(Object.keys(field).sort().map((key) => [key, field[key]])) : field
  ));
  return sha256Hex(new TextEncoder().encode(serialized));
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return sameList(left, right);
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

function sameList(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => sameValue(item, right[index]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
