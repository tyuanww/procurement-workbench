import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { OAuthStateStore } from '../../../application/src/ports/oauth-state-store.js';
import type { AppDatabase } from '../client.js';
import { authOauthStates } from '../schema/platform.js';

export function oauthStateRepository(db: AppDatabase): OAuthStateStore {
  return {
    async issue(input) {
      await db.insert(authOauthStates).values({ id: randomUUID(), stateHash: input.stateHash, nonceHash: input.nonceHash, redirectUri: input.redirectUri, returnTo: input.returnTo, createdAt: input.createdAt, expiresAt: input.expiresAt, usedAt: null });
    },
    async consume(input) {
      const updated = await db.update(authOauthStates)
        .set({ usedAt: input.at })
        .where(and(eq(authOauthStates.stateHash, input.stateHash), eq(authOauthStates.nonceHash, input.nonceHash), isNull(authOauthStates.usedAt), gt(authOauthStates.expiresAt, input.at)))
        .returning();
      const row = updated[0];
      return row === undefined ? undefined : { redirectUri: row.redirectUri, returnTo: row.returnTo };
    },
  };
}
