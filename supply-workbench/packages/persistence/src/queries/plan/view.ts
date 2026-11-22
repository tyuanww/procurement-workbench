import type { WorkItemView } from '../../../../application/src/ports/plan-views.js';
import { localDate } from '../../../../domain/src/values/local-date.js';
import {
  COUNTERPARTY_ROLES,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_SOURCES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_SUBJECT_TYPES,
} from '../../../../domain/src/entities/work-items.js';
import { oneOf } from '../follow-up/guards.js';
import type { JoinedRow } from './query.js';

export function toWorkItemView(row: JoinedRow): WorkItemView {
  const role = row.counterpartyRole === null ? null : oneOf(COUNTERPARTY_ROLES, row.counterpartyRole);
  const isSupplier = role === 'supplier';
  const isFactory = role === 'factory';
  return {
    id: row.id,
    subjectType: oneOf(WORK_ITEM_SUBJECT_TYPES, row.subjectType),
    subjectId: row.subjectId,
    kind: oneOf(WORK_ITEM_KINDS, row.kind),
    title: row.title,
    ownerUserId: row.ownerUserId,
    ownerName: row.ownerName,
    counterpartyPartyId: row.counterpartyPartyId,
    counterpartyRole: role,
    counterpartyName: row.counterpartyName,
    plannedStart: localDate(row.plannedStart),
    plannedEnd: localDate(row.plannedEnd),
    status: oneOf(WORK_ITEM_STATUSES, row.status),
    priority: oneOf(WORK_ITEM_PRIORITIES, row.priority),
    source: oneOf(WORK_ITEM_SOURCES, row.source),
    parentId: row.parentId,
    version: row.version,
    overdueDays: null,
    orderLine: row.lineId === null ? null : { id: row.lineId, poRaw: row.poRaw, nameRaw: row.lineName, itemCodeRaw: row.lineItemCode, supplierPartyId: row.lineSupplierPartyId },
    batch: batchOf(row),
    supplierPartyId: isSupplier ? row.counterpartyPartyId : row.lineSupplierPartyId,
    supplierName: isSupplier ? row.counterpartyName : row.supplierName,
    factoryPartyId: isFactory ? row.counterpartyPartyId : null,
    factoryName: isFactory ? row.counterpartyName : null,
  };
}

function batchOf(row: JoinedRow): WorkItemView['batch'] {
  if (row.batchId === null || row.batchSeq === null || row.batchOrderLineId === null) return null;
  return { id: row.batchId, seq: row.batchSeq, orderLineId: row.batchOrderLineId };
}
