import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { presetViews, readDesk } from '../../apps/web/src/features/follow-up/index.js';
import { importFollowUpScope } from '../../apps/web/src/features/imports/index.js';
import { LineTable } from '../../apps/web/src/pages/lines/list/LineListPage.js';
import { LineViewBar, clearFiltersAddress, exportAddress, filterSignature, isViewModified, readDensity, readHiddenColumns, saveAddress, toggleColumn, viewAddress, visibleColumns } from '../../apps/web/src/pages/lines/list/view-bar.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const NOW = new Date('2026-11-03T00:00:00+08:00');
const COLUMNS = readDesk('lane=finished').columns;
const SMALL = 'small';

describe('跟进台视图条', () => {
  it('常用视图和密度各有可识别的切换组，右侧有列和导出', () => {
    const html = render(LineViewBar, viewBarProps({}));
    expect(html).toContain('role="radiogroup" aria-label="常用视图"');
    expect(html).toContain('role="radiogroup" aria-label="列表密度"');
    expect(html).toContain('我的逾期');
    expect(html).toContain('未建要货');
    expect(html).toContain('宜侬在途');
    expect(html).toContain('保存当前视图');
    expect(html).toContain('导出 Excel');
    expect(html).toContain('>列<');
    expect(html).toContain('紧凑');
    expect(html).toContain('舒适');
  });
});

describe('列显示控制', () => {
  it('导出链接带上当前筛选和实际显示列', () => {
    const html = render(LineViewBar, viewBarProps({ query: 'lane=material&q=瓶', hiddenKeys: ['buyer'] }));
    expect(html).toContain('lane=material');
    expect(html).toContain('columns=po%2Cname%2Csupplier%2Cfactory');
    expect(html).not.toContain('hide=buyer');
    expect(exportAddress({ query: 'lane=finished&page=2', columns: [{ key: 'po' }, { key: 'name' }] })).toBe('/api/v1/lines/export.xlsx?lane=finished&page=2&columns=po%2Cname');
  });

  it('可选列能隐藏，采购单号列始终保留', () => {
    const hiddenKeys = ['qtyOrdered', 'received', 'factoryDelivered', 'daysInStage', 'buyer', 'status'];
    const keys = visibleColumns({ columns: COLUMNS, hiddenKeys }).map((column) => column.key);
    expect(keys).not.toContain('qtyOrdered');
    expect(keys).not.toContain('received');
    expect(keys).not.toContain('factoryDelivered');
    expect(keys).not.toContain('daysInStage');
    expect(keys).not.toContain('buyer');
    expect(keys).not.toContain('status');
    expect(keys).toContain('po');
    expect(visibleColumns({ columns: COLUMNS, hiddenKeys: ['po'] }).map((column) => column.key)).toContain('po');
    expect(toggleColumn({ search: 'lane=finished', hiddenKeys: [], key: 'po' }).toString()).toBe('lane=finished');
  });

  it('隐藏后表头消失，采购单号表头还在', () => {
    const shown = render(LineTable, tableProps([]));
    const hidden = render(LineTable, tableProps(['qtyOrdered', 'received']));
    expect(shown).toContain('订单数量');
    expect(shown).toContain('采购单号');
    expect(hidden).not.toContain('订单数量');
    expect(hidden).not.toContain('已收');
    expect(hidden).toContain('采购单号');
  });

  it('隐藏列和密度写进 URL，筛选和页码位置不变', () => {
    const search = 'lane=material&q=面膜&page=2';
    const next = toggleColumn({ search, hiddenKeys: [], key: 'qtyOrdered' });
    expect(next.get('lane')).toBe('material');
    expect(next.get('q')).toBe('面膜');
    expect(next.get('page')).toBe('2');
    expect(next.get('hide')).toBe('qtyOrdered');
    expect(readHiddenColumns(next.toString())).toEqual(['qtyOrdered']);
    expect(toggleColumn({ search: next.toString(), hiddenKeys: readHiddenColumns(next.toString()), key: 'qtyOrdered' }).get('hide')).toBeNull();
  });
});

describe('密度切换', () => {
  it('只有紧凑 small 和舒适 middle，默认 small，切换改变表格尺寸', () => {
    expect(readDensity('')).toBe(SMALL);
    expect(readDensity('density=middle')).toBe('middle');
    expect(readDensity('density=large')).toBe(SMALL);
    const compact = render(LineTable, tableProps([]));
    const comfy = render(LineTable, tableProps([], 'middle'));
    expect(compact).toContain('ant-table-small');
    expect(comfy).toContain('ant-table-medium');
  });
});

describe('已修改状态', () => {
  it('从本批导入切换预设后，请求和导出仍只查该批次', () => {
    const view = presetViews().find((item) => item.id === 'no-batch');
    if (view === undefined) throw new Error('缺少未建要货视图');
    const address = viewAddress({ search: 'lane=all&importBatchId=batch%2Ba%3Db', view });
    const desk = readDesk(address.toString());
    const query = new URLSearchParams(desk.requestQuery);
    expect(query.get('importBatchId')).toBe('batch+a=b');
    expect(query.get('stages')).toBe('no_batch');
    expect(new URL(exportAddress({ query: desk.requestQuery, columns: COLUMNS }), 'http://localhost')
      .searchParams.get('importBatchId')).toBe('batch+a=b');
    expect(clearFiltersAddress(address.toString()).toString()).toBe('lane=all&importBatchId=batch%2Ba%3Db');
  });

  it('切换到明确保存了另一批次的视图时，按保存的批次查询', () => {
    const view = { id: 'saved-b', label: 'B 批订单', query: 'lane=all&importBatchId=batch-b' };
    const address = viewAddress({ search: 'lane=all&importBatchId=batch-a', view });
    expect(new URLSearchParams(readDesk(address.toString()).requestQuery).get('importBatchId')).toBe('batch-b');
  });

  it('在导入来源下钻范围内应用保存视图时保留本批次和返回地址', () => {
    const activeId = '0199f0a0-0000-7000-8000-000000000018';
    const savedId = '0199f0a0-0000-7000-8000-000000000019';
    const backToImport = `/imports/${activeId}?drawer=import-source&source=batch`;
    const search = new URLSearchParams({ lane: 'all', importBatchId: activeId, backToImport }).toString();
    const view = { id: 'saved-b', label: 'B 批订单', query: `lane=all&stage=no_batch&importBatchId=${savedId}` };
    const address = viewAddress({ search, view });
    const { requestQuery } = readDesk(address.toString());
    expect(address.get('backToImport')).toBe(backToImport);
    expect(new URLSearchParams(requestQuery).get('importBatchId')).toBe(activeId);
    expect(new URLSearchParams(requestQuery).get('stages')).toBe('no_batch');
    expect(new URL(exportAddress({ query: requestQuery, columns: COLUMNS }), 'http://localhost').searchParams.get('importBatchId')).toBe(activeId);
  });

  it('按路由规则接受导入批次大小写、尾斜杠与编码标识', () => {
    const query = '?drawer=import-source&source=batch';
    const scope = (route: string, id = 'batch+a=b') =>
      importFollowUpScope(new URLSearchParams({ importBatchId: id, backToImport: route + query }));
    for (const route of ['/imports/batch%2Ba%3Db', '/Imports/batch%2Ba%3Db', '/imports/batch%2Ba%3Db//', '/imports/batch+a=b/']) {
      expect(scope(route)).toEqual({ id: 'batch+a=b', to: route + query, recordKey: 'batch' });
    }
    expect(scope('/imports/batch%2Ba%3Db/', 'different')).toBeNull();
    for (const route of ['/imports/%2Fetc', '/imports/%2E%2E', '/imports/%5Cwrong', '/imports/%ZZ', '//host/imports/batch+a=b']) {
      expect(scope(route)).toBeNull();
    }
  });

  it('宜侬在途沿用当前线别，可以叠加搜索并保存筛选', () => {
    const view = presetViews().find((item) => item.id === 'yinong');
    if (view === undefined) throw new Error('缺少宜侬在途');
    const address = viewAddress({ search: 'lane=material&page=3&density=middle', view });
    const desk = readDesk(address.toString());
    expect(desk.lane).toBe('material');
    expect(desk.q).toBe('');
    expect(new URLSearchParams(desk.requestQuery)).toEqual(new URLSearchParams('lane=material&inTransitFactory=yinong&page=1&pageSize=50'));
    expect(isViewModified({ search: address.toString(), view })).toBe(false);
    expect(isViewModified({ search: `${address}&q=纸盒`, view })).toBe(true);
    expect(saveAddress(`${address}&q=纸盒`)).toBe('inTransitFactory=yinong&lane=material&q=%E7%BA%B8%E7%9B%92');
    const exported = new URL(exportAddress({ query: desk.requestQuery, columns: COLUMNS }), 'http://localhost');
    expect(exported.searchParams.get('inTransitFactory')).toBe('yinong');
    expect(exported.searchParams.get('lane')).toBe('material');
    expect(clearFiltersAddress(address.toString()).toString()).toBe('lane=material&density=middle');
  });

  it('旧宜侬预设链接升级，普通宜侬搜索和已存的线别仍按原意使用', () => {
    const view = presetViews().find((item) => item.id === 'yinong');
    if (view === undefined) throw new Error('缺少宜侬在途');
    const legacy = 'lane=material&view=yinong&q=%E5%AE%9C%E4%BE%AC';
    expect(readDesk(legacy).q).toBe('');
    expect(new URLSearchParams(readDesk(legacy).requestQuery).get('inTransitFactory')).toBe('yinong');
    expect(isViewModified({ search: legacy, view })).toBe(false);
    expect(saveAddress(legacy)).toBe('lane=material&inTransitFactory=yinong');
    const custom = { id: 'custom', label: '品名搜索', query: 'lane=finished&q=%E5%AE%9C%E4%BE%AC' };
    const opened = readDesk(viewAddress({ search: 'lane=material', view: custom }).toString());
    expect(opened.lane).toBe('finished');
    expect(opened.q).toBe('宜侬');
    expect(new URLSearchParams(opened.requestQuery).has('inTransitFactory')).toBe(false);
    const legacySaved = { ...custom, query: 'q=%E5%AE%9C%E4%BE%AC' };
    const reopened = readDesk(viewAddress({ search: 'lane=material', view: legacySaved }).toString());
    expect(reopened.lane).toBe('all');
    expect(reopened.q).toBe('宜侬');
  });

  it('筛选偏离选中视图时是已修改，页码和显示设置不算', () => {
    const view = presetViews()[1];
    if (view === undefined) throw new Error('缺少预设视图');
    expect(isViewModified({ search: `stage=no_batch&view=${view.id}`, view })).toBe(false);
    expect(isViewModified({ search: `stage=no_batch&page=2&density=middle&hide=qtyOrdered&view=${view.id}`, view })).toBe(false);
    expect(isViewModified({ search: `stage=no_batch&q=面膜&view=${view.id}`, view })).toBe(true);
    expect(isViewModified({ search: 'stage=no_batch', view: undefined })).toBe(false);
    expect(filterSignature('page=2&pageSize=50&density=middle&hide=po&view=x&q=面膜')).toBe('q=面膜');
    expect(saveAddress('q=面膜&view=x&density=middle&page=2')).toBe('q=%E9%9D%A2%E8%86%9C&lane=all');
    expect(clearFiltersAddress('stage=no_batch&view=x&density=middle&hide=received&page=2').toString()).toBe('density=middle&hide=received');
  });

  it('保存和比较视图时将缺省线别视为全部线，保留明确保存的成品线', () => {
    const view = { id: 'saved', label: '全部线', query: saveAddress('q=面膜') };
    expect(isViewModified({ search: 'view=saved&q=面膜', view })).toBe(false);
    expect(isViewModified({ search: 'view=saved&q=面膜&lane=finished', view })).toBe(true);
    const finished = viewAddress({ search: 'lane=all', view: { ...view, query: saveAddress('lane=finished&q=面膜') } });
    expect(readDesk(finished.toString()).lane).toBe('finished');
  });

  it('已修改时出现提示和清除，清除回到视图查询', () => {
    const view = presetViews()[1];
    if (view === undefined) throw new Error('缺少预设视图');
    const modified = render(LineViewBar, viewBarProps({ search: `stage=no_batch&q=面膜&view=${view.id}` }));
    expect(modified).toContain('已修改');
    expect(modified.replace(/\s+/g, '')).toContain('清除');
    const clean = render(LineViewBar, viewBarProps({ search: `stage=no_batch&view=${view.id}` }));
    expect(clean).not.toContain('已修改');
    expect(clean).toContain('退出视图');
    const address = viewAddress({ search: `stage=no_batch&q=面膜&density=middle&hide=received&view=${view.id}`, view });
    expect(address.toString()).toBe('stage=no_batch&density=middle&hide=received&view=no-batch');
  });
});

function viewBarProps(override: Record<string, unknown>): Record<string, unknown> {
  const noop = () => undefined;
  return {
    search: '',
    query: readDesk('').requestQuery,
    views: presetViews(),
    userId: 'buyer-1',
    columns: COLUMNS,
    density: SMALL,
    hiddenKeys: [],
    setMessage: noop,
    setParams: noop,
    ...override,
  };
}

function tableProps(hiddenKeys: readonly string[], density: string = SMALL): Record<string, unknown> {
  const noop = () => undefined;
  return {
    columns: COLUMNS,
    rows: [],
    picked: [],
    setPicked: noop,
    page: 1,
    pageSize: 50,
    total: 0,
    search: '',
    setParams: noop,
    density,
    hiddenKeys,
    now: NOW,
  };
}

function render(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  return renderTo(server, react.createElement(type, props));
}

function renderTo(server: { renderToStaticMarkup: (node: unknown) => unknown }, node: unknown): string {
  const html = server.renderToStaticMarkup(node);
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return typeof value === 'object' && value !== null && 'createElement' in value && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return typeof value === 'object' && value !== null && 'renderToStaticMarkup' in value && typeof value.renderToStaticMarkup === 'function';
}
