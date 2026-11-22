import type { FastifyInstance } from 'fastify';
import {
  CreateDevelopmentNodeSchema, CreateDevelopmentProjectSchema, DevelopmentMaterialsSchema, DevelopmentOrdersSchema,
  DevelopmentResultSchema, DevelopmentScopeSchema, FindDevelopmentMaterialsSchema, FindDevelopmentOrdersSchema,
  LinkDevelopmentNodeSchema, ProductDevelopmentSchema, ReplyToDevelopmentNodeSchema, UpdateDevelopmentNodeSchema,
} from '@sw/contracts';
import type { ProductDevelopmentApi } from '../../composition/product-development.js';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';

export function registerProductDevelopmentRoutes(app: FastifyInstance, api: ProductDevelopmentApi): void {
  const root = '/api/v1/product-development';
  app.get(root, async (req) => wire(ProductDevelopmentSchema,
    await api.list(parse(DevelopmentScopeSchema, req.query).store, requireActor(req))));
  app.get(`${root}/orders`, async (req) => wire(DevelopmentOrdersSchema,
    await api.orders(parse(FindDevelopmentOrdersSchema, req.query), requireActor(req))));
  app.get(`${root}/materials`, async (req) => wire(DevelopmentMaterialsSchema,
    await api.materials(parse(FindDevelopmentMaterialsSchema, req.query), requireActor(req))));
  app.post(`${root}/projects`, async (req) => wire(DevelopmentResultSchema,
    await api.createProject(parse(CreateDevelopmentProjectSchema, req.body), requireActor(req))));
  app.post(`${root}/nodes`, async (req) => wire(DevelopmentResultSchema,
    await api.createNode(parse(CreateDevelopmentNodeSchema, req.body), requireActor(req))));
  app.patch(`${root}/nodes`, async (req) => wire(DevelopmentResultSchema,
    await api.updateNode(parse(UpdateDevelopmentNodeSchema, req.body), requireActor(req))));
  app.post(`${root}/replies`, async (req) => wire(DevelopmentResultSchema,
    await api.reply(parse(ReplyToDevelopmentNodeSchema, req.body), requireActor(req))));
  app.post(`${root}/links`, async (req) => wire(DevelopmentResultSchema,
    await api.link(parse(LinkDevelopmentNodeSchema, req.body), requireActor(req))));
}
