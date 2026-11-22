import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BottleneckSummarySchema, BuyerLoadDashboardSchema, LaneSchema, LocalDateSchema } from '@sw/contracts';
import { z } from 'zod';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';

const PeriodQuery = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  lane: LaneSchema.optional(),
}).strict();

export type PerformanceApi = {
  getStuck(input: z.infer<typeof PeriodQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  getSuppliers(input: z.infer<typeof PeriodQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  getBuyers(input: z.infer<typeof PeriodQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  getBottlenecks(input: z.infer<typeof PeriodQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
};

export function registerPerformanceRoutes(app: FastifyInstance, api: PerformanceApi): void {
  app.get('/api/v1/dashboard/stuck', async (req) => read(api.getStuck, req));
  app.get('/api/v1/dashboard/suppliers', async (req) => read(api.getSuppliers, req));
  app.get('/api/v1/dashboard/buyers', async (req) => wire(BuyerLoadDashboardSchema, await read(api.getBuyers, req)));
  app.get('/api/v1/dashboard/bottlenecks', async (req) => wire(BottleneckSummarySchema, await read(api.getBottlenecks, req)));
}

function read(handler: PerformanceApi['getStuck'], req: FastifyRequest) {
  return handler(parse(PeriodQuery, req.query), requireActor(req));
}
