import 'fastify';
import type { SessionUser } from '@sw/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    actor: SessionUser | undefined;
  }
}
