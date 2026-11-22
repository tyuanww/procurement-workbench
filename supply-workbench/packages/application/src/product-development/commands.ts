import { isFactoryDevelopmentDestination, type EntityId, type WorkItem, type WorkItemEvent } from '@sw/domain';
import { assertWorkItemTransition, newWorkItemEvent, workItemSnapshot } from '../plan/index.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { DevelopmentNode, DevelopmentProject, DevelopmentStores, DevelopmentUnitOfWork } from '../ports/product-development.js';
import type { Actor } from '../shared/actor.js';
import { auditOf } from '../shared/audit.js';
import { authorize } from '../shared/authorize.js';
import { ForbiddenError, NotFoundError, StateConflictError, ValidationFailedError } from '../shared/errors.js';
import { canLeadDevelopment, isDevelopmentBuyer, requireDevelopmentManagement, requireDevelopmentUser } from './access.js';
import type { CreateDevelopmentNode, CreateDevelopmentProject, LinkDevelopmentNode, ReplyToDevelopmentNode, UpdateDevelopmentNode } from './views.js';
import { canReplyToDevelopment, developmentReplyDate } from './state.js';

type Dependencies = { readonly uow: DevelopmentUnitOfWork; readonly clock: Clock; readonly ids: IdGenerator };
type Context = { readonly tx: DevelopmentStores; readonly actor: Actor; readonly at: string; readonly ids: IdGenerator };

export function makeProductDevelopment(deps: Dependencies) {
  const run = <T>(actor: Actor, command: (ctx: Context) => Promise<T>) => deps.uow.run((tx) =>
    command({ tx, actor, at: deps.clock.now(), ids: deps.ids }));
  return {
    createProject: (input: CreateDevelopmentProject, actor: Actor) => run(actor, (ctx) => createProject(input, ctx)),
    createNode: (input: CreateDevelopmentNode, actor: Actor) => run(actor, (ctx) => createNode(input, ctx)),
    updateNode: (input: UpdateDevelopmentNode, actor: Actor) => run(actor, (ctx) => updateNode(input, ctx)),
    reply: (input: ReplyToDevelopmentNode, actor: Actor) => run(actor, (ctx) => reply(input, ctx)),
    link: (input: LinkDevelopmentNode, actor: Actor) => run(actor, (ctx) => link(input, ctx)),
  };
}

async function createProject(input: CreateDevelopmentProject, { tx, actor, at }: Context) {
  authorize(actor, 'products.maintain');
  await requireDevelopmentUser(tx.users, { id: input.productLeadUserId, accepts: canLeadDevelopment, roleLabel: '产品协作' });
  const project = { ...input, createdBy: actor.id, createdAt: at };
  if (await tx.development.insertProject(project)) {
    await tx.audit.record(auditOf({ action: 'product_development.create', subject: project, ctx: { actor, at, entity: '新品项目' } }));
  } else {
    const existing = await tx.development.lockProject(input.id);
    if (existing.createdBy !== actor.id || existing.store !== input.store ||
        existing.title !== input.title || existing.productLeadUserId !== input.productLeadUserId) conflict();
  }
  return { id: project.id };
}

async function createNode(input: CreateDevelopmentNode, ctx: Context) {
  const { tx, actor, at } = ctx;
  const project = await tx.development.lockProject(input.projectId);
  requireDevelopmentManagement(project, actor);
  const previous = await tx.workItems.find(input.id);
  if (previous !== undefined) return replayCreatedNode(input, ctx);
  await validateAssignment(input, ctx);
  const item = draftItem(input, at);
  const node = { id: input.id, projectId: project.id, destination: input.destination, buyerUserId: input.buyerUserId, formalLink: null };
  await tx.workItems.save(item);
  await tx.development.insertNode(node);
  await recordNode({ ctx, nodeId: node.id, kind: 'created', field: null, value: { ...workItemSnapshot(item), ...node } });
  return { id: node.id };
}

async function replayCreatedNode(input: CreateDevelopmentNode, { tx, actor }: Context) {
  const event = await tx.development.event(input.id);
  const value = event?.newValue;
  if (event?.actorUserId !== actor.id || event.kind !== 'created' || typeof value !== 'object' || value === null) conflict();
  for (const [key, field] of Object.entries(input)) {
    if (Object.getOwnPropertyDescriptor(value, key)?.value !== field) conflict();
  }
  return { id: input.id };
}

function draftItem(input: CreateDevelopmentNode, at: string): WorkItem {
  return {
    id: input.id, createdAt: at, updatedAt: at, subjectType: 'product_development', subjectId: input.projectId,
    kind: 'task', title: input.title, ownerUserId: input.ownerUserId, counterpartyPartyId: null, counterpartyRole: null,
    plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, status: 'planned', priority: 'normal',
    source: 'manual', parentId: null, version: 0,
  };
}

async function updateNode(input: UpdateDevelopmentNode, ctx: Context) {
  const { tx, actor, at } = ctx;
  const { project, node, item } = await lockedNode(input, tx);
  requireDevelopmentManagement(project, actor);
  if (item.version !== input.expectedVersion) throw new StateConflictError('新品节点已更新，请刷新后重试');
  if (input.status !== item.status) assertWorkItemTransition(item.status, input.status);
  await validateAssignment({ ...input, destination: node.destination }, ctx);
  const next = {
    ...item, ownerUserId: input.ownerUserId, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd,
    status: input.status, version: item.version + 1, updatedAt: at,
  };
  if (!await tx.workItems.saveConditional(next, item.version)) conflict();
  await tx.development.updateNode({ ...node, buyerUserId: input.buyerUserId });
  await recordPlanChanges({ ctx, current: item, next });
  await tx.audit.record(auditOf({ action: 'product_development.update', subject: next, ctx: { actor, at, entity: '新品节点', before: { ...item, buyerUserId: node.buyerUserId }, after: { ...next, buyerUserId: input.buyerUserId } } }));
  return { id: node.id };
}

async function recordPlanChanges({ ctx, current, next }: { readonly ctx: Context; readonly current: WorkItem; readonly next: WorkItem }) {
  const fields = [
    { field: 'ownerUserId', kind: 'owner_changed' },
    { field: 'plannedStart', kind: 'date_changed' },
    { field: 'plannedEnd', kind: 'date_changed' },
    { field: 'status', kind: 'status_changed' },
  ] as const;
  for (const { field, kind } of fields) {
    if (current[field] === next[field]) continue;
    await ctx.tx.workItemEvents.append(newWorkItemEvent({
      id: ctx.ids.next(), workItemId: current.id, kind, field, oldValue: current[field], newValue: next[field],
      actorUserId: ctx.actor.id, note: null, createdAt: ctx.at,
    }));
  }
}

async function reply(input: ReplyToDevelopmentNode, ctx: Context) {
  const { tx, actor, at } = ctx;
  const { node, item } = await lockedNode(input, tx);
  if (!isDevelopmentBuyer(actor) || node.buyerUserId !== actor.id) throw new ForbiddenError('product-development.reply');
  const previous = await tx.development.event(input.id);
  if (previous !== undefined) return replayReply(previous, { input, actor });
  if (!canReplyToDevelopment({ ...node, status: item.status }, actor)) {
    throw new StateConflictError('节点已结束或转到正式采购事项');
  }
  const version = item.version + 1;
  if (!await tx.workItems.saveConditional({ ...item, version, updatedAt: at }, item.version)) conflict();
  await recordNode({
    ctx, nodeId: node.id, kind: 'development_replied', field: 'promisedOn',
    value: { promisedOn: input.promisedOn, version }, note: input.evidence, eventId: input.id,
  });
  return { id: input.id };
}


function replayReply(previous: WorkItemEvent, { input, actor }: { readonly input: ReplyToDevelopmentNode; readonly actor: Actor }) {
  if (previous.workItemId !== input.nodeId || previous.actorUserId !== actor.id || previous.kind !== 'development_replied' ||
      developmentReplyDate(previous.newValue) !== input.promisedOn || previous.note !== input.evidence) conflict();
  return { id: previous.id };
}

async function link(input: LinkDevelopmentNode, ctx: Context) {
  const { tx, actor } = ctx;
  const { project, node } = await lockedNode(input, tx);
  requireDevelopmentManagement(project, actor);
  const procurementLineId = procurementLineOf(input, node);
  if (node.formalLink !== null) {
    if (node.formalLink.orderLineId !== input.orderLineId || node.formalLink.procurementLineId !== procurementLineId) {
      throw new StateConflictError('节点已经关联正式采购事项');
    }
    return { id: node.id };
  }
  const valid = await tx.development.validOrder({ store: project.store, orderLineId: input.orderLineId });
  if (valid === undefined) throw new ValidationFailedError('请选择同店、有 OA 编号的有效成品订单行');
  if (procurementLineId !== valid.orderLineId && !await tx.development.isMaterial({ store: project.store, orderLineId: valid.orderLineId, materialLineId: procurementLineId })) {
    throw new ValidationFailedError('请选择该成品订单在本店已关联的子件采购事项');
  }
  const formalLink = { orderLineId: valid.orderLineId, oaRef: valid.oaRef, procurementLineId };
  await tx.development.updateNode({ ...node, formalLink });
  await recordNode({ ctx, nodeId: node.id, kind: 'development_linked', field: 'formalLink', value: formalLink });
  return { id: node.id };
}

function procurementLineOf(input: LinkDevelopmentNode, node: DevelopmentNode) {
  if (node.destination === 'other') throw new ValidationFailedError('请选择有明确交付目的的节点');
  if (isFactoryDevelopmentDestination(node.destination)) {
    if (input.procurementLineId === null || input.procurementLineId === input.orderLineId) {
      throw new ValidationFailedError('到厂节点需要选定该订单的子件采购事项');
    }
    return input.procurementLineId;
  }
  if (input.procurementLineId !== null && input.procurementLineId !== input.orderLineId) {
    throw new ValidationFailedError('成品入仓节点只能关联成品订单行');
  }
  return input.orderLineId;
}

async function lockedNode(input: { readonly projectId: EntityId; readonly nodeId: EntityId }, tx: DevelopmentStores): Promise<{
  readonly project: DevelopmentProject; readonly node: DevelopmentNode; readonly item: WorkItem;
}> {
  const project = await tx.development.lockProject(input.projectId);
  const node = await tx.development.findNode(input.nodeId);
  if (node === undefined || node.projectId !== project.id) throw new NotFoundError('新品节点', input.nodeId);
  return { project, node, item: await tx.workItems.get(node.id) };
}

async function validateAssignment(input: Pick<CreateDevelopmentNode, 'plannedStart' | 'plannedEnd' | 'ownerUserId' | 'buyerUserId' | 'destination'>, { tx }: Context) {
  if (input.plannedStart > input.plannedEnd) throw new ValidationFailedError('计划开始日不能晚于要求日期');
  if (input.ownerUserId === null) throw new ValidationFailedError('请选择节点负责人');
  await requireDevelopmentUser(tx.users, { id: input.ownerUserId, accepts: () => true, roleLabel: '节点负责人' });
  if (input.buyerUserId !== null) {
    if (input.destination === 'other') throw new ValidationFailedError('请为采购跟进选择具体交付目的');
    await requireDevelopmentUser(tx.users, { id: input.buyerUserId, accepts: isDevelopmentBuyer, roleLabel: '采购' });
  }
}

async function recordNode(input: {
  readonly ctx: Context; readonly nodeId: EntityId; readonly kind: WorkItemEvent['kind']; readonly field: string | null;
  readonly value: unknown; readonly note?: string; readonly eventId?: EntityId;
}) {
  const { ctx: { tx, actor, at, ids }, nodeId, kind, field, value } = input;
  const event = newWorkItemEvent({
    id: input.eventId ?? (kind === 'created' ? nodeId : ids.next()), workItemId: nodeId, kind, field,
    oldValue: null, newValue: value, actorUserId: actor.id, note: input.note ?? null, createdAt: at,
  });
  await tx.workItemEvents.append(event);
  await tx.audit.record(auditOf({ action: `product_development.${kind}`, subject: { id: nodeId }, ctx: { actor, at, entity: '新品节点', after: event } }));
}

function conflict(): never {
  throw new StateConflictError('请求已处理或节点已更新，请刷新后重试');
}
