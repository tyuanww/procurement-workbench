import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { GetToday } from '@sw/application';
import { PersonalTodayQuerySchema, PersonalTodayResponseSchema, TodayChaseQuerySchema, TodayChaseResponseSchema, TodayPageQuerySchema, TodayPageResponseSchema, TodayQuerySchema, TodayResponseSchema } from '@sw/contracts';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';

export type TodayApi = { getToday: GetToday };

export function registerTodayRoutes(app: FastifyInstance, api: TodayApi): void {
  app.get('/api/v1/today', async (req) => {
    const raw = rawQuery(req);
    const common = commonQuery(raw);
    const actor = requireActor(req);
    if (!isPaged(raw)) {
      return wire(TodayResponseSchema, await api.getToday(parse(TodayQuerySchema, common), actor));
    }
    const input = parse(TodayPageQuerySchema, {
      ...common, page: { number: raw.page, size: raw.pageSize }, sort: sortQuery(raw),
      ...(raw.work === undefined ? {} : { work: raw.work }),
      ...(raw.focusId === undefined ? {} : { focusId: raw.focusId }),
    });
    return wire(TodayPageResponseSchema, await api.getToday.page(input, actor));
  });
  app.get('/api/v1/today/personal', async (req) => {
    const actor = requireActor(req);
    const input = parse(PersonalTodayQuerySchema, rawQuery(req));
    return wire(PersonalTodayResponseSchema, await api.getToday.personal(input, actor));
  });
  app.get('/api/v1/today/chase', async (req) => {
    const raw = rawQuery(req);
    const reasons = list(raw.reasons);
    const input = parse(TodayChaseQuerySchema, {
      ...(reasons === undefined ? {} : { reasons }),
      sort: sortQuery(raw),
      ...(raw.work === undefined ? {} : { work: raw.work }),
      ...(raw.factoryId === undefined ? {} : { factoryId: raw.factoryId }),
      ...(raw.itemId === undefined ? {} : { itemId: raw.itemId }),
    });
    return wire(TodayChaseResponseSchema, await api.getToday.chase(input, requireActor(req)));
  });
}

function isPaged(raw: Record<string, unknown>): boolean {
  return raw.page !== undefined || raw.pageSize !== undefined || raw.sort !== undefined || raw.unit !== undefined || raw.focusId !== undefined || raw.work !== undefined;
}

function rawQuery(req: FastifyRequest): Record<string, unknown> {
  return isRecord(req.query) ? req.query : {};
}

function sortQuery(raw: Record<string, unknown>) {
  return { kind: raw.sort ?? 'urgency', ...(raw.unit === undefined ? {} : { unit: raw.unit }) };
}

function commonQuery(raw: Record<string, unknown>) {
  const reasons = list(raw.reasons);
  const pending = raw.includePending;
  const includePending = pending === 'true' ? true : pending === 'false' ? false : pending;
  return {
    scope: raw.scope,
    ...(reasons === undefined ? {} : { reasons }),
    ...(includePending === undefined ? {} : { includePending }),
  };
}

function list(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item !== '');
  if (typeof value !== 'string' || value === '') return undefined;
  return value.split(',').filter((item) => item !== '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
