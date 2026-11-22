import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BatchViewSchema, ExceptionViewSchema, ExportConfirmedArrivalsRequestSchema, FollowUpViewSchema, HintBatchResultSchema, LineOwnerOptionsSchema, LineSummarySchema, OrderLineDetailSchema, ReceiptViewSchema, ShipmentViewSchema, UpdatedCountSchema } from '@sw/contracts';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';
import type { FollowUpApi } from './api.js';
import {
  adoptShipment,
  assignBody,
  batchReason,
  bulkBody,
  closeException,
  createBatch,
  createFollowUp,
  createLine,
  createReceipt,
  createShipment,
  generateBody,
  hintBody,
  deliveryBatchIdOf,
  entityIdOf,
  orderLineIdOf,
  lineReason,
  noContent,
  openException,
  readLatestNotes,
  updateBatch,
  updateLine,
  voidRecord,
} from './commands.js';
import { registerArrivalRoutes } from './arrivals.js';
import { registerDeliveryNote } from './delivery-note.js';
import { detailStoreOf, exportRequestOf, listQueryOf } from './query.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function registerFollowUpRoutes({ app, api, attachmentMaxBytes }: { readonly app: FastifyInstance; readonly api: FollowUpApi; readonly attachmentMaxBytes: number }): void {
  registerLines(app, api);
  registerBatches(app, api);
  registerRecords(app, api);
  registerArrivalRoutes(app, api.arrivals);
  registerDeliveryNote({ app, api, attachmentMaxBytes });
}

function registerLines(app: FastifyInstance, api: FollowUpApi): void {
  app.get('/api/v1/lines/export.xlsx', async (req, reply) => sendExport({ api, req, reply }));
  app.get('/api/v1/lines', async (req) => api.listLines(listQueryOf(req.query, requireActor(req).id), requireActor(req)));
  app.get('/api/v1/lines/owner-options', async (req) => wire(LineOwnerOptionsSchema, await api.listLineOwners(requireActor(req))));
  app.get('/api/v1/lines/summary', async (req) => wire(LineSummarySchema, await api.summarizeLines(listQueryOf(req.query, requireActor(req).id))));
  app.post('/api/v1/lines', async (req) => wire(OrderLineDetailSchema, await createLine(api, req)));
  app.post('/api/v1/lines/bulk/assign', async (req) => wire(UpdatedCountSchema, await api.assignLines(assignBody(req), requireActor(req))));
  app.post('/api/v1/lines/bulk/hint-batches', async (req) => wire(HintBatchResultSchema, await api.hintBatches(hintBody(req), requireActor(req))));
  app.post('/api/v1/lines/bulk/confirmed-arrival.xlsx', async (req, reply) => sendConfirmedArrivalExport({ api, req, reply }));
  app.get('/api/v1/lines/:id', async (req) => wire(OrderLineDetailSchema, await api.getDetail({ lineId: orderLineIdOf(req), ...detailStoreOf(req.query) }, requireActor(req))));
  app.patch('/api/v1/lines/:id', async (req) => wire(OrderLineDetailSchema, await updateLine(api, req)));
  app.post('/api/v1/lines/:id/cancel', async (req) => lineReason({ api, command: api.cancelLine, req }));
  app.post('/api/v1/lines/:id/reopen', async (req) => lineReason({ api, command: api.reopenLine, req }));
  app.get('/api/v1/lines/:id/timeline', async (req) => timelineOf(api, req));
  app.post('/api/v1/lines/:id/batches', async (req) => wire(BatchViewSchema, await createBatch(api, req)));
}

function registerBatches(app: FastifyInstance, api: FollowUpApi): void {
  app.patch('/api/v1/batches/:id', async (req) => wire(BatchViewSchema, await updateBatch(api, req)));
  app.delete('/api/v1/batches/:id', async (req, reply) => { await api.deleteBatch({ batchId: deliveryBatchIdOf(req) }, requireActor(req)); return noContent(reply); });
  app.post('/api/v1/batches/:id/close', async (req) => batchReason({ api, command: api.closeBatch, req }));
  app.post('/api/v1/batches/:id/cancel', async (req) => batchReason({ api, command: api.cancelBatch, req }));
  app.post('/api/v1/batches/:id/reopen', async (req) => batchReason({ api, command: api.reopenBatch, req }));
  app.post('/api/v1/batches/:id/shipments', async (req) => wire(ShipmentViewSchema, await createShipment(api, req)));
  app.post('/api/v1/batches/:id/receipts', async (req) => wire(ReceiptViewSchema, await createReceipt(api, req)));
}

function registerRecords(app: FastifyInstance, api: FollowUpApi): void {
  app.delete('/api/v1/shipments/:id', async (req, reply) => undo({ api, kind: 'shipment', req, reply }));
  app.delete('/api/v1/receipts/:id', async (req, reply) => undo({ api, kind: 'receipt', req, reply }));
  app.delete('/api/v1/delivery-notes/:id', async (req, reply) => undo({ api, kind: 'delivery_note', req, reply }));
  app.post('/api/v1/shipments/:id/void', async (req) => wire(ShipmentViewSchema, await voidRecord({ api, kind: 'shipment', req })));
  app.post('/api/v1/receipts/:id/void', async (req) => wire(ReceiptViewSchema, await voidRecord({ api, kind: 'receipt', req })));
  app.post('/api/v1/delivery-notes/:id/void', async (req) => voidRecord({ api, kind: 'delivery_note', req }));
  app.post('/api/v1/factory-reports/shipment-rows/:rowId/adopt', async (req) => wire(ShipmentViewSchema, await adoptShipment(api, req)));
  app.post('/api/v1/factory-reports/demand-rows/generate-batches', async (req) => api.generateBatches(generateBody(req), requireActor(req)));
  app.post('/api/v1/follow-ups', async (req) => wire(FollowUpViewSchema, await createFollowUp(api, req)));
  app.post('/api/v1/follow-ups/bulk', async (req) => api.followUps(bulkBody(req), requireActor(req)));
  app.post('/api/v1/follow-ups/latest-notes', async (req) => readLatestNotes(api, req));
  app.delete('/api/v1/follow-ups/:id', async (req, reply) => undo({ api, kind: 'follow_up', req, reply }));
  app.post('/api/v1/exceptions', async (req) => wire(ExceptionViewSchema, await openException(api, req)));
  app.post('/api/v1/exceptions/:id/close', async (req) => closeException(api, req));
  app.delete('/api/v1/exceptions/:id', async (req, reply) => undo({ api, kind: 'exception', req, reply }));
}

async function undo(input: { readonly api: FollowUpApi; readonly kind: 'shipment' | 'receipt' | 'delivery_note' | 'follow_up' | 'exception'; readonly req: FastifyRequest; readonly reply: FastifyReply }) {
  await input.api.undo({ kind: input.kind, recordId: entityIdOf(input.req) }, requireActor(input.req));
  return noContent(input.reply);
}

async function sendExport({ api, req, reply }: { readonly api: FollowUpApi; readonly req: FastifyRequest; readonly reply: FastifyReply }) {
  const file = await api.exportLines(exportRequestOf(req.query, requireActor(req).id), requireActor(req));
  return reply.header('content-type', XLSX).header('content-disposition', `attachment; filename="${file.fileName}"`).send(Buffer.from(file.bytes));
}

async function sendConfirmedArrivalExport({ api, req, reply }: { readonly api: FollowUpApi; readonly req: FastifyRequest; readonly reply: FastifyReply }) {
  const file = await api.exportConfirmedArrivals(parse(ExportConfirmedArrivalsRequestSchema, req.body), requireActor(req));
  return reply.header('content-type', XLSX)
    .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
    .send(Buffer.from(file.bytes));
}

function timelineOf(api: FollowUpApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const lineId = orderLineIdOf(req);
  const cursor = cursorOf(req);
  return api.timeline(cursor === undefined ? { lineId } : { lineId, cursor }, actor);
}

function cursorOf(req: FastifyRequest): string | undefined {
  const query = req.query;
  if (typeof query !== 'object' || query === null || !('cursor' in query)) return undefined;
  return typeof query.cursor === 'string' && query.cursor !== '' ? query.cursor : undefined;
}
