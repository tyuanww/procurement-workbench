import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SearchEverything } from '@sw/application';
import { SearchResultSchema } from '@sw/contracts';
import { requireActor } from '../app.js';
import { wire } from '../wire.js';

export type SearchApi = { readonly search: SearchEverything };

export function registerSearchRoutes(app: FastifyInstance, api: SearchApi): void {
  app.get('/api/v1/search', async (req) => wire(SearchResultSchema, await api.search(queryOf(req), requireActor(req))));
}

function queryOf(req: FastifyRequest): { readonly q: string } {
  const raw = isRecord(req.query) ? req.query : {};
  return { q: typeof raw.q === 'string' ? raw.q : '' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
