import { expect, it } from 'vitest';
import { WeeklyReportDataSchema } from '../../packages/contracts/src/index.js';
import { packWeekly, unpackWeekly } from '../../packages/application/src/reporting/policies/stored-weekly.js';
import {addDays, localDate, weekStart, type KpiBatch, entityId} from '../../packages/domain/src/index.js';
import { makeExportWeeklyReport, makeGenerateWeeklyReport, makeGetWeeklyReport, makePublishWeeklyReportToFeishu } from '../../packages/application/src/reporting/index.js';
import { assembleWeeklyReport } from '../../packages/application/src/reporting/policies/assemble-weekly-report.js';
import type { PerformanceFacts } from '../../packages/application/src/ports/performance-read-model.js';
import type { ReportRenderer } from '../../packages/application/src/ports/report-renderer.js';
import { FeishuNotConfiguredError } from '../../packages/application/src/shared/errors.js';
import { anActor, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

const monday = weekStart(localDate('2026-10-12'));
const at = '2026-10-12T01:00:00.000Z';

function batch(id: string, date: string): KpiBatch {
  return {
    id: entityId(id),
    status: 'confirmed',
    lane: 'finished',
    firstConfirmedDate: localDate(date),
    dateBuyerConfirmed: localDate(date),
    statusChangedAt: `${date}T00:00:00.000Z`,
    cancelledAt: null,
    closedAt: null,
    buyerUserId: entityId('buyer-1'),
    supplierPartyId: entityId('supplier'),
    receiverPartyId: entityId('warehouse'),
    receipts: [],
    shipments: [],
    noteReturnedOn: null,
  };
}

function facts(batches: readonly KpiBatch[]): PerformanceFacts {
  return {
    kpi: { today: localDate('2026-10-12'), from: monday, to: addDays(monday, 6), batches, lines: [], dateChanges: [], exceptions: [] },
    followUps: [],
    partyNames: { supplier: '宜侬' },
    buyerNames: { 'buyer-1': '样例采购员' },
    batchLabels: { late: { poRaw: 'PO1', nameRaw: '面膜', orderLineId: 'line-1' } },
    linkedFactoryOrderLineIds: new Set<string>(),
    unlinkedFactoryOrderLineIds: new Set<string>(),
    openExceptionOrderLineIds: new Set<string>(),
    pendingSupplierAliasOrderLineIds: new Set<string>(),
    bomMissingOrderLineIds: new Set<string>(),
  };
}

it('周报把已知和未归属的供应商事件分别冻结', () => {
  const known = batch('known', '2026-10-13');
  const unknown = { ...batch('unknown', '2026-10-13'), supplierPartyId: null };
  const loaded = facts([known, unknown]);
  const input = { ...loaded, kpi: { ...loaded.kpi, dateChanges: [
    { field: 'dateBuyerConfirmed' as const, changedAt: at, isFirstSet: false, supplierPartyId: known.supplierPartyId },
    { field: 'dateBuyerConfirmed' as const, changedAt: at, isFirstSet: false },
  ], exceptions: [
    { status: 'open' as const, openedAt: at, closedAt: null, supplierPartyId: known.supplierPartyId },
    { status: 'open' as const, openedAt: at, closedAt: null },
    { status: 'open' as const, openedAt: at, closedAt: null, supplierPartyId: entityId('exception-only') },
  ] } };
  const report = WeeklyReportDataSchema.parse(assembleWeeklyReport({ weekStart: monday, facts: input, previous: null, sources: [] }));
  expect(report.suppliers.find((row) => row.partyId === known.supplierPartyId)).toMatchObject({ dateChanges: { numerator: 1 }, openExceptions: { numerator: 1 } });
  expect(report.suppliers.find((row) => row.partyId === 'exception-only')).toMatchObject({ dueBatches: { numerator: 0 }, openExceptions: { numerator: 1 } });
  expect(report.supplierUnassigned).toEqual({ dateChanges: 1, openExceptions: 1 });
});

it('不是周一开始就拒绝，没有上一周时不给出变化值', async () => {
  const memory = createMemory();
  const clock = new FixedClock(at);
  const generate = makeGenerateWeeklyReport({
    uow: memory.unitOfWork,
    clock,
    ids: new SequentialIds(),
    performance: { load: async () => facts([]), stuck: unused, suppliers: unused, buyers: unused },
    freshness: { load: async () => ({ sources: [] }) },
  });
  await expect(generate({ weekStart: addDays(monday, 1) }, anActor('manager'))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const assembled = assembleWeeklyReport({ weekStart: monday, facts: facts([]), previous: null, sources: [] });
  expect(assembled.overview.dueBatches.previous).toBeNull();
  expect(assembled.overview.onTime.previous).toBeNull();
  expect(assembled.overview.overdue.previous).toBeNull();
});

it('生成后数据冻结，重新生成把旧版本标成已被替代', async () => {
  const memory = createMemory();
  let batches = [batch('late', '2026-10-06')];
  const generate = makeGenerateWeeklyReport({
    uow: memory.unitOfWork,
    clock: new FixedClock(at),
    ids: new SequentialIds(),
    performance: { load: async () => facts(batches), stuck: unused, suppliers: unused, buyers: unused },
    freshness: { load: async () => ({ sources: [{ template: 'po-master-v1', factoryPartyId: null, label: '总表', lastCommittedAt: null, fileModifiedAt: null }] }) },
  });
  const first = await generate({ weekStart: monday }, anActor('manager'));
  const frozen = await makeGetWeeklyReport({ reports: memory.stores.weeklyReports })({ reportId: first.reportId }, anActor('manager'));
  batches = [];
  const again = await makeGetWeeklyReport({ reports: memory.stores.weeklyReports })({ reportId: first.reportId }, anActor('manager'));
  expect(again.data.overview.dueBatches.value).toBe(frozen.data.overview.dueBatches.value);
  expect(again.data.notes.basedOnWorkbenchRecords).toBe(true);
  const second = await generate({ weekStart: monday }, anActor('manager'));
  expect((await memory.stores.weeklyReports.get(first.reportId)).supersededBy).toBe(second.reportId);
});

it('有上一周时算出变化，导出把冻结数据交给渲染器', async () => {
  const memory = createMemory();
  const ids = new SequentialIds();
  const clock = new FixedClock(at);
  const generate = makeGenerateWeeklyReport({
    uow: memory.unitOfWork,
    clock,
    ids,
    performance: { load: async () => facts([batch('late', '2026-10-06')]), stuck: unused, suppliers: unused, buyers: unused },
    freshness: { load: async () => ({ sources: [] }) },
  });
  const previousId = await generate({ weekStart: previousMonday(monday) }, anActor('manager'));
  const currentId = await generate({ weekStart: monday }, anActor('manager'));
  const current = await makeGetWeeklyReport({ reports: memory.stores.weeklyReports })({ reportId: currentId.reportId }, anActor('manager'));
  const previous = await makeGetWeeklyReport({ reports: memory.stores.weeklyReports })({ reportId: previousId.reportId }, anActor('manager'));
  expect(current.data.overview.dueBatches.previous).toBe(previous.data.overview.dueBatches.value);
  let rendered: unknown;
  const renderer: ReportRenderer = {
    format: 'pdf',
    render: async (data) => {
      rendered = data;
      return new Uint8Array([1]);
    },
  };
  const exported = await makeExportWeeklyReport({
    reports: memory.stores.weeklyReports,
    renderers: [renderer],
    files: memory.files,
    ids,
    uow: memory.unitOfWork,
    clock,
  })({ reportId: currentId.reportId, format: 'pdf' }, anActor('manager'));
  expect(rendered).toEqual(current.data);
  expect(exported.fileName).toContain(monday);
});

it('飞书没配置时不返回空链接', async () => {
  const memory = createMemory();
  const generate = makeGenerateWeeklyReport({
    uow: memory.unitOfWork,
    clock: new FixedClock(at),
    ids: new SequentialIds(),
    performance: { load: async () => facts([]), stuck: unused, suppliers: unused, buyers: unused },
    freshness: { load: async () => ({ sources: [] }) },
  });
  const created = await generate({ weekStart: monday }, anActor('manager'));
  const publish = makePublishWeeklyReportToFeishu({
    reports: memory.stores.weeklyReports,
    publisher: { publish: async () => { throw new FeishuNotConfiguredError(); } },
    uow: memory.unitOfWork,
    clock: new FixedClock(at),
  });
  await expect(publish({ reportId: created.reportId }, anActor('manager'))).rejects.toMatchObject({ code: 'FEISHU_NOT_CONFIGURED' });
});

it('周内发生的异常计入新增，周外的不算', () => {
  const week = facts([]);
  const withEvents = {
    ...week,
    kpi: {
      ...week.kpi,
      exceptions: [
        { status: 'open' as const, openedAt: `${monday}T00:00:00.000Z`, closedAt: null },
        { status: 'closed' as const, openedAt: '2026-09-01T00:00:00.000Z', closedAt: `${monday}T00:00:00.000Z` },
      ],
    },
  };
  const report = assembleWeeklyReport({ weekStart: monday, facts: withEvents, previous: null, sources: [] });
  expect(report.overview.exceptionsOpened).toBe(1);
  expect(report.exceptions.closed).toBe(1);
});

it('完整周报能按原样读回并通过契约，缺字段的旧对象读不出来', async () => {
  const memory = createMemory();
  const created = await makeGenerateWeeklyReport({
    uow: memory.unitOfWork,
    clock: new FixedClock(at),
    ids: new SequentialIds(),
    performance: { load: async () => facts([batch('late', '2026-10-06')]), stuck: unused, suppliers: unused, buyers: unused },
    freshness: { load: async () => ({ sources: [{ template: 'po-master-v1', factoryPartyId: null, label: '总表', lastCommittedAt: null, fileModifiedAt: null }] }) },
  })({ weekStart: monday }, anActor('manager'));
  const loaded = await makeGetWeeklyReport({ reports: memory.stores.weeklyReports })({ reportId: created.reportId }, anActor('manager'));
  const stored = packWeekly({ report: loaded.data, generatedByName: '经理', exports: [] });
  const roundTrip = unpackWeekly(JSON.parse(JSON.stringify(stored)));
  expect(roundTrip).toEqual(stored);
  expect(WeeklyReportDataSchema.safeParse(roundTrip?.report).success).toBe(true);
  expect(unpackWeekly({ report: {}, generatedByName: '经理', exports: [] })).toBeNull();
});

function previousMonday(start: ReturnType<typeof localDate>) {
  return addDays(start, -7);
}

function unused(): never {
  throw new Error('周报不应调用已经算好的看板');
}
