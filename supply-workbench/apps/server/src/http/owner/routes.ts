import type { FastifyInstance } from 'fastify';
import {
  AssignOwnerRequestSchema,
  OwnerCoverageSchema,
  OwnerUpdatedSchema,
  PendingOwnerListSchema,
  ResolvePendingOwnerRequestSchema,
} from '@sw/contracts';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';
import type { OwnerApi } from './api.js';

export function registerOwnerRoutes(app: FastifyInstance, api: OwnerApi): void {
  app.get('/api/v1/owners/coverage', async (req) => wire(OwnerCoverageSchema, await api.coverage({}, requireActor(req))));
  app.get('/api/v1/owners/pending', async (req) => wire(PendingOwnerListSchema, await api.pending({}, requireActor(req))));
  app.post('/api/v1/owners/assign', async (req) => wire(OwnerUpdatedSchema, await api.assign(parse(AssignOwnerRequestSchema, req.body), requireActor(req))));
  app.post('/api/v1/owners/resolve-pending', async (req) => wire(OwnerUpdatedSchema, await api.resolve(parse(ResolvePendingOwnerRequestSchema, req.body), requireActor(req))));
}
