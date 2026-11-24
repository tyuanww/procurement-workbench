import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityIdSchema } from '@sw/contracts';
import { HttpError } from '../plugins/errors.js';
import {
  FactoryLinkCountsSchema,
  LineFactoryLinkViewSchema,
  RelinkFactoryRowsRequestSchema,
  RelinkFactoryRowsResultSchema,
  RelinkScheduleCellsResultSchema,
  SetLineFactoryLinkRequestSchema,
  SupplierBackfillResultSchema,
  UnmatchedFactoryRowListSchema,
  UnmatchedFactoryRowViewSchema,
  listResponseSchema,
} from '@sw/contracts';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';
import type { FactoryLinkApi } from './api.js';

const LineParams = z.object({ id: EntityIdSchema }).strict();
const LimitQuery = z.object({ limit: z.coerce.number().int().positive().optional() }).strict();
const DiagnosticQuery = z.object({
  scope: z.enum(['active', 'historical']),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
}).strict();
const UnmatchedQuery = z.union([DiagnosticQuery, LimitQuery]);
const DiagnosticsPage = listResponseSchema(UnmatchedFactoryRowViewSchema);

export function registerFactoryLinkRoutes(app: FastifyInstance, api: FactoryLinkApi): void {
  app.get('/api/v1/factory-links/counts', async (req) => wire(FactoryLinkCountsSchema, await api.counts({}, requireActor(req))));
  app.get('/api/v1/factory-links/unmatched', async (req) => {
    const input = parse(UnmatchedQuery, req.query);
    const result = await api.unmatched(input, requireActor(req));
    return 'scope' in input ? wire(DiagnosticsPage, result) : wire(UnmatchedFactoryRowListSchema, result);
  });
  app.post('/api/v1/factory-links/relink', async (req) => wire(RelinkFactoryRowsResultSchema, await api.relink(parse(RelinkFactoryRowsRequestSchema, req.body ?? {}), requireActor(req))));
  app.post('/api/v1/factory-links/relink-schedule', async (req) => wire(RelinkScheduleCellsResultSchema, await api.relinkSchedule({}, requireActor(req))));
  app.post('/api/v1/factory-links/backfill-suppliers', async (req) => wire(SupplierBackfillResultSchema, await api.backfillSuppliers({}, requireActor(req))));
  app.get('/api/v1/lines/:id/factory-link', async (req) => {
    const view = await api.getLine({ orderLineId: parse(LineParams, req.params).id }, requireActor(req));
    if (view === undefined) throw new HttpError({ code: 'NOT_FOUND', message: '订单行还没有工厂关联' });
    return wire(LineFactoryLinkViewSchema, view);
  });
  app.put('/api/v1/lines/:id/factory-link', async (req) => {
    const body = parse(SetLineFactoryLinkRequestSchema, req.body ?? {});
    const orderLineId = parse(LineParams, req.params).id;
    const view = await api.setLine({ orderLineId, ...body }, requireActor(req));
    return wire(LineFactoryLinkViewSchema, view);
  });
}
