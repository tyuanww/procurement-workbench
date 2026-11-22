import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BottleneckSummarySchema, BuyerDrillQuerySchema, BuyerDrillSchema, BuyerLoadDashboardSchema, LaneSchema, LocalDateSchema, StuckDashboardSchema, StuckQuerySchema, type StuckQuery } from '@sw/contracts';
import { z } from 'zod';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';

const PeriodQuery = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  lane: LaneSchema.optional(),
}).strict();

const SupplierQuery = PeriodQuery.extend({ partyId: z.string().min(1).optional() });

export type PerformanceApi = {
  getStuck(input: StuckQuery, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  getSuppliers(input: z.infer<typeof SupplierQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  getBuyers(input: z.infer<typeof PeriodQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  getBuyerDrill(input: z.infer<typeof BuyerDrillQuerySchema>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  getBottlenecks(input: z.infer<typeof PeriodQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
};

export function registerPerformanceRoutes(app: FastifyInstance, api: PerformanceApi): void {
  app.get('/api/v1/dashboard/stuck', async (req) => wire(StuckDashboardSchema, await api.getStuck(parse(StuckQuerySchema, req.query), requireActor(req))));
  app.get('/api/v1/dashboard/suppliers', async (req) => api.getSuppliers(parse(SupplierQuery, req.query), requireActor(req)));
  app.get('/api/v1/dashboard/buyers', async (req) => wire(BuyerLoadDashboardSchema, await read(api.getBuyers, req)));
  app.get('/api/v1/dashboard/buyers/drill', async (req) => wire(BuyerDrillSchema, await api.getBuyerDrill(parse(BuyerDrillQuerySchema, req.query), requireActor(req))));
  app.get('/api/v1/dashboard/bottlenecks', async (req) => wire(BottleneckSummarySchema, await read(api.getBottlenecks, req)));
}

function read(handler: PerformanceApi['getBuyers'], req: FastifyRequest) {
  return handler(parse(PeriodQuery, req.query), requireActor(req));
}
