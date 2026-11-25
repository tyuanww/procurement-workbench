import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type {
  FactoryLinkCounts,
  OwnerCoverage,
  PendingOwnerView,
  RelinkFactoryRowsResult,
  UnmatchedFactoryRowView,
  UserView,
} from '../../packages/contracts/src/index.js';
import { renderMasterRoute } from './master-route-render.js';
import { MASTER_TABS, masterTabOf, writeMasterTab } from '../../apps/web/src/pages/master/master-tabs.js';
import {
  coverageStats,
  loadOwnerCoverage,
  loadPendingOwners,
  loadResolvers,
  ownerSourceLabel,
  OwnerCoverageCards,
  PendingOwnerList,
  resolveOwnerMapping,
  type CoverageState,
  type LoadState,
  type ResolversState,
} from '../../apps/web/src/pages/master/OwnerMapTab.js';
import {
  backfillResultText,
  backfillSupplierParties,
  factoryKindLabel,
  FactoryLinkActions,
  FactoryLinkCountsCards,
  linkCountStats,
  loadFactoryLinkCounts,
  relinkFactoryRows,
  relinkResultText,
  UnmatchedFactoryRowList,
  unmatchedReasonLabel,
} from '../../apps/web/src/pages/master/FactoryLinkTab.js';
const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const COVERAGE: OwnerCoverage = { total: 606, assigned: 480, unassigned: 100, pending: 26 };
const USER: UserView = { id: 'user-1', name: '采购甲', roles: ['buyer'], active: true, feishuOpenId: null };
const GONE: UserView = { id: 'user-2', name: '离职', roles: ['buyer'], active: false, feishuOpenId: null };
const PENDING: PendingOwnerView = { id: 'assignment-1', lineId: 'line-1', nameRaw: '张三', source: 'po_master', effectiveAt: '2026-11-09T00:00:00.000Z' };
const COUNTS: FactoryLinkCounts = { linked: 7200, manual: 100, unlinked: 39 };
const UNMATCHED: UnmatchedFactoryRowView = { rowId: 'row-1', kind: 'shipment', factoryPartyId: 'factory-1', poRaw: 'PO-1', itemCodeRaw: 'ITEM-1', barcodeRaw: null, reason: 'NO_FACTORY_ROW_MATCH', suggestedAction: '补工厂进度行或人工挂接' };
const RELINK: RelinkFactoryRowsResult = { factoryRows: 7339, factoryLinked: 7200, factoryManual: 100, factoryUnlinked: 39, conflicts: 0, linesLinked: 600, linesUnlinked: 6, byBasis: { po: 7000, item_code: 200, barcode: 100 } };
it('主数据默认打开别名，旧的未关联上报链接归到工厂关联', () => {
  expect(MASTER_TABS.map((item) => item.label)).toEqual(['别名审核', '一号多名', '负责人映射', '工厂关联']);
  expect(masterTabOf(null)).toBe('aliases');
  expect(masterTabOf('owner-map')).toBe('owner-map');
  expect(masterTabOf('factory-link')).toBe('factory-link');
  expect(masterTabOf('unlinked')).toBe('factory-link');
  expect(masterTabOf('nope')).toBe('aliases');
  expect(writeMasterTab('drawer=alias&aliasId=a1', 'factory-link').toString()).toBe('drawer=alias&aliasId=a1&tab=factory-link');
  expect(writeMasterTab('drawer=alias&aliasId=a1&tab=owner-map', 'aliases').toString()).toBe('drawer=alias&aliasId=a1');
});
it('覆盖率和来源标签来自接口字段，不猜负责人', () => {
  expect(coverageStats(COVERAGE)).toEqual([
    { key: 'total', label: '订单行总数', value: 606 },
    { key: 'assigned', label: '已归属', value: 480 },
    { key: 'unassigned', label: '未归属', value: 100 },
    { key: 'pending', label: '待审核', value: 26 },
  ]);
  expect(ownerSourceLabel('po_master')).toBe('采购单导入');
  expect(ownerSourceLabel('mapping_import')).toBe('映射导入');
  expect(ownerSourceLabel('manual')).toBe('手工指定');
});
it('负责人接口分开处理 403 和失败：403 显示只读说明，失败显示重试', async () => {
  const restoreForbidden = mockFetch(() => forbidden());
  let coverage: CoverageState = { kind: 'loading' };
  await loadOwnerCoverage((state) => { coverage = state; });
  restoreForbidden();
  expect(coverage).toEqual({ kind: 'forbidden' });
  const restoreFailure = mockFetch(() => jsonResponse({}, 500));
  let failed: CoverageState = { kind: 'loading' };
  let pending: LoadState<readonly PendingOwnerView[]> = { kind: 'loading' };
  await loadOwnerCoverage((state) => { failed = state; });
  await loadPendingOwners((state) => { pending = state; });
  restoreFailure();
  expect(failed).toEqual({ kind: 'error', message: '负责人覆盖统计没有读出来。' });
  expect(pending).toEqual({ kind: 'error', message: '待审核负责人没有读出来。' });

  const restoreSuccess = mockFetch((url) => url.endsWith('/owners/coverage') ? jsonResponse(COVERAGE) : jsonResponse({ items: [PENDING] }));
  let readyCoverage: CoverageState = { kind: 'loading' };
  let readyPending: LoadState<readonly PendingOwnerView[]> = { kind: 'loading' };
  await loadOwnerCoverage((state) => { readyCoverage = state; });
  await loadPendingOwners((state) => { readyPending = state; });
  restoreSuccess();
  expect(readyCoverage).toEqual({ kind: 'ready', value: COVERAGE });
  expect(readyPending).toEqual({ kind: 'ready', value: [PENDING] });
});

it('负责人候选人只取在职用户，无用户列表权限时只读', async () => {
  const restore = mockFetch(() => jsonResponse([USER, GONE]));
  let resolvers: ResolversState = { kind: 'loading' };
  await loadResolvers((state) => { resolvers = state; });
  restore();
  expect(resolvers).toEqual({ kind: 'ready', users: [USER] });

  const restoreForbidden = mockFetch(() => forbidden());
  let denied: ResolversState = { kind: 'loading' };
  await loadResolvers((state) => { denied = state; });
  restoreForbidden();
  expect(denied).toEqual({ kind: 'forbidden' });
});

it('指定负责人提交原始名称和用户 id，并把更新条数交给调用方', async () => {
  const requests: { readonly url: string; readonly body: string; readonly method: string }[] = [];
  const restore = mockFetch((url, init) => {
    requests.push({ url, body: String(init?.body), method: String(init?.method) });
    return jsonResponse({ updated: 3 });
  });
  let updated = -1;
  await resolveOwnerMapping({ nameRaw: '张三', owner: USER, onUpdated: (value) => { updated = value; } });
  restore();
  expect(requests).toEqual([{ url: '/api/v1/owners/resolve-pending', body: JSON.stringify({ ownerNameRaw: '张三', ownerUserId: 'user-1' }), method: 'POST' }]);
  expect(updated).toBe(3);
});

it('工厂关联读接口失败不伪装成 0，重跑和回填走 POST 空对象', async () => {
  const restoreFailure = mockFetch(() => jsonResponse({}, 500));
  let counts: LoadState<FactoryLinkCounts> = { kind: 'loading' };
  await loadFactoryLinkCounts((state) => { counts = state; });
  restoreFailure();
  expect(counts).toEqual({ kind: 'error', message: '工厂关联概览没有读出来。' });

  const calls: { readonly url: string; readonly body: string }[] = [];
  const restoreOk = mockFetch((url, init) => {
    calls.push({ url, body: String(init?.body) });
    return jsonResponse(COUNTS);
  });
  let readyCounts: LoadState<FactoryLinkCounts> = { kind: 'loading' };
  await loadFactoryLinkCounts((state) => { readyCounts = state; });
  restoreOk();
  expect(readyCounts).toEqual({ kind: 'ready', value: COUNTS });

  const restoreRelink = mockFetch((url, init) => {
    calls.push({ url, body: String(init?.body) });
    return jsonResponse(RELINK);
  });
  const relinked = await relinkFactoryRows();
  restoreRelink();
  const restoreBackfill = mockFetch((url, init) => {
    calls.push({ url, body: String(init?.body) });
    return jsonResponse({ updated: 12 });
  });
  const backfilled = await backfillSupplierParties();
  restoreBackfill();
  expect(relinked).toEqual(RELINK);
  expect(backfilled).toBe(12);
  expect(calls.slice(1)).toEqual([
    { url: '/api/v1/factory-links/relink', body: '{}' },
    { url: '/api/v1/factory-links/backfill-suppliers', body: '{}' },
  ]);
});

it('结果文案和状态文案区分成功、冲突和类型', () => {
  expect(linkCountStats(COUNTS)).toEqual([
    { key: 'linked', label: '已关联', value: 7200 },
    { key: 'manual', label: '手工关联', value: 100 },
    { key: 'unlinked', label: '未关联', value: 39 },
  ]);
  expect(relinkResultText(RELINK)).toContain('工厂行 7339 条');
  expect(relinkResultText(RELINK)).toContain('冲突 0');
  expect(backfillResultText(12)).toContain('已回填 12 条采购单');
  expect(factoryKindLabel('shipment')).toBe('成品出货');
  expect(factoryKindLabel('in_transit')).toBe('在途订单');
  expect(factoryKindLabel('unknown-kind')).toBe('unknown-kind');
  expect(unmatchedReasonLabel('NO_CANDIDATE_LINE')).toBe('没有候选订单行');
  expect(unmatchedReasonLabel('UNKNOWN_REASON')).toBe('UNKNOWN_REASON');
});

it('覆盖率卡片用 antd Statistic，写清口径和没有假负责人', () => {
  const html = render(OwnerCoverageCards, { coverage: COVERAGE });
  expect(html).toContain('负责人覆盖');
  expect(html).toContain('订单行总数');
  expect(html).toContain('待审核');
  expect(html).toContain('ant-statistic');
  expect(html).toContain('不显示假负责人');
});

it('待审核行显示原始名称和来源；管理员可指定，审核员只读', () => {
  const adminHtml = render(PendingOwnerList, {
    state: { kind: 'ready', value: [PENDING] },
    resolvers: { kind: 'ready', users: [USER] },
    busyName: null,
    onResolve: () => undefined,
    onRetry: () => undefined,
  });
  expect(adminHtml).toContain('张三');
  expect(adminHtml).toContain('采购单导入');
  expect(adminHtml).toContain('订单行 line-1');
  expect(adminHtml).toContain('ant-select');
  expect(adminHtml).toContain('指定负责人');
  expect(adminHtml).not.toContain('<select');

  const reviewerHtml = render(PendingOwnerList, {
    state: { kind: 'ready', value: [PENDING] },
    resolvers: { kind: 'forbidden' },
    busyName: null,
    onResolve: () => undefined,
    onRetry: () => undefined,
  });
  expect(reviewerHtml).toContain('只能查看待审核负责人');
  expect(reviewerHtml).toContain('管理员');
  expect(reviewerHtml).toContain('只读');
  expect(reviewerHtml).not.toContain('指定负责人');
});

it('待审核读取失败给重试；空队列给下一步', () => {
  const failed = render(PendingOwnerList, {
    state: { kind: 'error', message: '待审核负责人没有读出来。' },
    resolvers: { kind: 'loading' },
    busyName: null,
    onResolve: () => undefined,
    onRetry: () => undefined,
  });
  expect(failed).toContain('待审核负责人没有读出来');
  expect(failed).toContain('ant-btn');
  const empty = render(PendingOwnerList, {
    state: { kind: 'ready', value: [] },
    resolvers: { kind: 'ready', users: [USER] },
    busyName: null,
    onResolve: () => undefined,
    onRetry: () => undefined,
  });
  expect(empty).toContain('没有待审核的负责人');
  expect(empty).toContain('下一步');
});

it('工厂概览和未匹配行用 antd 卡片与标签展示原因和建议动作', () => {
  const countsHtml = render(FactoryLinkCountsCards, { counts: COUNTS });
  expect(countsHtml).toContain('工厂关联概览');
  expect(countsHtml).toContain('已关联');
  expect(countsHtml).toContain('7,200');
  expect(countsHtml).toContain('ant-statistic');

  const unmatchedHtml = render(UnmatchedFactoryRowList, { rows: [UNMATCHED] });
  expect(unmatchedHtml).toContain('成品出货');
  expect(unmatchedHtml).toContain('单号 PO-1');
  expect(unmatchedHtml).toContain('没有匹配到工厂行');
  expect(unmatchedHtml).toContain('补工厂进度行或人工挂接');

});

it('工厂操作有确认、加载态和禁用，仍用 antd 按钮', () => {
  const idle = render(FactoryLinkActions, { action: null, onRelink: () => undefined, onSchedule: () => undefined, onBackfill: () => undefined });
  expect(idle).toContain('重跑工厂关联');
  expect(idle).toContain('重跑排产关联');
  expect(idle).toContain('回填供应商主体');
  const busy = render(FactoryLinkActions, { action: 'relink', onRelink: () => undefined, onSchedule: () => undefined, onBackfill: () => undefined });
  expect(busy).toContain('ant-btn-loading');
});

it('旧工厂待处理链接和两个诊断视图各自显示业务范围', () => {
  const all = renderMasterRoute('/master');
  expect(all).toContain('>别名审核</h1>');
  expect(all).not.toContain('role="tab"');
  expect(all).not.toContain('未关联上报');
  expect(all).not.toContain('重跑工厂关联');
  const factory = renderMasterRoute('/master?tab=factory-link');
  expect(factory).toContain('重跑工厂关联');
  expect(factory).toContain('回填供应商主体');
  const legacy = renderMasterRoute('/master?tab=unlinked');
  expect(legacy).toContain('当前待处理上报');
  for (const [scope, title] of [['active', '当前关联诊断'], ['historical', '历史关联诊断']]) {
    const diagnostic = renderMasterRoute(`/master?tab=factory-link&scope=${scope}`);
    expect(diagnostic).toContain(`>${title}</h1>`);
    expect(diagnostic).not.toContain('重跑工厂关联');
  }
});

function render(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function mockFetch(handler: (url: string, init: RequestInit | undefined) => Response): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => handler(String(input), init);
  return () => { globalThis.fetch = previous; };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function forbidden(): Response {
  return jsonResponse({ error: { code: 'FORBIDDEN', message: '这个角色看不到这页。', details: {} } }, 403);
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
