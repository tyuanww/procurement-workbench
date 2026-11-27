import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { ProductDevelopmentSchema } from '../../packages/contracts/src/product-development.js';
import { auditLog } from '../../packages/persistence/src/schema/platform.js';
import { buyer, manager, otherBuyer, product, root, setup } from './product-development-fixture.js';

it('项目负责人和主管回查同一份原始证据，项目进展仅能按版本修订', async () => {
  const fixture = await setup();
  try {
    const [headers, managerHeaders, buyerHeaders] = await Promise.all([fixture.login(product), fixture.login(manager), fixture.login(otherBuyer)]);
    const id = randomUUID();
    const source = { fileName: '合成新品项目.xlsx', sheet: '开发中产品', row: 12, cells: [
      { address: 'B12', label: '阶段', raw: '  尚未确认\n' },
      { address: 'C12', label: '预计时间', raw: ' 12月中旬 ', display: ' 12月中旬 ', formula: 'TEXT(D12,"m月")&"中旬"' },
    ] };
    const progress = { confirmedStage: null, source, forecast: { raw: ' 12月中旬 ' }, contacts: '销售组' };
    const project = { id, title: '合成胶原面膜', store: 'dafuyan', productLeadUserId: product, progress };
    const create = (payload: object) => fixture.app.inject({ method: 'POST', url: `${root}/projects`, payload, headers });
    const update = (payload: object, actor = headers) => fixture.app.inject({ method: 'PATCH', url: `${root}/projects`, payload, headers: actor });
    const list = async (actor: typeof headers) => {
      const reply = await fixture.app.inject({ method: 'GET', url: `${root}?store=dafuyan`, headers: actor });
      expect(reply.statusCode, reply.body).toBe(200);
      return ProductDevelopmentSchema.parse(reply.json()).projects.find((entry) => entry.id === id);
    };
    expect((await create({ ...project, progress: { ...progress, source: { ...source, row: 13 } } })).statusCode).toBe(400);
    const largeEvidence = { address: 'D12', label: '日期', raw: '1'.repeat(30_000), display: '1'.repeat(30_000), formula: '1'.repeat(10_000) };
    expect((await create({ ...project, progress: { ...progress, source: { ...source, cells: [largeEvidence] } } })).statusCode).toBe(400);
    expect((await create({ ...project, progress: { ...progress, currentNote: '字'.repeat(32_768) } })).statusCode).toBe(400);
    expect((await create({ ...project, progress: { ...progress, forecast: { raw: '12月中旬', date: '2026-02-30' } } })).statusCode).toBe(400);
    expect((await create({ ...project, progress: { ...progress, contacts: '采购\0测试' } })).statusCode).toBe(400);
    expect(await list(managerHeaders)).toBeUndefined();

    expect((await create(project)).statusCode).toBe(200);
    expect((await create(project)).statusCode).toBe(200);
    expect((await create({ ...project, progress: { ...progress, confirmedStage: 'ordered' } })).statusCode).toBe(409);
    expect(await list(headers)).toMatchObject({ id, progressVersion: 0, canManage: true });
    expect(await list(managerHeaders)).toMatchObject({ id, progressVersion: 0, canManage: false });
    expect((await list(headers))?.progress).toEqual(progress);
    expect((await list(managerHeaders))?.progress).toEqual(progress);
    expect(await list(headers)).toMatchObject({ nodes: [] });

    const changed = { confirmedStage: 'development', currentNote: '销售未确认需求', requirement: { raw: '2026/12/19', date: '2026-12-19' }, forecast: progress.forecast };
    const payload = { projectId: id, expectedVersion: 0, progress: changed };
    expect((await update(payload, buyerHeaders)).statusCode).toBe(403);
    expect((await update(payload, managerHeaders)).statusCode).toBe(403);
    expect((await update({ ...payload, progress: { ...changed, source } })).statusCode).toBe(400);
    expect((await update(payload)).statusCode).toBe(200);
    expect((await update({ ...payload, progress: { ...changed, currentNote: '旧读取不能覆盖' } })).statusCode).toBe(409);
    for (const actor of [headers, managerHeaders]) {
      const read = await list(actor);
      expect(read?.progressVersion).toBe(1);
      expect(read?.progress).toEqual({ ...changed, source });
    }

    const followUp = { nextAction: '对齐试用装规格', waiting: { kind: 'waiting', deliverable: '确认需求' }, reviewOn: '2026-11-20',
      managementDecision: '决定试用装首批采购上限' };
    const saved = { ...followUp, updatedBy: product, updatedAt: '2026-11-19T00:00:00.000Z' };
    const patchFollowUp = { projectId: id, expectedVersion: 1, progress: { ...changed, followUp } };
    expect((await update({ ...patchFollowUp, progress: { ...changed, followUp: { ...followUp, updatedBy: manager } } })).statusCode).toBe(400);
    expect((await update(patchFollowUp)).statusCode).toBe(200);
    expect((await update({ ...payload, expectedVersion: 2, progress: { ...changed, currentNote: '规格复核中' } })).statusCode).toBe(200);
    for (const actor of [headers, managerHeaders]) {
      expect(await list(actor)).toMatchObject({ nodes: [], progress: { ...changed, currentNote: '规格复核中', source, followUp: saved } });
    }

    const nativeId = randomUUID();
    expect((await create({ id: nativeId, title: '直接新建', store: 'dafuyan', productLeadUserId: product })).statusCode).toBe(200);
    expect((await update({ ...payload, projectId: nativeId })).statusCode).toBe(200);
    const noWorkbook = await fixture.app.inject({ url: `${root}?store=dafuyan`, headers: managerHeaders });
    const native = ProductDevelopmentSchema.parse(noWorkbook.json()).projects.find((entry) => entry.id === nativeId);
    expect(native?.progress).toEqual(changed);

    const audit = (await fixture.db.select().from(auditLog)).filter(({ entityId }) => entityId === id);
    expect(audit).toHaveLength(4);
    const updates = audit.filter(({ action }) => action === 'product_development.update_progress');
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorUserId: product, before: { progress, progressVersion: 0 }, after: { id, progress: { ...changed, source }, progressVersion: 1 } }),
      expect.objectContaining({ actorUserId: product, after: { id, progress: { ...changed, source, followUp: saved }, progressVersion: 2 } }),
    ]));
  } finally {
    await fixture.close();
  }
});

it('同一节点的跟进信息随现有版本回读，旧表单编辑不会清空跟进', async () => {
  const fixture = await setup();
  try {
    const [headers, managerHeaders, buyerHeaders] = await Promise.all([fixture.login(product), fixture.login(manager), fixture.login(buyer)]);
    const projectId = randomUUID();
    const nodeId = randomUUID();
    const { app } = fixture;
    const create = (route: string, payload: object) => app.inject({ method: 'POST', url: `${root}/${route}`, payload, headers });
    expect((await create('projects', { id: projectId, title: '合成试用装', store: 'dafuyan', productLeadUserId: product })).statusCode).toBe(200);
    const assignment = { plannedStart: '2026-11-19', plannedEnd: '2026-11-23', ownerUserId: product, buyerUserId: buyer };
    expect((await create('nodes', { ...assignment, id: nodeId, projectId, title: '包材打样', destination: 'packaging_to_factory' })).statusCode).toBe(200);
    const original = { ...assignment, projectId, nodeId, expectedVersion: 0, status: 'planned' };
    const cleared = { nextAction: '复核版式', waiting: { kind: 'waiting', party: '销售组', deliverable: '确认试用装需求' }, reviewOn: '2026-11-24' };
    const followUp = { ...cleared, managementDecision: '决定是否改用已备案的包材' };
    const saved = { ...followUp, updatedBy: product, updatedAt: '2026-11-19T00:00:00.000Z' };
    const update = (payload: object, actor = headers) => app.inject({ method: 'PATCH', url: `${root}/nodes`, payload, headers: actor });
    const read = async (actor: typeof headers) => {
      const response = await app.inject({ url: root, headers: actor });
      expect(response.statusCode, response.body).toBe(200);
      return ProductDevelopmentSchema.parse(response.json()).projects[0]?.nodes[0];
    };
    expect(await read(headers)).not.toHaveProperty('followUp');
    expect((await update({ ...original, followUp: { waiting: { kind: 'none', party: '不能保留旧对象' } } })).statusCode).toBe(400);
    expect((await update({ ...original, followUp: { ...followUp, managementDecision: '   ' } })).statusCode).toBe(400);
    expect((await update({ ...original, followUp }, buyerHeaders)).statusCode).toBe(403);
    expect((await update({ ...original, followUp }, managerHeaders)).statusCode).toBe(403);
    expect((await update({ ...original, followUp })).statusCode).toBe(200);
    expect((await update({ ...original, followUp: { waiting: { kind: 'none' } } })).statusCode).toBe(409);
    expect(await read(managerHeaders)).toMatchObject({ version: 1, followUp: saved });
    expect(await read(headers)).toMatchObject({ version: 1, followUp: saved });
    expect((await update({ ...original, expectedVersion: 1, plannedEnd: '2026-11-25' })).statusCode).toBe(200);
    expect(await read(headers)).toMatchObject({ version: 2, plannedEnd: '2026-11-25', followUp: saved });
    expect((await update({ ...original, expectedVersion: 2, plannedEnd: '2026-11-25', followUp: cleared })).statusCode).toBe(200);
    expect((await read(managerHeaders))?.followUp).toEqual({ ...cleared, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt });

    const updates = (await fixture.db.select().from(auditLog)).filter(({ entityId, action }) => entityId === nodeId && action === 'product_development.update');
    expect(updates).toHaveLength(3);
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ actorUserId: product, before: expect.objectContaining({ followUp: null }),
      after: expect.objectContaining({ followUp: saved }),
    })]));
  } finally {
    await fixture.close();
  }
});
