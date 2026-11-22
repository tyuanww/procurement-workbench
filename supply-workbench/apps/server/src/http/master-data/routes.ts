import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  ApproveAliasRequestSchema,
  ApproveCodeRequestSchema,
  CreatePartyRequestSchema,
  EntityIdSchema,
  MultiNameViewSchema,
  OrderLineDetailSchema,
  OrderLineIdSchema,
  PartyAliasViewSchema,
  PartyListQuerySchema,
  ReasonRequestSchema,
  UpdatePartyRequestSchema,
  listResponseSchema,
} from '@sw/contracts';
import { z } from 'zod';
import type { MasterApi } from './api.js';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';

const IdParams = z.object({ id: z.string().min(1) }).strict();
const RowParams = z.object({ table: z.string().min(1), rowId: z.string().min(1) }).strict();
const CodeParams = z.object({ codeId: z.string().min(1) }).strict();

export function registerMasterDataRoutes(app: FastifyInstance, api: MasterApi): void {
  app.get('/api/v1/master/review-queue/counts', async (req) => api.reviewCounts({}, requireActor(req)));
  app.get('/api/v1/master/aliases', async (req) => wire(listResponseSchema(PartyAliasViewSchema), await api.listAliases(aliasQuery(req), requireActor(req))));
  app.post('/api/v1/master/aliases/:id/approve', async (req) => afterAlias(api, req));
  app.post('/api/v1/master/aliases/:id/reject', async (req) => afterRejectAlias(api, req));
  app.get('/api/v1/master/codes', async (req) => api.listCodes(pageQuery(req), requireActor(req)));
  app.post('/api/v1/master/codes/bulk-create-items', async (req) => api.bulkCreate(parse(z.object({ codeIds: z.array(z.string()) }).strict(), req.body), requireActor(req)));
  app.post('/api/v1/master/codes/:id/approve', async (req) => afterCode(api, req));
  app.post('/api/v1/master/codes/:id/reject', async (req) => afterRejectCode(api, req));
  app.get('/api/v1/master/code-links', async (req) => api.listLinks(pageQuery(req), requireActor(req)));
  app.post('/api/v1/master/code-links/:id/approve', async (req) => afterLink({ api, command: api.approveLink, req }));
  app.post('/api/v1/master/code-links/:id/reject', async (req) => afterLink({ api, command: api.rejectLink, req }));
  app.get('/api/v1/master/multi-name', async (req) => api.listMultiName(pageQuery(req), requireActor(req)));
  app.post('/api/v1/master/multi-name/:codeId/resolve', async (req) => afterMulti(api, req));
  app.get('/api/v1/parties', async (req) => api.listParties(partiesQuery(req), requireActor(req)));
  app.get('/api/v1/parties/:id', async (req) => api.getParty({ partyId: idOf(req) }, requireActor(req)));
  app.post('/api/v1/parties', async (req) => afterParty(api, req));
  app.patch('/api/v1/parties/:id', async (req) => afterUpdateParty(api, req));
  app.get('/api/v1/items', async (req) => api.listItems(pageQuery(req), requireActor(req)));
  app.get('/api/v1/items/:id', async (req) => api.getItem({ itemId: idOf(req) }, requireActor(req)));
  app.get('/api/v1/factory-reports/unlinked', async (req) => api.listUnlinked(pageQuery(req), requireActor(req)));
  app.post('/api/v1/factory-reports/:table/:rowId/link', async (req) => linkRow(api, req));
  app.post('/api/v1/factory-reports/in-transit/:rowId/create-line', async (req) => createFromTransit(api, req));
  app.get('/api/v1/factory-reports/demand', async (req) => api.listDemand(pageQuery(req), requireActor(req)));
  app.get('/api/v1/factory-reports/customer-supplied', async (req) => api.listSupplied(pageQuery(req), requireActor(req)));
}

async function afterAlias(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const aliasId = idOf(req);
  await api.approveAlias({ aliasId, ...parse(ApproveAliasRequestSchema, req.body) }, actor);
  return wire(PartyAliasViewSchema, await api.aliasView(aliasId));
}

async function afterRejectAlias(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const aliasId = idOf(req);
  await api.rejectAlias({ aliasId, reason: parse(ReasonRequestSchema, req.body).reason }, actor);
  return wire(PartyAliasViewSchema, await api.aliasView(aliasId));
}

async function afterCode(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const codeId = idOf(req);
  await api.approveCode({ codeId, ...parse(ApproveCodeRequestSchema, req.body) }, actor);
  return api.codeView(codeId);
}

async function afterRejectCode(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const codeId = idOf(req);
  await api.rejectCode({ codeId, reason: parse(ReasonRequestSchema, req.body).reason }, actor);
  return api.codeView(codeId);
}

async function afterLink({ api, command, req }: { readonly api: MasterApi; readonly command: MasterApi['approveLink']; readonly req: FastifyRequest }) {
  const actor = requireActor(req);
  const linkId = idOf(req);
  const body = isRecord(req.body) ? req.body : {};
  await command({ linkId, ...(typeof body.reason === 'string' ? { reason: body.reason } : {}) }, actor);
  return api.linkView(linkId);
}

async function afterMulti(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const codeId = parse(CodeParams, req.params).codeId;
  await api.resolveMulti({ codeId, ...parse(z.union([z.object({ mode: z.literal('same_item'), displayName: z.string() }).strict(), z.object({ mode: z.literal('shared_code') }).strict()]), req.body) }, actor);
  return wire(MultiNameViewSchema, await api.multiView(codeId));
}

async function afterParty(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const created = await api.createParty(parse(CreatePartyRequestSchema, req.body), actor);
  return api.partyView(created.partyId);
}

async function afterUpdateParty(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const partyId = idOf(req);
  await api.updateParty({ partyId, ...parse(UpdatePartyRequestSchema, req.body) }, actor);
  return api.partyView(partyId);
}

async function linkRow(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const params = parse(RowParams, req.params);
  const body = parse(z.object({ orderLineId: OrderLineIdSchema, approveCodeLink: z.boolean().optional() }).strict(), req.body);
  return api.linkRow({ table: tableOf(params.table), rowId: params.rowId, orderLineId: body.orderLineId, ...(body.approveCodeLink === undefined ? {} : { approveCodeLink: body.approveCodeLink }) }, actor);
}

async function createFromTransit(api: MasterApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const rowId = parse(z.object({ rowId: EntityIdSchema }).strict(), req.params).rowId;
  const body = isRecord(req.body) ? req.body : {};
  const buyerUserId = body.buyerUserId == null ? undefined : parse(EntityIdSchema, body.buyerUserId);
  const created = await api.lineFromTransit({ rowId, ...(buyerUserId === undefined ? {} : { buyerUserId }) }, actor);
  return wire(OrderLineDetailSchema, await api.lineDetail({ lineId: created.lineId }, actor));
}

function idOf(req: FastifyRequest): string {
  return parse(IdParams, req.params).id;
}

const PARTY_FIELDS = ['page', 'pageSize', 'q', 'role'] as const;

function partiesQuery(req: FastifyRequest) {
  return parse(PartyListQuerySchema, partyFields(queryOf(req)));
}

function partyFields(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(PARTY_FIELDS.flatMap((key) => partyField(raw, key)));
}

function partyField(raw: Record<string, unknown>, key: string): readonly (readonly [string, unknown])[] {
  if (!Object.hasOwn(raw, key)) return [];
  const value = raw[key];
  if (value === '') return [];
  return [[key, value]];
}

function aliasQuery(req: FastifyRequest) {
  const raw = queryOf(req);
  const status = reviewStatus(raw.status);
  return { ...pageQuery(req), ...(status === undefined ? {} : { status }) };
}

function pageQuery(req: FastifyRequest) {
  const raw = queryOf(req);
  const page = numberOf(raw.page);
  const pageSize = numberOf(raw.pageSize);
  return { ...(page === undefined ? {} : { page }), ...(pageSize === undefined ? {} : { pageSize }) };
}

function reviewStatus(value: unknown): 'pending' | 'approved' | 'rejected' | undefined {
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value;
  return undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value === '' || Number.isNaN(Number(value))) return undefined;
  return Number(value);
}

function queryOf(req: FastifyRequest): Record<string, unknown> {
  return isRecord(req.query) ? req.query : {};
}

function tableOf(value: string): 'in-transit' | 'shipment' | 'stock' | 'schedule' | 'demand' | 'packaging-combo' {
  if (value === 'in-transit' || value === 'shipment' || value === 'stock' || value === 'schedule' || value === 'demand' || value === 'packaging-combo') return value;
  throw new Error(`未知上报表 ${value}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
