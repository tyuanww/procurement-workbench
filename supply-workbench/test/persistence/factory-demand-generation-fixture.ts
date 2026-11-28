import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { systemIds } from '../../apps/server/src/system/ids.js';
import { entityId, localDate, orderLineId, parsePoCell } from '../../packages/domain/src/index.js';
import { createDb, type AppDatabase, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { followUpQueries } from '../../packages/persistence/src/queries/follow-up/index.js';
import { requireDatabase } from '../../packages/persistence/src/require-database.js';
import { auditRepository } from '../../packages/persistence/src/repositories/audit-log.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { factoryReportRepository } from '../../packages/persistence/src/repositories/factory-reports.js';
import { importBatchRepository } from '../../packages/persistence/src/repositories/import-batches.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { purchaseOrderRepository } from '../../packages/persistence/src/repositories/purchase-orders.js';
import { createUnitOfWork } from '../../packages/persistence/src/unit-of-work.js';
import { aFactoryStockRow, anActor, anOrderLine, aPurchaseOrder, FixedClock } from '../../packages/testkit/src/index.js';

export const url = process.env.SW_PG_URL;
export const clock = new FixedClock('2026-11-28T00:00:00.000Z');
export const slot = { index: 0, date: localDate('2026-11-24'), qty: 50 };
export const rawCells = { dateRaw: '2026/11/24', qtyRaw: '050.00' };
export const wait = { timeout: 4000, interval: 25 };

type Hooks = { readonly afterOriginRead?: () => Promise<void>; readonly afterDemandSave?: () => Promise<void> };

export function writes(db: AppDatabase, hooks: Hooks = {}) {
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

export async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
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

export async function seedLine({ db, sample, id }: { readonly db: AppDatabase; readonly sample: Sample; readonly id: ReturnType<typeof orderLineId> }): Promise<void> {
  const parsed = parsePoCell(sample.poRaw).value;
  await purchaseOrderRepository(db).save(aPurchaseOrder({
    id: sample.orderId, poRaw: sample.poRaw, poNorm: parsed.poNorm, poFormat: parsed.poFormat, lane: 'material',
  }));
  await orderLineRepository(db).save(anOrderLine({ id, purchaseOrderId: sample.orderId, lane: 'material', itemCodeRaw: sample.code }));
}

export async function onlyLineDetail(db: AppDatabase, code: string) {
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
    delete from delivery_batches where order_line_id in (select id from order_lines where item_code_raw = '${sample.code}');
    delete from line_factory_links where order_line_id = '${sample.lineId}';
    delete from order_lines where item_code_raw = '${sample.code}' or id = '${sample.id}-other';
    delete from purchase_orders where lower(po_raw) = lower('${sample.poRaw}');
    delete from factory_material_demand_rows where id in ('${sample.id}', '${sample.id}-second');
    delete from import_batches where id = '${sample.importId}';
  `);
}

export async function blockedOnPostgres(observer: AppHandle, applicationName: string): Promise<boolean> {
  // applicationName 含固定前缀和本次测试 UUID。
  const result = await observer.exec(`select exists (
    select 1 from pg_stat_activity where datname = current_database() and application_name = '${applicationName}'
      and cardinality(pg_blocking_pids(pid)) > 0
  ) as waiting`);
  return typeof result === 'object' && result !== null && 'rows' in result
    && Array.isArray(result.rows) && result.rows[0]?.waiting === true;
}

export function gate() {
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

export function settled<T>(result: Promise<T>) {
  let isDone = false;
  const setDone = () => { isDone = true; };
  void result.then(setDone, setDone);
  return { result, isDone: () => isDone };
}
