import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { hmacCoverageAttestation } from '../../apps/server/src/import-coverage-attestation.js';

const SECRET = 'coverage-secret-012345678901234567890123';

it('coverage attestation 绑定文件摘要、来源和过期时间', async () => {
  const verifier = hmacCoverageAttestation(SECRET, ['factory-sync']);
  const payload = {
    attestationId: 'attestation-1',
    template: 'po-master-v1',
    factoryPartyId: null,
    sourceKey: null,
    coverage: 'partial',
    payloadSha256: 'a'.repeat(64),
    issuer: 'factory-sync',
    issuedAt: '2026-11-08T00:00:00.000Z',
    expiresAt: '2026-11-08T00:05:00.000Z',
  } as const;
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${encoded}.${createHmac('sha256', SECRET).update(encoded).digest('base64url')}`;
  await expect(verifier.verify({ token, now: '2026-11-08T00:01:00.000Z' })).resolves.toMatchObject({ coverage: 'partial', issuer: 'factory-sync' });
  await expect(hmacCoverageAttestation(SECRET, ['other-issuer']).verify({ token, now: '2026-11-08T00:01:00.000Z' })).resolves.toBeUndefined();
  await expect(verifier.verify({ token: `${encoded}.bad`, now: '2026-11-08T00:01:00.000Z' })).resolves.toBeUndefined();
  await expect(verifier.verify({ token, now: '2026-11-08T00:05:00.000Z' })).resolves.toBeUndefined();
});
