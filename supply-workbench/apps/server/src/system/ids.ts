import { parseDeliveryBatchId, parseEntityId, parseOrderLineId, parseProductId, type EntityId } from '@sw/domain';

const BYTE_LENGTH = 16;
const TIME_BYTES = 6;
const HEX = 16;
const HEX_PAD = 2;
const BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;
const RAND_A_MAX = 0xfff;
const VERSION = 0x70;
const VARIANT = 0x80;
const VARIANT_MASK = 0x3f;
const RAND_A_HIGH_MASK = 0x0f;
const BYTE_RAND_HIGH = 6;
const BYTE_RAND_LOW = 7;
const BYTE_VARIANT = 8;
const UUID_TIME_LOW = 8;
const UUID_TIME_MID = 12;
const UUID_TIME_HIGH = 16;
const UUID_CLOCK = 20;

let lastMs = -1;
let counter = 0;

export function systemIds() {
  return {
    next: () => taken(parseEntityId(uuidV7())),
    orderLine: () => taken(parseOrderLineId(uuidV7())),
    product: () => taken(parseProductId(uuidV7())),
    deliveryBatch: () => taken(parseDeliveryBatchId(uuidV7())),
  };
}

function taken<Id extends EntityId>(parsed: { readonly ok: true; readonly value: Id } | { readonly ok: false; readonly reason: 'empty' }): Id {
  if (!parsed.ok) throw new Error('uuid 为空');
  return parsed.value;
}

function uuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BYTE_LENGTH));
  writeTime(bytes, stamp(bytes));
  writeCounter(bytes);
  bytes[BYTE_VARIANT] = ((bytes[BYTE_VARIANT] ?? 0) & VARIANT_MASK) | VARIANT;
  return formatUuid(bytes);
}

function stamp(bytes: Uint8Array): number {
  const now = Date.now();
  if (now > lastMs) {
    lastMs = now;
    counter = readCounter(bytes);
    return lastMs;
  }
  return advance();
}

function advance(): number {
  counter += 1;
  if (counter > RAND_A_MAX) {
    lastMs += 1;
    counter = 0;
  }
  return lastMs;
}

function readCounter(bytes: Uint8Array): number {
  return (((bytes[BYTE_RAND_HIGH] ?? 0) << BYTE_SHIFT) | (bytes[BYTE_RAND_LOW] ?? 0)) & RAND_A_MAX;
}

function writeCounter(bytes: Uint8Array): void {
  bytes[BYTE_RAND_HIGH] = VERSION | ((counter >> BYTE_SHIFT) & RAND_A_HIGH_MASK);
  bytes[BYTE_RAND_LOW] = counter & BYTE_MASK;
}

function writeTime(bytes: Uint8Array, ms: number): void {
  const time = BigInt(ms);
  for (let index = TIME_BYTES - 1; index >= 0; index -= 1) {
    const shift = BigInt((TIME_BYTES - 1 - index) * BYTE_SHIFT);
    bytes[index] = Number((time >> shift) & BigInt(BYTE_MASK));
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(HEX).padStart(HEX_PAD, '0')).join('');
  return `${hex.slice(0, UUID_TIME_LOW)}-${hex.slice(UUID_TIME_LOW, UUID_TIME_MID)}-${hex.slice(UUID_TIME_MID, UUID_TIME_HIGH)}-${hex.slice(UUID_TIME_HIGH, UUID_CLOCK)}-${hex.slice(UUID_CLOCK)}`;
}
