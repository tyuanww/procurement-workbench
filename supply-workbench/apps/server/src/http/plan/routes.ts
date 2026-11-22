import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AddWorkItemDependencyRequestSchema,
  BuildProcurementScheduleRequestSchema,
  BuildProcurementScheduleResultSchema,
  ChangeWorkItemStatusRequestSchema,
  CreateWorkItemRequestSchema,
  DailyPlanQuerySchema,
  DailyPlanSchema,
  GenerateWorkItemsRequestSchema,
  GenerateWorkItemsResultSchema,
  ProjectProgressQuerySchema,
  SchedulePlanQuerySchema,
  ProjectProgressSchema,
  ScheduleViewSchema,
  UpdateWorkItemRequestSchema,
  WorkItemDependencyResponseSchema,
  WorkItemDetailSchema,
  WorkItemIdResponseSchema,
  WorkItemListQuerySchema,
  WorkItemListResponseSchema,
  WorkItemVersionResponseSchema,
} from '@sw/contracts';
import { EntityIdSchema } from '@sw/contracts';
import { z } from 'zod';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';
import type { PlanApi } from './api.js';

const IdParams = z.object({ id: EntityIdSchema }).strict();

export function registerPlanRoutes(app: FastifyInstance, api: PlanApi): void {
  app.post('/api/v1/plan/work-items', async (req) => {
    const created = await api.createWorkItem(parse(CreateWorkItemRequestSchema, req.body), requireActor(req));
    return wire(WorkItemIdResponseSchema, created);
  });
  app.get('/api/v1/plan/work-items', async (req) => wire(WorkItemListResponseSchema, await api.list(parse(WorkItemListQuerySchema, req.query), requireActor(req))));
  app.get('/api/v1/plan/work-items/:id', async (req) => wire(WorkItemDetailSchema, await api.get({ workItemId: idOf(req) }, requireActor(req))));
  app.patch('/api/v1/plan/work-items/:id', async (req) => {
    const updated = await api.updateWorkItem({ workItemId: idOf(req), ...parse(UpdateWorkItemRequestSchema, req.body) }, requireActor(req));
    return wire(WorkItemVersionResponseSchema, updated);
  });
  app.post('/api/v1/plan/work-items/:id/status', async (req) => {
    const changed = await api.changeStatus({ workItemId: idOf(req), ...parse(ChangeWorkItemStatusRequestSchema, req.body) }, requireActor(req));
    return wire(WorkItemVersionResponseSchema, changed);
  });
  app.post('/api/v1/plan/work-item-dependencies', async (req) => {
    const created = await api.addDependency(parse(AddWorkItemDependencyRequestSchema, req.body), requireActor(req));
    return wire(WorkItemDependencyResponseSchema, created);
  });
  app.post('/api/v1/plan/generate', async (req) => {
    const result = await api.generate(parse(GenerateWorkItemsRequestSchema, req.body), requireActor(req));
    return wire(GenerateWorkItemsResultSchema, result);
  });
  app.post('/api/v1/plan/procurement-schedule', async (req) => {
    const result = await api.buildProcurementSchedule(parse(BuildProcurementScheduleRequestSchema, req.body), requireActor(req));
    return wire(BuildProcurementScheduleResultSchema, result);
  });
  app.get('/api/v1/plan/daily', async (req) => wire(DailyPlanSchema, await api.daily(parse(DailyPlanQuerySchema, req.query), requireActor(req))));
  app.get('/api/v1/plan/schedule', async (req) => wire(ScheduleViewSchema, await api.schedule(parse(SchedulePlanQuerySchema, req.query), requireActor(req))));
  app.get('/api/v1/plan/progress', async (req) => wire(ProjectProgressSchema, await api.progress(parse(ProjectProgressQuerySchema, req.query), requireActor(req))));
}

function idOf(req: FastifyRequest): z.output<typeof EntityIdSchema> {
  return parse(IdParams, req.params).id;
}
