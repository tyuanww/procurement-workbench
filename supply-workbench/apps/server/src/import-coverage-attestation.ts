import { createHmac, timingSafeEqual } from 'node:crypto';
import { importCoverageOf, type ImportCoverageAttestation } from '@sw/domain';
import type { ImportCoverageAttestationVerifier } from '../../../packages/application/src/ports/import-coverage-attestation.js';

export function hmacCoverageAttestation(secret: string, allowedIssuers: readonly string[]): ImportCoverageAttestationVerifier {
  return {
    async verify({ token, now }) {
      const [encoded, signature] = token.split('.');
      if (encoded === undefined || signature === undefined || !same(signature, sign(encoded, secret))) return undefined;
      const value = parsePayload(encoded);
      if (value === undefined || !isAttestation(value) || !allowedIssuers.includes(value.issuer)) return undefined;
      const current = Date.parse(now);
      const issued = Date.parse(value.issuedAt);
      const expires = Date.parse(value.expiresAt);
      if (!validWindow({ current, issued, expires })) return undefined;
      return value;
    },
  };
}

function parsePayload(encoded: string): unknown {
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return value;
  } catch {
    return undefined;
  }
}

function isAttestation(value: unknown): value is ImportCoverageAttestation {
  if (!isRecord(value) || !requiredTextFields(value)) return false;
  if (!nullableText(value.factoryPartyId) || !nullableText(value.sourceKey)) return false;
  if (typeof value.payloadSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.payloadSha256)) return false;
  try {
    importCoverageOf(value.coverage);
    return true;
  } catch {
    return false;
  }
}

function requiredTextFields(value: Record<string, unknown>): boolean {
  return typeof value.attestationId === 'string'
    && value.attestationId.trim() !== ''
    && typeof value.template === 'string'
    && typeof value.payloadSha256 === 'string'
    && typeof value.issuer === 'string'
    && typeof value.issuedAt === 'string'
    && typeof value.expiresAt === 'string';
}

function nullableText(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function validWindow(input: { readonly current: number; readonly issued: number; readonly expires: number }): boolean {
  return Number.isFinite(input.current)
    && Number.isFinite(input.issued)
    && Number.isFinite(input.expires)
    && input.issued <= input.current
    && input.expires > input.current;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function same(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
