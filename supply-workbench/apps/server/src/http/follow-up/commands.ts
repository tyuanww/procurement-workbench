import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BatchView, DeliveryNoteView, ExceptionView, FollowUpView, ReceiptView, ShipmentView } from '@sw/application';
import {
  AdoptShipmentRequestSchema,
  AssignLinesRequestSchema,
  BulkFollowUpRequestSchema,
  CloseExceptionRequestSchema,
  CreateBatchRequestSchema,
  CreateExceptionRequestSchema,
  CreateFollowUpRequestSchema,
  CreateLineRequestSchema,
  CreateReceiptRequestSchema,
  CreateShipmentRequestSchema,
  DeliveryBatchIdSchema,
  EntityIdSchema,
  GenerateBatchesRequestSchema,
  HintBatchesRequestSchema,
  LatestNotesRequestSchema,
  OrderLineIdSchema,
  ReasonRequestSchema,
  UpdateBatchRequestSchema,
  UpdateLineRequestSchema,
} from '@sw/contracts';
import { z } from 'zod';
import { requireActor } from '../app.js';
import { HttpError } from '../plugins/errors.js';
import { parse } from '../parse.js';
import type { FollowUpApi } from './api.js';

const OrderLineParams = z.object({ id: OrderLineIdSchema }).strict();
const BatchParams = z.object({ id: DeliveryBatchIdSchema }).strict();
const EntityParams = z.object({ id: EntityIdSchema }).strict();
const RowParams = z.object({ rowId: EntityIdSchema }).strict();

export function orderLineIdOf(req: FastifyRequest) {
  return parse(OrderLineParams, req.params).id;
}

export function deliveryBatchIdOf(req: FastifyRequest) {
  return parse(BatchParams, req.params).id;
}

export function entityIdOf(req: FastifyRequest) {
  return parse(EntityParams, req.params).id;
}

export function rowIdOf(req: FastifyRequest) {
  return parse(RowParams, req.params).rowId;
}

export function noContent(reply: FastifyReply) {
  reply.code(204);
  return reply.send();
}

export async function createLine(api: FollowUpApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const created = await api.createLine(parse(CreateLineRequestSchema, req.body), actor);
  return api.getDetail({ lineId: created.lineId }, actor);
}

export async function updateLine(api: FollowUpApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const updated = await api.updateLine({ lineId: orderLineIdOf(req), ...parse(UpdateLineRequestSchema, req.body) }, actor);
  const detail = await api.getDetail({ lineId: updated.lineId }, actor);
  return updated.ownerUndo === undefined ? detail : { ...detail, ownerUndo: updated.ownerUndo };
}

export async function lineReason({ api, command, req }: { readonly api: FollowUpApi; readonly command: FollowUpApi['cancelLine']; readonly req: FastifyRequest }) {
  const actor = requireActor(req);
  const updated = await command({ lineId: orderLineIdOf(req), reason: parse(ReasonRequestSchema, req.body).reason }, actor);
  return api.getDetail({ lineId: updated.lineId }, actor);
}

export async function createBatch(api: FollowUpApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const created = await api.createBatch({ lineId: orderLineIdOf(req), ...parse(CreateBatchRequestSchema, req.body) }, actor);
  return api.getBatch({ batchId: created.batchId }, actor);
}

export async function updateBatch(api: FollowUpApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const updated = await api.updateBatch({ batchId: deliveryBatchIdOf(req), ...parse(UpdateBatchRequestSchema, req.body) }, actor);
  return api.getBatch({ batchId: updated.batchId }, actor);
}

export async function batchReason({ api, command, req }: { readonly api: FollowUpApi; readonly command: FollowUpApi['closeBatch']; readonly req: FastifyRequest }) {
  const actor = requireActor(req);
  const updated = await command({ batchId: deliveryBatchIdOf(req), reason: parse(ReasonRequestSchema, req.body).reason }, actor);
  return api.getBatch({ batchId: updated.batchId }, actor);
}

export async function createShipment(api: FollowUpApi, req: FastifyRequest): Promise<ShipmentView> {
  const actor = requireActor(req);
  const batchId = deliveryBatchIdOf(req);
  const created = await api.recordShipment({ batchId, ...parse(CreateShipmentRequestSchema, req.body) }, actor);
  return shipmentOf(await api.getBatch({ batchId }, actor), created.shipmentId);
}

export async function createReceipt(api: FollowUpApi, req: FastifyRequest): Promise<ReceiptView> {
  const actor = requireActor(req);
  const batchId = deliveryBatchIdOf(req);
  const created = await api.recordReceipt({ batchId, ...parse(CreateReceiptRequestSchema, req.body) }, actor);
  return receiptOf(await api.getBatch({ batchId }, actor), created.receiptId);
}

export async function voidRecord({ api, kind, req }: { readonly api: FollowUpApi; readonly kind: 'shipment' | 'receipt' | 'delivery_note'; readonly req: FastifyRequest }) {
  const actor = requireActor(req);
  const recordId = entityIdOf(req);
  const batchId = await api.findBatchId(kind, recordId);
  await api.voidRecord({ kind, recordId, reason: parse(ReasonRequestSchema, req.body).reason }, actor);
  return recordOf({ batch: await api.getBatch({ batchId }, actor), kind, id: recordId });
}

export async function adoptShipment(api: FollowUpApi, req: FastifyRequest): Promise<ShipmentView> {
  const actor = requireActor(req);
  const input = { rowId: parse(RowParams, req.params).rowId, ...parse(AdoptShipmentRequestSchema, req.body) };
  const created = await api.adopt(input, actor);
  return shipmentOf(await api.getBatch({ batchId: input.batchId }, actor), created.shipmentId);
}

export function readLatestNotes(api: FollowUpApi, req: FastifyRequest) {
  return api.latestNotes(parse(LatestNotesRequestSchema, req.body), requireActor(req));
}

export async function createFollowUp(api: FollowUpApi, req: FastifyRequest): Promise<FollowUpView> {
  const actor = requireActor(req);
  const created = await api.followUp(parse(CreateFollowUpRequestSchema, req.body), actor);
  return followOf(await api.getDetail({ lineId: parse(CreateFollowUpRequestSchema, req.body).orderLineId }, actor), created.followUpId);
}

export async function openException(api: FollowUpApi, req: FastifyRequest): Promise<ExceptionView> {
  const actor = requireActor(req);
  const body = parse(CreateExceptionRequestSchema, req.body);
  const created = await api.openException(body, actor);
  return exceptionOf(await api.getDetail({ lineId: body.orderLineId }, actor), created.exceptionId);
}

export async function closeException(api: FollowUpApi, req: FastifyRequest): Promise<ExceptionView> {
  const actor = requireActor(req);
  const exceptionId = entityIdOf(req);
  const lineId = await api.exceptionLineId(exceptionId);
  await api.closeException({ exceptionId, closeNote: parse(CloseExceptionRequestSchema, req.body).closeNote }, actor);
  return exceptionOf(await api.getDetail({ lineId }, actor), exceptionId);
}

export function assignBody(req: FastifyRequest) {
  return parse(AssignLinesRequestSchema, req.body);
}

export function hintBody(req: FastifyRequest) {
  return parse(HintBatchesRequestSchema, req.body);
}

export function bulkBody(req: FastifyRequest) {
  return parse(BulkFollowUpRequestSchema, req.body);
}

export function generateBody(req: FastifyRequest) {
  return parse(GenerateBatchesRequestSchema, req.body);
}

function shipmentOf(batch: BatchView, id: string): ShipmentView {
  const found = batch.shipments.find((row) => row.id === id);
  if (found === undefined) throw new HttpError({ code: 'NOT_FOUND', message: '发货记录不存在', details: { entity: '发货记录', id } });
  return found;
}

function receiptOf(batch: BatchView, id: string): ReceiptView {
  const found = batch.receipts.find((row) => row.id === id);
  if (found === undefined) throw new HttpError({ code: 'NOT_FOUND', message: '收货记录不存在', details: { entity: '收货记录', id } });
  return found;
}

function recordOf({ batch, kind, id }: { readonly batch: BatchView; readonly kind: 'shipment' | 'receipt' | 'delivery_note'; readonly id: string }): ShipmentView | ReceiptView | DeliveryNoteView {
  if (kind === 'shipment') return shipmentOf(batch, id);
  if (kind === 'receipt') return receiptOf(batch, id);
  if (batch.deliveryNote === null || batch.deliveryNote.id !== id) throw new HttpError({ code: 'NOT_FOUND', message: '送货单不存在', details: { entity: '送货单', id } });
  return batch.deliveryNote;
}

function followOf(detail: Awaited<ReturnType<FollowUpApi['getDetail']>>, id: string): FollowUpView {
  const found = detail.followUps.find((row) => row.id === id);
  if (found === undefined) throw new HttpError({ code: 'NOT_FOUND', message: '跟进不存在', details: { entity: '跟进', id } });
  return found;
}

function exceptionOf(detail: Awaited<ReturnType<FollowUpApi['getDetail']>>, id: string): ExceptionView {
  const found = detail.exceptions.find((row) => row.id === id);
  if (found === undefined) throw new HttpError({ code: 'NOT_FOUND', message: '异常不存在', details: { entity: '异常', id } });
  return found;
}
