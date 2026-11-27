// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { ProductDevelopmentBatch, ProductDevelopmentNode, ProductDevelopmentProject } from '../../packages/contracts/src/index.js';
import { diffDays, entityId, localDate } from '../../packages/domain/src/index.js';
import { DevelopmentGantt } from '../../apps/web/src/pages/progress/product-development-gantt.js';
import { DevelopmentNodeEventTimeline } from '../../apps/web/src/pages/progress/product-development-events.js';
import { developmentProjects, readDevelopmentFilters, readDevelopmentPeriod } from '../../apps/web/src/pages/progress/product-development-model.js';
import { DevelopmentOverview } from '../../apps/web/src/pages/progress/product-development-overview.js';
import { act, button, click, element, installMatchMedia, memoryRouter, mount, resetDom } from './party-preview-dom.js';

const today = localDate('2026-11-20');
const projectId = entityId('development-project');
const user = entityId('product-lead');
let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  await act(() => mounted?.unmount());
  mounted = undefined;
  resetDom();
});

it('月度甘特按节点计划日期裁切跨月区间，单日标作节点，下钻保留项目与触发入口', () => {
  const production = developmentNode({ title: '生产验证', from: '2026-10-29', to: '2026-11-04' });
  const signoff = developmentNode({ title: '确认定稿', from: '2026-11-15', to: '2026-11-15' });
  const later = developmentNode({ title: '设计包装', from: '2026-11-27', to: '2026-12-09' });
  const open = render({ nodes: [production, signoff, later], search: 'developmentPeriod=month&developmentMonth=2026-11' });
  const gantt = document.querySelector('[role="region"][aria-label="新品开发甘特图"]');
  expect(gantt?.getAttribute('tabindex')).toBe('0');
  expect(gantt?.querySelectorAll('.planning-axis-day')).toHaveLength(30);
  expect(gantt?.querySelectorAll('.planning-interval')).toHaveLength(2);
  expect(gantt?.querySelectorAll('.planning-marker-requirement')).toHaveLength(1);
  expect(gantt?.querySelector('.planning-point time')?.getAttribute('datetime')).toBe('2026-11-15');
  const interval = document.getElementById(`planning-row:development:${projectId}:${production.id}-interval`);
  if (interval === null) throw new Error('没有计划区间入口');
  expect(interval.dataset.cutStart).toBe('true');
  expect(interval.getAttribute('title')).toContain('2026-10-29 至 2026-11-04');
  expect(gantt?.querySelector('[data-cut-end=true]')?.getAttribute('title')).toContain('2026-11-27 至 2026-12-09');

  click(interval);
  expect(open).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ kind: 'development', project: expect.objectContaining({ id: projectId }), node: production }),
    interval.id,
  );
});

it('近两周只画已登记开发计划，Excel 日期与采购回复不成为计划，周期外风险与待回复均有唯一入口', () => {
  const proofId = entityId('等待证据');
  const blocking = developmentNode({ title: proofId, from: '2026-11-17', to: '2026-11-24' }, {
    status: 'blocked',
    latestReply: {
      id: entityId('采购回复'), nodeId: proofId, actorUserId: user, actorName: '采购甲',
      promisedOn: localDate('2026-11-30'), recordedAt: '2026-11-20T00:00:00Z', evidence: '采购答复原文',
    },
  });
  const outside = developmentNode({ title: '逾期样品', from: '2026-11-17', to: '2026-11-19' });
  const waiting = developmentNode({ title: '待回复包装', from: '2026-12-09', to: '2026-12-09' }, { canReply: true });
  render({ nodes: [blocking, outside, waiting] });
  expect(document.querySelectorAll('.planning-axis-day')).toHaveLength(14);
  expect(document.querySelectorAll('.planning-interval')).toHaveLength(1);
  const carry = document.querySelector('.development-gantt-carry');
  expect(carry?.textContent).toContain('周期外仍需处理');
  expect(carry?.textContent).toContain('逾期样品');
  expect(carry?.textContent).toContain('待回复包装');
  expect(carry?.textContent).not.toContain('等待证据');
  expect(document.body.textContent).not.toMatch(/采购确认|实际收货|预计完工的原表日期|采购答复原文/);
  expect(document.querySelectorAll('.planning-track .planning-point')).toHaveLength(0);
  for (const { id } of [blocking, outside, waiting]) {
    expect([...document.querySelectorAll('button')].filter((button) => button.id === `planning-row:development:${projectId}:${id}`)).toHaveLength(1);
  }
});

it('只有周期外节点时展示空态，不用项目要求日和原表预计补画区间', () => {
  const future = developmentNode({ title: '下月计划', from: '2026-12-15', to: '2026-12-18' });
  render({ nodes: [future] });
  expect(document.querySelector('.planning-gantt-scroll')).toBeNull();
  expect(document.body.textContent).toContain('所选周期暂无开发计划。');
});

it('节点时间轴按业务日期排列，区分采购回复、确认交期和已核实收货', () => {
  installMatchMedia();
  const node = developmentNode({ title: '成品入仓', from: '2026-11-20', to: '2026-11-27' });
  const reply = {
    id: entityId('purchase-reply'), nodeId: node.id, actorUserId: user, actorName: '采购甲',
    promisedOn: localDate('2026-11-28'), recordedAt: '2026-11-20T17:00:00Z', evidence: '供应商邮件',
  };
  const batch: ProductDevelopmentBatch = {
    id: 'formal-a', seq: 1, supplierPromisedOn: null, buyerConfirmedOn: localDate('2026-11-29'),
    receiptDates: [localDate('2026-11-30'), localDate('2026-11-30')], plannedQty: 10, status: 'partially_received',
    fulfillment: { unit: '件', unshippedQty: 0, inTransitQty: 8, receivedQty: 2, verifiedShippedQty: 10,
      verifiedReceivedQty: 2, overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0, reviewCount: 0 },
    reportedShipments: [],
  };
  mounted = mount(element(DevelopmentNodeEventTimeline, {
    node: {
      ...node, replies: [reply], batches: [batch],
      followUp: { waiting: { kind: 'none' }, reviewOn: localDate('2026-12-01'), updatedBy: user, updatedAt: '2026-11-26T10:00:00Z' },
    },
  }));
  const timeline = document.querySelector('.development-detail-timeline');
  const events = [...(timeline?.querySelectorAll('.development-detail-event') ?? [])];
  expect(events.map((event) => event.querySelector('strong')?.textContent)).toEqual([
    '计划开始', '采购回复', '最近更新跟进', '项目要求日', '批次 1 · 正式采购确认到货日', '批次 1 · 已核实收货', '下次跟进日',
  ]);
  expect(events[1]?.textContent).toContain('2026-11-21 01:00');
  expect(events[1]?.textContent).toMatch(/供应商承诺日 2026-11-28.*供应商邮件/);
  expect(timeline?.textContent).not.toContain('正式供应商承诺日');
});

it.each(['desktop', 'phone'] as const)('需要协调在 %s 显示周期内与周期外节点的实际跟进，等待方缺失时提示待核对', (viewport) => {
  const blocked = developmentNode({ title: '备案资料核对', from: '2026-11-21', to: '2026-11-24' }, {
    status: 'blocked', buyerName: '采购分派甲', canReply: true,
  });
  const waiting = developmentNode({ title: '确认样品', from: '2026-12-09', to: '2026-12-10' }, {
    ownerName: null,
    followUp: {
      waiting: { kind: 'waiting', party: '备案团队', deliverable: '盖章资料' },
      nextAction: '收到后核对', reviewOn: localDate('2026-12-03'), updatedBy: user, updatedAt: '2026-11-20T00:00:00Z',
    },
  });
  const management = developmentNode({ title: '定稿工艺方案', from: '2026-11-20', to: '2026-11-25' }, {
    followUp: { waiting: { kind: 'none' }, managementDecision: '决定是否调整投产数量', updatedBy: user, updatedAt: '2026-11-20T00:00:00Z' },
  });
  const open = render({ nodes: [blocked, waiting, management], isCoordinating: true, viewport });
  const record = document.getElementById(`planning-row:development:${projectId}:${blocked.id}`);
  if (record === null) throw new Error('没有备案资料核对入口');
  expect(record.textContent).toContain('优先核对');
  expect(record.textContent).toContain('风险原因 已阻塞');
  expect(record.textContent).toContain('节点负责人 产品甲');
  expect(record.textContent).toContain('等待方待核对');
  expect(record.textContent).not.toMatch(/采购分派甲|待我回复|等什么|下次跟进日|下一步/);
  expect(Array.from(record.querySelectorAll('time'), ({ dateTime }) => dateTime)).toEqual(['2026-11-24']);
  const carry = document.querySelector('.development-gantt-carry');
  expect(carry?.textContent).toContain('负责人按约跟进');
  expect(carry?.textContent).not.toContain('明确管理介入');
  expect(carry?.textContent).toContain('节点负责人 待核对');
  expect(carry?.textContent).toMatch(/确认样品.*合成项目.*项目要求日 2026-12-10.*在等谁 备案团队.*等什么 盖章资料.*下一步 收到后核对.*下次跟进日 2026-12-03/s);
  expect(document.querySelector('.planning-gantt-scroll') === null).toBe(viewport === 'phone');
  const decision = document.getElementById(`planning-row:development:${projectId}:${management.id}`);
  expect(decision?.textContent).toContain('明确管理介入');
  expect(decision?.textContent).toContain('需要管理者决定 决定是否调整投产数量');
  click(record);
  expect(open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'development', node: blocked }), record.id);
});

it('手机我的项目默认先列出可操作节点，项目链接保留筛选，切换到甘特图仍使用原节点入口', () => {
  const finished = developmentNode({ title: '项目已结项', from: '2026-11-21', to: '2026-11-21' }, { status: 'done' });
  const next = developmentNode({ title: '项目待试产', from: '2026-11-22', to: '2026-11-23' }, {
    followUp: { waiting: { kind: 'none' }, nextAction: '接收样件并复核', reviewOn: localDate('2026-11-23'),
      updatedBy: user, updatedAt: '2026-11-20T00:00:00Z' },
  });
  const search = 'planSearch=项目';
  const open = renderOverview({ nodes: [finished, next], search });
  const rows = document.querySelectorAll<HTMLButtonElement>('.planning-list-row');
  expect(rows).toHaveLength(2);
  const first = rows[0];
  if (first === undefined) throw new Error('没有明细入口');
  expect(first.textContent).toMatch(/项目待试产.*下一步 接收样件并复核.*下次跟进日 2026-11-23/s);
  expect(rows[1]?.textContent).toContain('项目已结项');
  click(first);
  expect(open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'development', node: next }), first.id);
  const link = document.querySelector<HTMLAnchorElement>('.development-list-project-link');
  expect(new URL(link?.href ?? '', window.location.href).searchParams.get('planSearch')).toBe('项目');
  expect(document.body.textContent).not.toContain('计划周期');
  expect(document.querySelector('.development-filters')?.hasAttribute('hidden')).toBe(true);
  click(button('筛选'));
  expect(document.querySelector('.development-filters')?.hasAttribute('hidden')).toBe(false);
  expect(document.querySelector('[aria-label="项目阶段"]')).not.toBeNull();

  act(() => mounted?.unmount());
  const chartOpen = renderOverview({ nodes: [finished, next], search: `${search}&developmentOverview=gantt` });
  const chartRow = document.getElementById(first.id);
  if (chartRow === null) throw new Error('没有甘特图节点入口');
  expect(document.querySelector('[aria-label="新品开发甘特图"]')).not.toBeNull();
  click(chartRow);
  expect(chartOpen).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'development', node: next }), first.id);
});

it('手机需要协调先读实际管理决定与负责证据，周期外决策和普通等待均只生成一个节点入口', () => {
  const followUp = { updatedBy: user, updatedAt: '2026-11-20T00:00:00Z', reviewOn: localDate('2026-12-01') };
  const pending = developmentNode({ title: '等待备案', from: '2026-11-21', to: '2026-11-25' }, {
    followUp: { ...followUp, waiting: { kind: 'waiting', party: '备案团队' } },
  });
  const decision = developmentNode({ title: '试产资源协调', from: '2026-12-20', to: '2026-12-21' }, {
    followUp: { ...followUp, waiting: { kind: 'none' }, managementDecision: '决定试产供应商' },
  });
  renderOverview({ nodes: [pending, decision], search: 'developmentFocus=coordination', isManagement: true });
  const rows = document.querySelectorAll('.planning-list-row');
  expect(rows).toHaveLength(2);
  expect(rows[0]?.textContent).toMatch(/试产资源协调.*明确管理介入.*需要管理者决定 决定试产供应商.*节点负责人 产品甲.*下次跟进日 2026-12-01/s);
  expect(rows[1]?.textContent).toMatch(/等待备案.*负责人按约跟进.*在等谁 备案团队/s);
  expect(document.querySelector('.development-gantt-carry')).toBeNull();
  expect(document.querySelector('.development-stage-summary')).toBeNull();
});

it('手机项目明细把没有节点的项目放在实际行动之后，仍可直接打开并携带筛选', () => {
  const future = developmentNode({ title: '计划节点', from: '2026-11-21', to: '2026-11-25' });
  const empty = { ...project([]), id: entityId('empty-project'), title: '暂无排期的项目' };
  renderOverview({ nodes: [future], search: 'planSearch=项目', extraProjects: [empty] });
  expect(document.querySelector('.development-project-count')?.textContent).toBe('2 个项目');
  const row = document.querySelector('.planning-list-row');
  const noNodes = document.querySelector('.development-projects-without-rows');
  expect(row?.compareDocumentPosition(noNodes ?? document.body)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(noNodes?.textContent).toMatch(/暂无排期的项目.*项目暂无开发节点/);
  const href = noNodes?.querySelector('a')?.href ?? '';
  const params = new URL(href, window.location.href).searchParams;
  expect(params.get('developmentProject')).toBe(empty.id);
  expect(params.get('planSearch')).toBe('项目');
});

it('桌面打开旧卡片链接时显示明细，项目级协调仍保留责任和决策入口', () => {
  const extra = {
    ...project([]), id: entityId('management-project'), title: '需要协调的项目',
    progress: {
      confirmedStage: 'development' as const,
      followUp: { waiting: { kind: 'none' as const }, managementDecision: '确认试产窗口', reviewOn: localDate('2026-12-01'),
        updatedAt: '2026-11-20T00:00:00Z', updatedBy: user },
    },
  };
  const search = 'planSearch=项目&developmentOverview=cards&developmentFocus=coordination';
  renderOverview({ nodes: [], search, isManagement: true, extraProjects: [extra], viewport: 'desktop' });
  const options = [...document.querySelectorAll('[aria-label="新品项目视图"] label')];
  expect(options.map((option) => option.textContent)).toEqual(['明细', '甘特图']);
  expect(options[0]?.querySelector('input')?.checked).toBe(true);
  const rows = document.querySelectorAll('.development-project-followups li');
  expect(rows[0]?.textContent).toMatch(/需要协调的项目.*明确管理介入.*项目负责人 产品甲.*下次跟进日 2026-12-01.*确认试产窗口/s);
  const href = rows[0]?.querySelector('a')?.href ?? '';
  const params = new URL(href, window.location.href).searchParams;
  expect(params.get('developmentProject')).toBe(extra.id);
  expect(params.get('planSearch')).toBe('项目');
});

function renderOverview({ nodes, search, isManagement = false, extraProjects = [], viewport = 'phone' }: {
  readonly nodes: readonly ProductDevelopmentNode[];
  readonly search: string;
  readonly isManagement?: boolean;
  readonly extraProjects?: readonly ProductDevelopmentProject[];
  readonly viewport?: 'phone' | 'desktop';
}) {
  if (viewport === 'phone') installPhoneMatchMedia();
  else installMatchMedia();
  const params = new URLSearchParams(search);
  const period = readDevelopmentPeriod(params, today);
  const filters = readDevelopmentFilters(params);
  const projects = developmentProjects({ projects: [project(nodes), ...extraProjects], filters, period });
  const open = vi.fn();
  mounted = mount(memoryRouter(element(DevelopmentOverview, { filters, open, period, projects, isManagement, isMine: !isManagement, params, today,
    clear: vi.fn(), write: vi.fn(), projectPath: (id: string) => ({ search: `${search}&developmentProject=${id}` }) }), `/progress/development?${search}`));
  return open;
}

function render({ nodes, search = '', isCoordinating, viewport }: {
  readonly nodes: readonly ProductDevelopmentNode[];
  readonly search?: string;
  readonly isCoordinating?: boolean;
  readonly viewport?: 'desktop' | 'phone';
}) {
  const params = new URLSearchParams(search);
  const period = readDevelopmentPeriod(params, today);
  const filters = readDevelopmentFilters(params);
  const projects = developmentProjects({ projects: [project(nodes)], filters, period });
  const open = vi.fn();
  if (viewport === 'phone') installPhoneMatchMedia();
  else installMatchMedia();
  mounted = mount(element(DevelopmentGantt, { projects, period, today, open, ...(isCoordinating === undefined ? {} : { isCoordinating }) }));
  return open;
}

function installPhoneMatchMedia() {
  installMatchMedia();
  const original = window.matchMedia;
  vi.stubGlobal('matchMedia', (query: string) => ({ ...original(query), matches: query.includes('max-width') }));
}

function project(nodes: readonly ProductDevelopmentNode[]): ProductDevelopmentProject {
  return {
    id: projectId, title: '合成项目', store: 'dafuyan', productLeadUserId: user, productLeadName: '产品甲', createdBy: user,
    createdAt: '2026-11-01T00:00:00Z', canManage: true, nodes: [...nodes],
    progress: {
      confirmedStage: null,
      requirement: { raw: '项目预计需求', date: localDate('2026-11-26') },
      forecast: { raw: '预计完工的原表日期', date: localDate('2026-11-27') },
    },
  };
}

function developmentNode({ title, from, to }: { readonly title: string; readonly from: string; readonly to: string },
  changes: Partial<ProductDevelopmentNode> = {}): ProductDevelopmentNode {
  const plannedStart = localDate(from);
  const plannedEnd = localDate(to);
  return {
    id: entityId(title), projectId, title, plannedStart, plannedEnd, daysUntilRequired: diffDays(plannedEnd, today),
    destination: 'finished_to_warehouse', status: 'planned', ownerUserId: user, ownerName: '产品甲',
    buyerUserId: null, buyerName: null, version: 1, canReply: false, latestReply: null, replies: [], formalLink: null, batches: [], ...changes,
  };
}
