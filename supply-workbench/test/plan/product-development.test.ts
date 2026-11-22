import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { composePlan } from '../../apps/server/src/composition/plan.js';
import { composeProductDevelopment } from '../../apps/server/src/composition/product-development.js';
import { composeReporting } from '../../apps/server/src/composition/reporting.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';
import { registerPlanRoutes } from '../../apps/server/src/http/plan/routes.js';
import { registerProductDevelopmentRoutes } from '../../apps/server/src/http/product-development/routes.js';
import { registerReportingRoutes } from '../../apps/server/src/http/reporting/routes.js';
import { devAuth } from '../../packages/auth/src/index.js';
import { ManagementMeetingSchema } from '../../packages/contracts/src/management-meeting.js';
import { ProductDevelopmentSchema } from '../../packages/contracts/src/product-development.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import { createDb, migrate, seed, userDirectory } from '../../packages/persistence/src/index.js';

const product = '0199f0a0-0000-7000-8000-000000000004';
const buyer = '0199f0a0-0000-7000-8000-000000000002';
const otherBuyer = '0199f0a0-0000-7000-8000-000000000003';
const manager = '0199f0a0-0000-7000-8000-000000000005';
const root = '/api/v1/product-development';

it('用同一未下单节点流转项目要求和采购回复，保护写入范围并拦住重放', async () => {
  const fixture = await setup();
  try {
    const { app, login } = fixture;
    const [productCookie, buyerCookie, otherBuyerCookie, managerCookie] = await Promise.all([login(product), login(buyer), login(otherBuyer), login(manager)]);
    const projectId = randomUUID();
    const project = { id: projectId, title: '屏障修护乳', store: 'store_a', productLeadUserId: product };
    const newProject = () => app.inject({ method: 'POST', url: `${root}/projects`, payload: project, headers: productCookie });
    expect((await newProject()).statusCode).toBe(200);
    expect((await newProject()).statusCode).toBe(200);

    const nodeId = randomUUID();
    const node = { id: nodeId, projectId, title: '中试原料周一到厂', destination: 'pilot_material_to_factory',
      plannedStart: '2026-11-19', plannedEnd: '2026-11-23', ownerUserId: product, buyerUserId: buyer };
    const newNode = () => app.inject({ method: 'POST', url: `${root}/nodes`, payload: node, headers: productCookie });
    expect((await newNode()).statusCode).toBe(200);
    expect((await newNode()).statusCode).toBe(200);
    const list = (headers: typeof buyerCookie, store = 'store_a') => app.inject({ method: 'GET', url: `${root}?store=${store}`, headers });
    expect(ProductDevelopmentSchema.parse((await list(buyerCookie)).json()).projects[0]?.nodes).toMatchObject([
      { id: nodeId, daysUntilRequired: 4, canReply: true, latestReply: null },
    ]);
    expect(ProductDevelopmentSchema.parse((await list(managerCookie, 'store_b')).json()).projects).toEqual([]);

    const reply = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', projectId, nodeId, promisedOn: '2026-11-24', evidence: '供应商回复最早周二到' };
    const postReply = (headers: typeof buyerCookie) => app.inject({ method: 'POST', url: `${root}/replies`, payload: reply, headers });
    expect((await postReply(otherBuyerCookie)).statusCode).toBe(403);
    expect((await postReply(managerCookie)).statusCode).toBe(403);
    expect((await postReply(buyerCookie)).statusCode).toBe(200);
    expect((await postReply(buyerCookie)).statusCode).toBe(200);

    const legacyWrite = await app.inject({ method: 'PATCH', url: `/api/v1/plan/work-items/${nodeId}`, payload: { plannedEnd: '2026-11-25' }, headers: buyerCookie });
    expect(legacyWrite.statusCode).toBe(403);
    const oldQueue = await app.inject({ method: 'GET', url: '/api/v1/plan/daily?date=2026-11-23', headers: buyerCookie });
    expect(oldQueue.json()).toMatchObject({ total: 0 });
    const projectRead = ProductDevelopmentSchema.parse((await list(productCookie)).json());
    expect(projectRead.projects).toMatchObject([{ id: projectId, nodes: [{ plannedEnd: '2026-11-23', latestReply: { promisedOn: reply.promisedOn, evidence: reply.evidence }, replies: [{ id: reply.id }] }] }]);
    const revised = { ...reply, id: '11111111-1111-4111-8111-111111111111', promisedOn: '2026-11-25' };
    const update = await app.inject({ method: 'POST', url: `${root}/replies`, payload: revised, headers: buyerCookie });
    expect(update.statusCode).toBe(200);
    const revisedRead = ProductDevelopmentSchema.parse((await list(productCookie)).json());
    expect(revisedRead.projects[0]?.nodes[0]?.replies.map((entry) => entry.id)).toEqual([revised.id, reply.id]);
  } finally {
    await fixture.close();
  }
});

async function setup() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const accessCode = 'cg09-test-code';
  const clock = { today: () => localDate('2026-11-19'), now: () => '2026-11-19T00:00:00.000Z' };
  const input = { db: handle.db, timeZone: 'Asia/Shanghai', clock };
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode, secret: 'test-secret-product-development-only' }),
    register(server) {
      registerPlanRoutes(server, composePlan(input));
      registerProductDevelopmentRoutes(server, composeProductDevelopment(input));
      registerReportingRoutes(server, composeReporting({ ...input, secret: 'test-secret-reporting-only' }));
    },
  });
  return {
    app,
    exec: handle.exec,
    async login(userId: string) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId, accessCode } });
      const cookie = response.headers['set-cookie'];
      if (typeof cookie !== 'string') throw new Error('测试账号登录失败');
      return { cookie: cookie.split(';')[0] ?? '' };
    },
    async close() {
      await app.close();
      await handle.close();
    },
  };
}

it('只可关联同店且自身单行有 OA 的成品，交付到厂读取指定子件', async () => {
  const fixture = await setup();
  try {
    await seedOrderScope(fixture.exec);
    const { app, login } = fixture;
    const headers = await login(product);
    const buyerHeaders = await login(buyer);
    const projectId = randomUUID();
    const nodeId = randomUUID();
    const contact = { projectId, nodeId };
    const create = (route: string, payload: object) => app.inject({ method: 'POST', url: `${root}/${route}`, payload, headers });
    expect((await create('projects', { id: projectId, title: '双店样例', store: 'store_a', productLeadUserId: product })).statusCode).toBe(200);
    expect((await create('nodes', {
      id: nodeId, projectId, title: '包材到加工厂', destination: 'packaging_to_factory', plannedStart: '2026-11-19',
      plannedEnd: '2026-11-23', ownerUserId: product, buyerUserId: buyer,
    })).statusCode).toBe(200);
    const orderResults = await app.inject({ method: 'GET', url: `${root}/orders?store=store_a&search=9971`, headers });
    expect(orderResults.json()).toMatchObject([{ orderLineId: 'finished-with-oa', oaRef: 'XPKA(CN)9971' }]);
    const noOa = await create('links', { ...contact, orderLineId: 'finished-no-oa', procurementLineId: 'material-store_a' });
    expect(noOa.statusCode).toBe(400);
    const wrongShop = await create('links', { ...contact, orderLineId: 'finished-store_b', procurementLineId: 'material-store_a' });
    expect(wrongShop.statusCode).toBe(400);
    const wrongDelivery = await create('links', { ...contact, orderLineId: 'finished-with-oa', procurementLineId: 'finished-with-oa' });
    expect(wrongDelivery.statusCode).toBe(400);
    const valid = { ...contact, orderLineId: 'finished-with-oa', procurementLineId: 'material-store_a' };

    const reply = { id: randomUUID(), ...contact, promisedOn: '2026-11-24', evidence: '工厂回复最早周二到' };
    expect((await app.inject({ method: 'POST', url: `${root}/replies`, payload: reply, headers: buyerHeaders })).statusCode).toBe(200);
    expect((await create('links', valid)).statusCode).toBe(200);
    expect((await create('links', valid)).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `${root}/replies`, payload: { ...reply, id: randomUUID() }, headers: buyerHeaders })).statusCode).toBe(409);
    const after = await app.inject({ method: 'GET', url: `${root}?store=store_a`, headers: buyerHeaders });
    const development = ProductDevelopmentSchema.parse(after.json());
    expect(development.projects[0]?.nodes).toMatchObject([{ canReply: false, replies: [{ id: reply.id }], formalLink: {
      oaRef: 'XPKA(CN)9971', orderLineId: valid.orderLineId, procurementLineId: valid.procurementLineId,
    } }]);
    const history = await app.inject({ method: 'GET', url: `/api/v1/plan/work-items/${nodeId}`, headers });
    expect(history.json().events).toHaveLength(3);
  } finally {
    await fixture.close();
  }
});

it('按规范 OA 主号或原始 OA 号搜索同店成品，返回原始凭据', async () => {
  const fixture = await setup();
  try {
    await seedOrderScope(fixture.exec);
    const oaRef = 'XPKA （ CN ）９９７１－２';
    await fixture.exec(`update import_rows set parsed = jsonb_build_object('oaDemandRef', jsonb_build_object('raw', '${oaRef}')) where id = 'source-oa'`);
    const headers = await fixture.login(product);
    for (const search of ['XPKA(CN)9971', 'xPka ( CN ) 9971-2', '９９７１', oaRef]) {
      const query = new URLSearchParams({ store: 'store_a', search });
      const response = await fixture.app.inject({ url: `${root}/orders?${query}`, headers });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([{ orderLineId: 'finished-with-oa', oaRef }]);
    }
  } finally {
    await fixture.close();
  }
});

it('管理周会从各成品行的已提交快照读取 OA，周报保留当时的凭据', async () => {
  const fixture = await setup();
  try {
    await seedMeetingMaterial(fixture.exec);
    await fixture.exec(`
      update purchase_orders set oa_demand_ref = 'XPKA(CN)9971' where id = 'shared-po';
      update import_rows set parsed = '{"oaDemandRef":{"raw":"XPKA（CN）9988-2"}}' where id = 'source-oa';
    `);
    const headers = await fixture.login(manager);
    const expected = [
      { id: 'finished-no-oa', oaRef: null }, { id: 'finished-with-oa', oaRef: 'XPKA（CN）9988-2' },
    ];
    const response = await fixture.app.inject({ url: '/api/v1/dashboard/management-meeting?store=store_a&weekStart=2026-11-16', headers });
    expect(response.statusCode).toBe(200);
    expect(ManagementMeetingSchema.parse(response.json()).materials[0]?.affectedFinished).toMatchObject(expected);

    const report = await fixture.app.inject({ method: 'POST', url: '/api/v1/reports/weekly', headers, payload: { weekStart: '2026-11-16' } });
    expect(report.statusCode).toBe(200);
    expect(report.json().data.managementMeeting[0].materials[0].affectedFinished).toMatchObject(expected);
  } finally {
    await fixture.close();
  }
});

it('周会只按仍待履约的开放批次判断日期和等谁，历史凭据继续计量', async () => {
  const fixture = await setup();
  try {
    await seedMeetingMaterial(fixture.exec);
    const at = "'2026-11-19T00:00:00Z'";
    await fixture.exec(`
      insert into delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit, receiver_party_id, date_buyer_confirmed, status, status_changed_at, origin)
      values ('meeting-closed', ${at}, ${at}, 'material-store_a', 1, 30, '个', 'meeting-factory', '2026-11-20', 'closed', ${at}, 'manual'),
        ('meeting-complete', ${at}, ${at}, 'material-store_a', 2, 30, '个', 'meeting-factory', '2026-11-21', 'confirmed', ${at}, 'manual'),
        ('meeting-next', ${at}, ${at}, 'material-store_a', 3, 40, '个', 'meeting-factory', '2026-11-24', 'confirmed', ${at}, 'manual');
      insert into shipments (id, created_at, updated_at, batch_id, qty, shipped_on, fulfillment, source, created_by)
      values ('meeting-delivery', ${at}, ${at}, 'meeting-closed', 20, '2026-11-19', '{"kind":"verified","reportId":"meeting-reported","unit":"个","evidence":"发运凭据","reviewReason":null}', 'manual', '${buyer}'),
        ('meeting-reported', ${at}, ${at}, 'meeting-closed', 10, '2026-11-19', '{"kind":"reported","unit":"个","evidence":"原报数"}', 'manual', '${buyer}');
      insert into receipts (id, created_at, updated_at, batch_id, qty, received_on, fulfillment, category, source, created_by)
      values ('meeting-receipt', ${at}, ${at}, 'meeting-complete', 30, '2026-11-19', '{"kind":"received","disposition":"normal","unit":"个","evidence":"签收凭据","reviewReason":null}', 'normal', 'manual', '${buyer}'),
        ('meeting-closed-receipt', ${at}, ${at}, 'meeting-closed', 15, '2026-11-19', '{"kind":"received","disposition":"normal","unit":"个","evidence":"历史签收","reviewReason":null}', 'normal', 'manual', '${buyer}');
    `);
    const headers = await fixture.login(manager);
    const meeting = async () => {
      const response = await fixture.app.inject({ url: '/api/v1/dashboard/management-meeting?store=store_a&weekStart=2026-11-16', headers });
      expect(response.statusCode).toBe(200);
      return ManagementMeetingSchema.parse(response.json()).materials[0];
    };
    expect(await meeting()).toMatchObject({ verifiedShippedQty: 20, verifiedReceivedQty: 45,
      quantityNeedsReview: false, waitingOn: ['supplier'], affectedFinished: [],
      batches: [{ id: 'meeting-closed', waitingOn: ['none'] }, { id: 'meeting-complete', waitingOn: ['none'] }, { id: 'meeting-next', waitingOn: ['supplier'] }],
    });
    await fixture.exec("update delivery_batches set date_buyer_confirmed = null, planned_unit = null where id = 'meeting-next'");
    expect(await meeting()).toMatchObject({ quantityNeedsReview: true, waitingOn: ['verification'],
      affectedFinished: [{ id: 'finished-no-oa' }, { id: 'finished-with-oa' }],
    });
  } finally {
    await fixture.close();
  }
});

it('周会新品风险显示实际跟进采购，未分配采购时返回空值', async () => {
  const fixture = await setup();
  try {
    const headers = await fixture.login(product);
    const projectId = randomUUID();
    const create = (route: string, payload: object) => fixture.app.inject({ method: 'POST', url: `${root}/${route}`, payload, headers });
    expect((await create('projects', { id: projectId, title: '光感防护霜', store: 'store_a', productLeadUserId: product })).statusCode).toBe(200);
    const assignedId = randomUUID();
    const unassignedId = randomUUID();
    const node = { projectId, destination: 'pilot_material_to_factory', plannedStart: '2026-11-19', plannedEnd: '2026-11-23', ownerUserId: product };
    expect((await create('nodes', { ...node, id: assignedId, title: '已分配采购', buyerUserId: buyer })).statusCode).toBe(200);
    expect((await create('nodes', { ...node, id: unassignedId, title: '待分配采购', buyerUserId: null })).statusCode).toBe(200);
    const current = await fixture.app.inject({ url: `${root}?store=store_a`, headers });
    const assigned = ProductDevelopmentSchema.parse(current.json()).projects[0]?.nodes.find(({ id }) => id === assignedId);
    expect(assigned?.buyerName).toEqual(expect.any(String));
    expect(assigned?.buyerName).not.toBe(assigned?.ownerName);

    const response = await fixture.app.inject({ url: '/api/v1/dashboard/management-meeting?store=store_a&weekStart=2026-11-23', headers: await fixture.login(manager) });
    expect(response.statusCode).toBe(200);
    expect(ManagementMeetingSchema.parse(response.json()).development).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: assignedId, ownerName: assigned?.buyerName }),
      expect.objectContaining({ id: unassignedId, ownerName: null }),
    ]));
  } finally {
    await fixture.close();
  }
});

async function seedMeetingMaterial(exec: (statement: string) => Promise<unknown>): Promise<void> {
  await seedOrderScope(exec);
  await exec(`
    update procurement_observations set material_line_id = 'material-store_a', fact = jsonb_build_object(
      'componentNameRaw', '防护霜包材', 'componentCodeRaw', 'M1', 'unitRaw', '个', 'quantity', 100,
      'source', jsonb_build_object('sheetName', '店铺甲项目进度表', 'rowNo', row_no)
    ) where sheet_name = '店铺甲项目进度表';
    insert into procurement_finished_lines (finished_line_id, material_line_id) values ('finished-no-oa', 'material-store_a');
  `);
}

async function seedOrderScope(exec: (statement: string) => Promise<unknown>): Promise<void> {
  const at = "'2026-11-19T00:00:00Z'";
  await exec(`
    insert into purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, lane, oa_demand_ref)
    values ('shared-po', ${at}, ${at}, 'PO202611190001', 'PO202611190001', 'PO', '{}', 'finished', 'XPKA(CN)9971'),
      ('material-po', ${at}, ${at}, 'PO202611190002', 'PO202611190002', 'PO', '{}', 'material', null);
    insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, origin, current_snapshot_id, missing_in_latest_import, stage, stage_changed_at)
    values ('finished-with-oa', ${at}, ${at}, 'shared-po', 'finished', 'import_po_master', 'snapshot-oa', false, 'no_batch', ${at}),
      ('finished-no-oa', ${at}, ${at}, 'shared-po', 'finished', 'import_po_master', 'snapshot-no', false, 'no_batch', ${at}),
      ('finished-store_b', ${at}, ${at}, 'shared-po', 'finished', 'import_po_master', 'snapshot-store_b', false, 'no_batch', ${at}),
      ('material-store_a', ${at}, ${at}, 'material-po', 'material', 'import_po_master', null, false, 'no_batch', ${at});
    insert into import_batches (id, created_at, updated_at, committed_at, template, status, file_id, file_meta, stats, decisions, created_by)
    values ('scope-import', ${at}, ${at}, ${at}, 'po-master-v1', 'committed', 'fake-book', '{}', '{}', '{}', '${buyer}');
    insert into import_rows (id, import_batch_id, sheet_name, row_no, raw, parsed, issues, action, target_id)
    values ('source-oa', 'scope-import', '采购订单总表', 1, '{}', '{"oaDemandRef":{"raw":"XPKA(CN)9971"}}', '[]', 'create', 'finished-with-oa'),
      ('source-no', 'scope-import', '采购订单总表', 2, '{}', '{"oaDemandRef":{"raw":null}}', '[]', 'create', 'finished-no-oa'),
      ('source-store_b', 'scope-import', '采购订单总表', 3, '{}', '{"oaDemandRef":{"raw":"XPKA(CN)9971"}}', '[]', 'create', 'finished-store_b');
    insert into order_line_snapshots (id, order_line_id, import_batch_id, import_row_id, data)
    values ('snapshot-oa', 'finished-with-oa', 'scope-import', 'source-oa', '{}'),
      ('snapshot-no', 'finished-no-oa', 'scope-import', 'source-no', '{}'),
      ('snapshot-store_b', 'finished-store_b', 'scope-import', 'source-store_b', '{}');
    insert into procurement_observations (import_batch_id, sheet_name, row_no, finished_line_ids, material_line_id, reasons, fact)
    values ('scope-import', '店铺甲项目进度表', 1, '{finished-with-oa}', 'material-store_a', '{}', '{}'),
      ('scope-import', '店铺甲项目进度表', 2, '{finished-no-oa}', null, '{}', '{}'),
      ('scope-import', '店铺乙项目进度表', 1, '{finished-store_b}', null, '{}', '{}');
    insert into procurement_finished_lines (finished_line_id, material_line_id) values ('finished-with-oa', 'material-store_a');
  `);
}
