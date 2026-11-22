import { localDate } from '../../packages/domain/src/index.js';
import type { ManagementMeetingSnapshot, MeetingMaterial } from '../../packages/application/src/reporting/management-meeting.js';

const monday = localDate('2026-11-16');
const friday = localDate('2026-11-20');
const at = '2026-11-20T08:00:00.000Z';
const buyer = { id: 'buyer', name: '采购经办' };
const manager = { id: 'manager', name: '周会负责人' };

export const meetingMaterial = {
  materialLineId: 'material-1', name: '周会盖子', code: 'CAP-1', poRef: 'PO-2401', unit: '个', orderedQty: 100,
  source: { importBatchId: 'batch-1', sheetName: '采购进度表', rowNo: 42 },
  sourceReportedProgress: '仓库等补齐盖子', sourceReportedQty: 25, sourceReportedGap: 75,
  verifiedShippedQty: 20, verifiedReceivedQty: 10, quantityNeedsReview: true,
  waitingOn: ['receiver'], buyerName: buyer.name, supplierName: '工厂', receiverName: '收货仓',
  affectedFinished: [{ id: 'finished-1', name: '成品水', oaRef: 'XPKA(CN)1005' }],
  batches: [{
    id: 'batch-1', seq: 1, previousPromise: { date: friday, recordedAt: at, source: 'change' },
    previousPromiseText: { text: '工厂承诺补齐盖子', recordedAt: at },
    currentPromise: friday, factoryRequired: friday, confirmedArrival: friday, waitingOn: ['receiver'],
  }],
} satisfies MeetingMaterial;

export const closedShortMaterial = {
  ...meetingMaterial,
  batches: meetingMaterial.batches.map((batch) => ({ ...batch, waitingOn: ['none'] as const })),
} satisfies MeetingMaterial;

export const meeting = {
  store: 'store_a', weekStart: monday, weekEnd: localDate('2026-11-22'), previousWeekStart: localDate('2026-11-09'),
  materials: [meetingMaterial],
  development: [{
    id: 'node-1', name: '送中试原料', projectName: '新品中试', plannedEnd: friday,
    destination: 'factory', ownerName: buyer.name, latestReply: { text: '周五到工厂', recordedAt: at },
  }],
  decisions: [{
    id: 'decision-1', store: 'store_a', weekStart: monday, materialLineId: meetingMaterial.materialLineId,
    decision: '货齐后复查', owner: buyer, dueDate: friday, recordedAt: at, decidedBy: manager,
    completionCriteria: '核对点收依据', completion: { evidence: '点收完成回执', at, by: buyer },
  }],
} satisfies ManagementMeetingSnapshot;
