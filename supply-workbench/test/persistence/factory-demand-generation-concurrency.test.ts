import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { systemIds } from '../../apps/server/src/system/ids.js';
import { makeGenerateBatchesFromDemand } from '../../packages/application/src/follow-up/index.js';
import { makeLinkFactoryRow } from '../../packages/application/src/master-data/index.js';
import { linkIdOf, linkOf } from '../../packages/application/src/shared/factory-link.js';
import { entityId, localDate, orderLineId, parsePoCell } from '../../packages/domain/src/index.js';
import { createDb, type AppDatabase, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { followUpQueries } from '../../packages/persistence/src/queries/follow-up/index.js';
import { requireDatabase } from '../../packages/persistence/src/require-database.js';
import { auditRepository } from '../../packages/persistence/src/repositories/audit-log.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { factoryReportRepository } from '../../packages/persistence/src/repositories/factory-reports.js';
import { importBatchRepository } from '../../packages/persistence/src/repositories/import-batches.js';
import { lineFactoryLinkRepository } from '../../packages/persistence/src/repositories/line-factory-links.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { purchaseOrderRepository } from '../../packages/persistence/src/repositories/purchase-orders.js';
import { createUnitOfWork } from '../../packages/persistence/src/unit-of-work.js';
import { aFactoryStockRow, anActor, anOrderLine, aPurchaseOrder, FixedClock } from '../../packages/testkit/src/index.js';

const url = process.env.SW_PG_URL;
const clock = new FixedClock('2026-11-28T00:00:00.000Z');
const slot = { index: 0, date: localDate('2026-11-24'), qty: 50 };
const rawCells = { dateRaw: '2026/11/24', qtyRaw: '050.00' };
const wait = { timeout: 4000, interval: 25 };

it.skipIf(url === undefined).each([true, false])('真实 PostgreSQL 需求槽并发生成只提交一份凭据（目标订单已存在 %s）', async (existing) => {
  await withFixture(async ({ main, competing, applicationName, sample }) => {
    if (existing) await seedLine({ db: main.db, sample, id: sample.lineId });
    const paused = gate();
    const first = makeGenerateBatchesFromDemand(writes(main.db, { afterOriginRead: paused.hold }));
    const second = makeGenerateBatchesFromDemand(writes(competing.db));
    const request = { rowIds: [sample.id] };
    const holding = first(request, sample.buyer);
    let other: ReturnType<typeof second> | undefined;
    try {
      await Promise.race([paused.entered, holding]);
      const running = settled(second(request, sample.buyer));
      other = running.result;
      await expect.poll(() => running.isDone() || blockedOnPostgres(main, applicationName), wait).toBe(true);
    } finally {
      paused.release();
      await Promise.allSettled(other === undefined ? [holding] : [holding, other]);
    }
    expect(await holding).toEqual({ createdLines: existing ? 0 : 1, createdBatches: 1, skipped: [] });
    expect(await other).toEqual({ createdLines: 0, createdBatches: 0,
      skipped: [{ rowId: sample.id, slotIndex: 0, reason: '已经生成过批次' }] });
    const detail = await onlyLineDetail(main.db, sample.code);
    expect(detail.batches).toMatchObject([{ plannedQty: slot.qty, dateFactoryRequired: slot.date }]);
    const sources = Object.values(detail.batchDemandSources ?? {});
    expect(sources).toMatchObject([{ importBatchId: sample.importId, slot: { originalCells: rawCells } }]);
  });
}, 15000);

it.skipIf(url === undefined)('真实 PostgreSQL 重联持有写锁时仍生成业务批次，原表保留待核对', async () => {
  await withFixture(async ({ main, competing, sample }) => {
    const target = sample.lineId;
    const other = orderLineId(`${sample.id}-other`);
    await seedLine({ db: main.db, sample, id: target });
    await orderLineRepository(main.db).save(anOrderLine({ id: other, purchaseOrderId: sample.orderId, lane: 'material' }));
    const generationRead = gate();
    const relinkWrite = gate();
    const generate = makeGenerateBatchesFromDemand(writes(main.db, { afterOriginRead: generationRead.hold }));
    const link = makeLinkFactoryRow(writes(competing.db, { afterDemandSave: relinkWrite.hold }));
    const generated = settled(generate({ rowIds: [sample.id] }, sample.buyer));
    let linked: ReturnType<typeof link> | undefined;
    try {
      await Promise.race([generationRead.entered, generated.result]);
      linked = link({ table: 'demand', rowId: sample.id, orderLineId: other }, sample.reviewer);
      void linked.catch(() => undefined);
      await expect.poll(relinkWrite.hasEntered, wait).toBe(true);
      generationRead.release();
      await expect.poll(generated.isDone, wait).toBe(true);
      expect(await generated.result).toEqual({ createdLines: 0, createdBatches: 1, skipped: [] });
    } finally {
      generationRead.release();
      relinkWrite.release();
      await Promise.allSettled(linked === undefined ? [generated.result] : [generated.result, linked]);
    }
    await linked;
    const before = await onlyLineDetail(main.db, sample.code);
    expect(before.batches).toMatchObject([{ plannedQty: slot.qty, dateFactoryRequired: slot.date }]);
    expect(before.batchDemandSources).toEqual({});
    expect(await main.exec(`select origin_ref from delivery_batches where origin_ref->>'rowId' = '${sample.id}'`))
      .toMatchObject({ rows: [{ origin_ref: { rowId: sample.id, slotIndex: 0, generationSource: null } }] });
    const linkAfterCommit = makeLinkFactoryRow(writes(competing.db));
    await linkAfterCommit({ table: 'demand', rowId: sample.id, orderLineId: target }, sample.reviewer);
    const after = await onlyLineDetail(main.db, sample.code);
    expect(after.factoryReports.demand).toMatchObject([{ id: sample.id, payload: { slots: [{ originalCells: rawCells }] } }]);
    expect(after.batchDemandSources).toEqual({});
  });
}, 15000);

it.skipIf(url === undefined).each([
  { qty: 100, qtyRaw: '0100.00' },
  { date: localDate('2026-11-25'), dateRaw: '2026/11/25' },
])('真实 PostgreSQL 原始槽和生成事实冲突时保留计划值，原表待核对（%j）', async (conflict) => {
  await withFixture(async ({ main, sample }) => {
    const reports = factoryReportRepository(main.db);
    const original = await reports.get(sample.id);
    await reports.save({ ...original, raw: { slots: [{ ...slot, ...rawCells, ...conflict }] } });
    const generated = await makeGenerateBatchesFromDemand(writes(main.db))({ rowIds: [sample.id] }, sample.buyer);
    expect(generated).toEqual({ createdLines: 1, createdBatches: 1, skipped: [] });
    const detail = await onlyLineDetail(main.db, sample.code);
    expect(detail.batches).toMatchObject([{ plannedQty: slot.qty, dateFactoryRequired: slot.date }]);
    expect(detail.batchDemandSources).toEqual({});
  });
}, 15000);

it.skipIf(url === undefined).each([true, false])('真实 PostgreSQL 未关联需求只为工厂归属兼容的订单保存原表（冲突 %s）', async (conflict) => {
  await withFixture(async ({ main, sample }) => {
    await seedLine({ db: main.db, sample, id: sample.lineId });
    const factoryId = conflict ? `${sample.factoryId}-other` : sample.factoryId;
    await lineFactoryLinkRepository(main.db).save(linkOf({
      id: linkIdOf(sample.lineId), at: clock.now(), orderLineId: sample.lineId,
      factoryPartyId: factoryId, source: 'manual', status: 'manual', confidence: 'manual',
    }));
    expect(await makeGenerateBatchesFromDemand(writes(main.db))({ rowIds: [sample.id] }, sample.buyer))
      .toEqual({ createdLines: 0, createdBatches: 1, skipped: [] });
    const detail = await onlyLineDetail(main.db, sample.code);
    expect(detail.line.factory).toMatchObject({ id: factoryId });
    expect(detail.batches).toMatchObject([{ plannedQty: slot.qty, dateFactoryRequired: slot.date }]);
    expect(Object.values(detail.batchDemandSources ?? {}))
      .toMatchObject(conflict ? [] : [{ importBatchId: sample.importId, slot: { originalCells: rawCells } }]);
  });
}, 15000);

it.skipIf(url === undefined).each(['raw', 'normalized'] as const)('真实 PostgreSQL 重复 %s 槽索引只影响生成凭据', async (repeated) => {
  await withFixture(async ({ main, sample }) => {
    const reports = factoryReportRepository(main.db);
    const original = await reports.get(sample.id);
    if (original.demand === null) throw new Error('缺少合成需求');
    const second = { ...slot, qty: 75, date: localDate('2026-11-25') };
    const rawSecond = { ...second, qtyRaw: '075.00', dateRaw: '2026/11/25' };
    await reports.save({ ...original,
      raw: { slots: repeated === 'raw' ? [{ ...slot, ...rawCells }, rawSecond] : [rawSecond] },
      demand: { ...original.demand, slots: repeated === 'normalized' ? [slot, second] : [slot] },
    });
    const skipped = repeated === 'normalized' ? [{ rowId: sample.id, slotIndex: 0, reason: '已经生成过批次' }] : [];
    expect(await makeGenerateBatchesFromDemand(writes(main.db))({ rowIds: [sample.id] }, sample.buyer))
      .toEqual({ createdLines: 1, createdBatches: 1, skipped });
    const detail = await onlyLineDetail(main.db, sample.code);
    expect(detail.batches).toMatchObject([{ plannedQty: slot.qty, dateFactoryRequired: slot.date }]);
    expect(detail.batchDemandSources).toEqual({});
  });
}, 15000);

type Hooks = { readonly afterOriginRead?: () => Promise<void>; readonly afterDemandSave?: () => Promise<void> };

function writes(db: AppDatabase, hooks: Hooks = {}) {
  const uow = createUnitOfWork(db, (transaction) => {
    const tx = requireDatabase(transaction);
    const batches = deliveryBatchRepository(tx);
    const reports = factoryReportRepository(tx);
    return {
      ...placeholderStores(),
      batches: {
        ...batches,
        async listByOriginRef(ref: { readonly rowId: string; readonly slotIndex: number }) {
          const found = await batches.listByOriginRef(ref);
          await hooks.afterOriginRead?.();
          return found;
        },
      },
      factoryReports: {
        ...reports,
        async save(row: Parameters<typeof reports.save>[0]) {
          await reports.save(row);
          await hooks.afterDemandSave?.();
        },
      },
      orderLines: orderLineRepository(tx),
      purchaseOrders: purchaseOrderRepository(tx),
      audit: auditRepository(tx),
    };
  });
  return { uow, clock, ids: systemIds() };
}

function sampleOf() {
  const token = randomUUID();
  return {
    id: entityId(token), lineId: orderLineId(token), importId: entityId(`demand-test-${token}`), factoryId: entityId(`demand-factory-${token}`),
    orderId: entityId(`demand-order-${token}`), code: `VERIFY-DEMAND-${token}`, poRaw: `DEMAND-PO-${token}`,
    buyer: { ...anActor('buyer'), id: entityId(`demand-buyer-${token}`) },
    reviewer: { ...anActor('reviewer'), id: entityId(`demand-reviewer-${token}`) },
  };
}

type Sample = ReturnType<typeof sampleOf>;
type Fixture = { readonly main: AppHandle; readonly competing: AppHandle; readonly applicationName: string; readonly sample: Sample };

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  if (url === undefined) throw new Error('需要一次性 PostgreSQL 库');
  const sample = sampleOf();
  const applicationName = `demand-test-${sample.id}`;
  const secondUrl = new URL(url);
  secondUrl.searchParams.set('application_name', applicationName);
  const main = await createDb({ driver: 'pg', url });
  const competing = await createDb({ driver: 'pg', url: secondUrl.href });
  try {
    await migrate(main.exec);
    try {
      await seedDemand(main.db, sample);
      await run({ main, competing, applicationName, sample });
    } finally {
      await clearSample(main, sample);
    }
  } finally {
    await Promise.all([main.close(), competing.close()]);
  }
}

async function seedDemand(db: AppDatabase, sample: Sample): Promise<void> {
  await importBatchRepository(db).save({
    id: sample.importId, fileId: sample.importId, template: 'factory-progress-v1', factoryPartyId: sample.factoryId,
    status: 'committed', createdAt: clock.now(), updatedAt: clock.now(), fileMeta: {}, stats: {}, decisions: {},
    committedBy: sample.buyer.id, committedAt: clock.now(), createdBy: sample.buyer.id, rolledBackAt: null, rolledBackBy: null, error: null,
  });
  await factoryReportRepository(db).save(aFactoryStockRow({
    id: sample.id, importBatchId: sample.importId, factoryPartyId: sample.factoryId, fingerprint: sample.id,
    kind: 'demand', sheetName: '11月排产包材原料需求表', rowNo: 4, linkReason: 'NO_CANDIDATE_LINE',
    raw: { slots: [{ ...slot, ...rawCells, sourceColumns: { date: 10, quantity: 11 } }] },
    demand: { role: 'material', blockMaterialPoRaw: sample.poRaw, poNorm: null, itemCodeRaw: sample.code, nameRaw: '合成包材', slots: [slot] },
  }));
}

async function seedLine({ db, sample, id }: { readonly db: AppDatabase; readonly sample: Sample; readonly id: ReturnType<typeof orderLineId> }): Promise<void> {
  const parsed = parsePoCell(sample.poRaw).value;
  await purchaseOrderRepository(db).save(aPurchaseOrder({
    id: sample.orderId, poRaw: sample.poRaw, poNorm: parsed.poNorm, poFormat: parsed.poFormat, lane: 'material',
  }));
  await orderLineRepository(db).save(anOrderLine({ id, purchaseOrderId: sample.orderId, lane: 'material', itemCodeRaw: sample.code }));
}

async function onlyLineDetail(db: AppDatabase, code: string) {
  const lines = await orderLineRepository(db).listByCodeNorm(code);
  expect(lines).toHaveLength(1);
  const [line] = lines;
  if (line === undefined) throw new Error('没有生成合成订单');
  return followUpQueries({ db, clock, timeZone: 'Asia/Shanghai' }).getDetail(line.id);
}

async function clearSample(handle: AppHandle, sample: Sample): Promise<void> {
  // 所有条件来自本次测试生成的 UUID，和同库的其他验证样本隔离。
  await handle.exec(`
    delete from audit_log where actor_user_id in ('${sample.buyer.id}', '${sample.reviewer.id}');
    delete from delivery_batches where origin_ref->>'rowId' = '${sample.id}';
    delete from line_factory_links where order_line_id = '${sample.lineId}';
    delete from order_lines where item_code_raw = '${sample.code}' or id = '${sample.id}-other';
    delete from purchase_orders where po_raw = '${sample.poRaw}';
    delete from factory_material_demand_rows where id = '${sample.id}';
    delete from import_batches where id = '${sample.importId}';
  `);
}

async function blockedOnPostgres(observer: AppHandle, applicationName: string): Promise<boolean> {
  // applicationName 含固定前缀和本次测试 UUID。
  const result = await observer.exec(`select exists (
    select 1 from pg_stat_activity where datname = current_database() and application_name = '${applicationName}'
      and cardinality(pg_blocking_pids(pid)) > 0
  ) as waiting`);
  return typeof result === 'object' && result !== null && 'rows' in result
    && Array.isArray(result.rows) && result.rows[0]?.waiting === true;
}

function gate() {
  let isEntered = false;
  let notify: () => void = () => {};
  let release: () => void = () => {};
  const enteredPromise = new Promise<void>((resolve) => { notify = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  return {
    entered: enteredPromise, hasEntered: () => isEntered, release,
    async hold() {
      isEntered = true;
      notify();
      await released;
    },
  };
}

function settled<T>(result: Promise<T>) {
  let isDone = false;
  const setDone = () => { isDone = true; };
  void result.then(setDone, setDone);
  return { result, isDone: () => isDone };
}
