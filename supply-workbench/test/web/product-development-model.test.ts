import { expect, it } from 'vitest';
import type { ProductDevelopmentBatch, ProductDevelopmentNode, ProductDevelopmentProject } from '../../packages/contracts/src/index.js';
import { diffDays, entityId, localDate, orderLineId } from '../../packages/domain/src/index.js';
import {
  developmentProjects, groupDevelopmentByLead, readDevelopmentFilters, readDevelopmentPeriod, visibleDevelopmentProjects,
} from '../../apps/web/src/pages/progress/product-development-model.js';
import {
  coordinationItems, coordinationParty, coordinationReasons, coordinationStatus, developmentNodeCoordination,
  developmentProjectCoordination, projectStage, projectStageFilter,
} from '../../apps/web/src/pages/progress/product-development-workflow.js';

const today = localDate('2026-12-27');
const projectId = entityId('project-1');
const buyerId = entityId('buyer-1');
const leadId = entityId('lead-1');
const stock = orderLineId('order-1');

function node({ id, date, status = 'planned', ...fields }: {
  readonly id: string;
  readonly date: string;
  readonly status?: ProductDevelopmentNode['status'];
  readonly plannedStart?: ProductDevelopmentNode['plannedStart'];
  readonly canReply?: boolean;
  readonly latestReply?: ProductDevelopmentNode['latestReply'];
  readonly formalLink?: ProductDevelopmentNode['formalLink'];
}): ProductDevelopmentNode {
  const plannedEnd = localDate(date);
  return {
    id: entityId(id), projectId, title: id, destination: 'finished_to_warehouse', status,
    ownerUserId: leadId, ownerName: '产品甲', buyerUserId: buyerId, buyerName: '采购甲',
    plannedStart: plannedEnd, plannedEnd, version: 1, canReply: false, latestReply: null, replies: [], formalLink: null, batches: [],
    daysUntilRequired: status === 'done' || status === 'cancelled' ? null : diffDays(plannedEnd, today),
    ...fields,
  };
}

function project(nodes: ProductDevelopmentNode[]): ProductDevelopmentProject {
  return {
    id: projectId, store: 'dafuyan', title: '验证项目', productLeadUserId: leadId, productLeadName: '产品甲',
    createdBy: leadId, createdAt: '2026-12-11T04:00:00Z', canManage: true, nodes,
  };
}

it('滚动周期含当天和之后 13 天，月度按业务日期选择月份并兼容旧入口', () => {
  expect(readDevelopmentPeriod(new URLSearchParams(), today)).toEqual({ kind: 'rolling', from: '2026-12-27', to: '2027-01-09' });
  expect(readDevelopmentPeriod(new URLSearchParams('developmentPeriod=month&developmentMonth=2028-02'), today)).toEqual({
    kind: 'month', from: '2028-02-01', to: '2028-02-29',
  });
  expect(readDevelopmentPeriod(new URLSearchParams('scale=month&from=2027-01-21'), today)).toEqual({
    kind: 'month', from: '2027-01-01', to: '2027-01-31',
  });
});

it('改选 14 天起始日后跨年保持 14 个日历日，并对无效日期回到业务日', () => {
  expect(readDevelopmentPeriod(new URLSearchParams('developmentFrom=2026-12-25'), today)).toEqual({
    kind: 'rolling', from: '2026-12-25', to: '2027-01-07',
  });
  expect(readDevelopmentPeriod(new URLSearchParams('developmentFrom=9999-12-31'), today).from).toBe(today);
  expect(readDevelopmentPeriod(new URLSearchParams('developmentPeriod=rolling&developmentFrom=2026-11-31'), today)).toEqual({
    kind: 'rolling', from: '2026-12-27', to: '2027-01-09',
  });
});

it('在周期外续显未完成的阻塞和逾期节点，保留完整的项目节点', () => {
  const period = readDevelopmentPeriod(new URLSearchParams('developmentPeriod=month&developmentMonth=2027-01'), today);
  const filters = readDevelopmentFilters(new URLSearchParams());
  const [view] = developmentProjects({ period, filters, projects: [project([
    node({ id: '已完成旧节点', date: '2026-02-03', status: 'done' }),
    node({ id: '逾期开放节点', date: '2026-02-03', status: 'in_progress' }),
    node({ id: '将来阻塞节点', date: '2027-03-04', status: 'blocked' }),
    node({ id: '月内完成节点', date: '2027-01-02', status: 'done' }),
    node({ id: '月内开放节点', date: '2027-01-03' }),
    node({ id: '将来正常节点', date: '2027-03-07' }),
  ])] });
  expect(view?.nodes).toHaveLength(6);
  expect(view?.next?.node.id).toBe('月内开放节点');
  expect(view?.milestones.map(({ node, placement }) => [node.id, placement])).toEqual([
    ['逾期开放节点', 'carry'], ['月内完成节点', 'in-period'], ['月内开放节点', 'in-period'], ['将来阻塞节点', 'carry'],
  ]);
  expect(view?.riskCount).toBe(2);
});

it('按 OA、节点负责人及状态取同一批节点，按项目对接人聚合风险', () => {
  const params = new URLSearchParams('planSearch=oa-1&ownerUserId=lead-1&status=blocked&developmentLead=lead-1&planRiskOnly=1');
  const filters = readDevelopmentFilters(params);
  const period = readDevelopmentPeriod(params, today);
  const link = { orderLineId: stock, procurementLineId: stock, oaRef: 'OA-1' };
  const views = developmentProjects({ filters, period, projects: [project([
    node({ id: '关联的风险节点', date: '2027-01-02', status: 'blocked', formalLink: link }),
    node({ id: '关联的正常节点', date: '2027-01-03', formalLink: link }),
    node({ id: '未关联的风险节点', date: '2027-01-04', status: 'blocked' }),
  ])] });
  const [group] = groupDevelopmentByLead(visibleDevelopmentProjects(views, filters));
  expect(group?.name).toBe('产品甲');
  expect(group?.riskCount).toBe(1);
  expect(group?.projects[0]?.nodes.map(({ node }) => node.id)).toEqual(['关联的风险节点']);
  expect(visibleDevelopmentProjects(views, { ...filters, productLead: '另一负责人' })).toHaveLength(0);
});

it('正在执行的跨期节点纳入近两周，已回复的节点仍可追加采购回复', () => {
  const params = new URLSearchParams();
  const running = node({
    id: '继续排期', date: '2027-02-01', plannedStart: today, status: 'in_progress', canReply: true,
    latestReply: {
      id: entityId('reply-1'), nodeId: entityId('继续排期'), actorUserId: buyerId, actorName: '采购甲',
      promisedOn: localDate('2027-01-12'), evidence: '供应商更新承诺', recordedAt: '2026-12-27T04:00:00Z',
    },
  });
  const [entry] = visibleDevelopmentProjects(developmentProjects({
    projects: [project([running])], period: readDevelopmentPeriod(params, today), filters: readDevelopmentFilters(params),
  }), readDevelopmentFilters(params));
  expect(entry?.milestones[0]).toMatchObject({ waiting: null, node: { canReply: true } });
});


it('按各卡点已登记的等待方分组，项目对接人和采购分派不自动填为等待方', () => {
  const waiting: ProductDevelopmentNode['followUp'] = {
    waiting: { kind: 'waiting', party: '备案团队', deliverable: '签字单' }, updatedBy: leadId, updatedAt: '2026-12-27T04:00:00Z',
  };
  const staged = {
    ...project([
      node({ id: '缺少等待证据', date: '2026-12-25', status: 'blocked' }),
      { ...node({ id: '等已知团队', date: '2027-05-08' }), followUp: waiting },
      { ...node({ id: '已完成的等待', date: '2026-12-26', status: 'done' }), followUp: waiting },
    ]),
    progress: { confirmedStage: null, contacts: '项目对接人、采购甲' },
  };
  const [view] = developmentProjects({ projects: [staged], period: readDevelopmentPeriod(new URLSearchParams(), today),
    filters: readDevelopmentFilters(new URLSearchParams()) });
  expect(view).toBeDefined();
  if (view === undefined) throw new Error('验证项目缺失');
  expect(coordinationItems(view, today).map(coordinationParty)).toEqual(['等待方待核对', '备案团队']);
  expect(projectStage(staged)).toBe('review');
});

it('原表中能核对的要求和预计日期可提示风险，但不补项目节点或实际入仓', () => {
  const staged: ProductDevelopmentProject = {
    ...project([]),
    progress: {
      confirmedStage: 'development', requirement: { raw: '12/28', date: localDate('2026-12-28') },
      forecast: { raw: '预计 1/2', date: localDate('2027-01-02') },
    },
  };
  const [view] = developmentProjects({ projects: [staged], period: readDevelopmentPeriod(new URLSearchParams(), today),
    filters: readDevelopmentFilters(new URLSearchParams()) });
  expect(view).toBeDefined();
  if (view === undefined) throw new Error('验证项目缺失');
  expect(coordinationItems(view, today)).toEqual([{ kind: 'project', risk: '预计晚 5 天', followUp: undefined,
    decision: { kind: 'verify', reviewReason: null } }]);
  expect(view.nodes).toHaveLength(0);
  expect(projectStage(staged)).toBe('development');
});

it('按是否明确请求管理决定、实际风险和跟进日分层，保留原始跟进信息', () => {
  const missingReview: NonNullable<ProductDevelopmentNode['followUp']> = {
    waiting: { kind: 'waiting', party: '供应商', deliverable: '报价' }, nextAction: '收到后请经理核对',
    updatedBy: leadId, updatedAt: '2026-12-27T04:00:00Z',
  };
  const followUp = { ...missingReview, reviewOn: localDate('2026-12-29') };
  const base = node({ id: '普通跟进', date: '2026-12-31' });
  const todayReview = { ...base, followUp: { ...followUp, reviewOn: today } };
  const lateReview = { ...base, followUp: { ...followUp, reviewOn: localDate('2026-12-26') } };
  const blocked = { ...base, status: 'blocked' as const, followUp };
  const management = { ...blocked, followUp: { ...followUp, managementDecision: '确认是否切换包装厂' } };
  expect(developmentNodeCoordination({ node: base, today })).toBeNull();
  expect(developmentNodeCoordination({ node: { ...base, followUp }, today })).toMatchObject({ decision: { kind: 'follow-up' }, followUp });
  expect(developmentNodeCoordination({ node: todayReview, today })?.decision.kind).toBe('follow-up');
  expect(developmentNodeCoordination({ node: lateReview, today })?.decision).toEqual({ kind: 'verify', reviewReason: 'late' });
  expect(developmentNodeCoordination({ node: { ...base, followUp: missingReview }, today })?.decision)
    .toEqual({ kind: 'verify', reviewReason: 'missing' });
  expect(developmentNodeCoordination({ node: blocked, today })?.decision).toEqual({ kind: 'verify', reviewReason: null });
  const decision = developmentNodeCoordination({ node: management, today });
  if (decision === null) throw new Error('应显示已登记的管理决定');
  expect(coordinationStatus(decision).label).toBe('明确管理介入');
  expect(coordinationReasons(decision)).toEqual(['风险原因 已阻塞']);
  expect(decision.followUp).toEqual(management.followUp);
});

const fullyReceived: ProductDevelopmentBatch = {
  id: 'formal-a', seq: 1, supplierPromisedOn: null, buyerConfirmedOn: null, receiptDates: [today], plannedQty: 10, status: 'received',
  fulfillment: { unit: '件', unshippedQty: 0, inTransitQty: 0, receivedQty: 10, verifiedShippedQty: 10,
    verifiedReceivedQty: 10, overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0, reviewCount: 0 },
  reportedShipments: [],
};

function manuallyReceived(nodes: ProductDevelopmentNode[]): ProductDevelopmentProject {
  return { ...project(nodes), progress: { confirmedStage: 'received',
    requirement: { raw: '12/28', date: localDate('2026-12-28') }, forecast: { raw: '1/4', date: localDate('2027-01-04') },
  } };
}

const formalNode = { ...node({ id: '正式成品入仓', date: '2026-12-28', status: 'done',
  formalLink: { orderLineId: stock, procurementLineId: stock, oaRef: 'OA-1' } }), batches: [fullyReceived] };

it('人工入仓保留项目日期风险，所有有效成品批次核实足量后才计入已入仓并移除项目日期风险', () => {
  const manual = manuallyReceived([]);
  expect(projectStage(manual)).toBe('received-unverified');
  expect(projectStageFilter(manual)).toBe('review');
  expect(developmentProjectCoordination(manual, today)).toMatchObject({ risk: '预计晚 7 天', decision: { kind: 'verify' } });
  const verified = manuallyReceived([formalNode, { ...formalNode, destination: 'other', formalLink: null, batches: [] }]);
  expect(projectStage(verified)).toBe('received');
  expect(projectStageFilter(verified)).toBe('received');
  expect(developmentProjectCoordination(verified, today)).toBeNull();
  const additional = { ...formalNode, id: entityId('另一个成品入仓'), formalLink: null, batches: [] };
  expect(projectStage(manuallyReceived([formalNode, additional]))).toBe('received-unverified');
  expect(projectStage(manuallyReceived([formalNode, { ...additional, status: 'cancelled' }]))).toBe('received');
});

it('工作节点取消或完成不会掩盖仍待核实的正式批次，已核实批次关闭后仍是有效凭据', () => {
  const unverified = { ...fullyReceived, buyerConfirmedOn: localDate('2027-01-05'), fulfillment: { ...fullyReceived.fulfillment, receivedQty: null } };
  const open = { ...formalNode, id: entityId('另一个成品入仓'), batches: [unverified] };
  const cancelled = manuallyReceived([formalNode, { ...open, status: 'cancelled' }]);
  expect(projectStage(cancelled)).toBe('received-unverified');
  expect(developmentProjectCoordination(cancelled, today)?.risk).toBe('预计晚 7 天');
  expect(developmentNodeCoordination({ node: { ...open, status: 'cancelled' }, today })?.risk).toBe('采购确认晚于要求 8 天');
  expect(developmentNodeCoordination({ node: open, today })?.risk).toBe('采购确认晚于要求 8 天');
  expect(developmentNodeCoordination({ node: { ...open, batches: [{ ...unverified, status: 'closed' }] }, today })?.risk).toBe('采购确认晚于要求 8 天');
  expect(projectStage(manuallyReceived([{ ...formalNode, batches: [{ ...fullyReceived, status: 'closed' }] }]))).toBe('received');
});

it.each([
  ['部分实收', { ...fullyReceived, fulfillment: { ...fullyReceived.fulfillment, receivedQty: 4, verifiedReceivedQty: 4 } }],
  ['账面已收，核实实收为零', { ...fullyReceived, fulfillment: { ...fullyReceived.fulfillment, verifiedReceivedQty: 0 } }],
  ['数量或单位有待确认', { ...fullyReceived, fulfillment: { ...fullyReceived.fulfillment, receivedQty: null } }],
  ['缺计划单位', { ...fullyReceived, fulfillment: { ...fullyReceived.fulfillment, unit: null } }],
  ['无有效计划量', { ...fullyReceived, plannedQty: 0 }],
  ['缺核实收货日期', { ...fullyReceived, receiptDates: [] }],
  ['批次尚未收到', { ...fullyReceived, status: 'confirmed' }],
] satisfies readonly (readonly [string, ProductDevelopmentBatch])[])('单个有效批次%s时保留人工入仓和项目风险', (_label, openBatch) => {
  const manual = manuallyReceived([{ ...formalNode, batches: [fullyReceived, { ...openBatch, id: 'formal-b', seq: 2 }] }]);
  expect(projectStage(manual)).toBe('received-unverified');
  expect(developmentProjectCoordination(manual, today)?.risk).toBe('预计晚 7 天');
});
