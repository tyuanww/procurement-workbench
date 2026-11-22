import { ArrivalDetailSchema, ArrivalListSchema, ArrivalSchema, RegisterArrivalSchema, ReviseArrivalSchema } from '@sw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';
import type { FollowUpApi } from './api.js';
import { entityIdOf } from './commands.js';

const prefix = '/api/v1/receipts/arrivals';
const ListQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(['pending', 'all']).default('pending'),
}).strict();

export function registerArrivalRoutes(app: FastifyInstance, api: FollowUpApi['arrivals']): void {
  app.get(prefix, async (req) => {
    const { page, pageSize, filter } = parse(ListQuery, req.query);
    return wire(ArrivalListSchema, await api.list({ page, pageSize, pending: filter === 'pending' }, requireActor(req)));
  });
  app.post(prefix, async (req) => wire(ArrivalSchema, await api.register(parse(RegisterArrivalSchema, req.body), requireActor(req))));
  app.get(`${prefix}/:id`, async (req) => wire(ArrivalDetailSchema, await api.detail(entityIdOf(req), requireActor(req))));
  app.post(`${prefix}/:id/revise`, async (req) => wire(ArrivalSchema, await api.revise({ id: entityIdOf(req), input: parse(ReviseArrivalSchema, req.body) }, requireActor(req))));
}
