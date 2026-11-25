import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { arrivalTableDate } from '../../apps/web/src/features/progress/index.js';
import { LineBulkBar } from '../../apps/web/src/pages/lines/list/actions.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { noteBatches, pagesFor } from '../../apps/web/src/pages/progress/ProgressPage.js';
import { PAGE_SIZE_OPTIONS, TABLE_LOADING_DELAY_MS, tableLoading, tablePagination } from '../../apps/web/src/shared/ui/pagination.js';

const WEB_ROOT = fileURLToPath(new URL('../../apps/web', import.meta.url));
const NOW = new Date('2026-11-03T00:00:00+08:00');

describe('表格分页', () => {
  it('默认 50 行，分页在右下，有共 N 行和 20/50/100', () => {
    const changes: string[] = [];
    const config = tablePagination({
      page: 2,
      pageSize: 50,
      total: 606,
      onChange: (page) => changes.push(`page:${page}`),
      onSizeChange: (size) => changes.push(`size:${size}`),
    });
    expect(config.pageSize).toBe(50);
    expect(config.total).toBe(606);
    expect(config.placement).toEqual(['bottomEnd']);
    expect(config.pageSizeOptions).toEqual([20, 50, 100]);
    expect(config.showSizeChanger).toBe(true);
    expect(showTotalOf(config)(606)).toBe('共 606 行');
    config.onChange?.(3, 50);
    config.onChange?.(1, 100);
    expect(changes).toEqual(['page:3', 'size:100']);
    expect(PAGE_SIZE_OPTIONS).toEqual([20, 50, 100]);
  });

  it('再次请求用 Table 自带 loading，延迟 200 毫秒', () => {
    expect(TABLE_LOADING_DELAY_MS).toBe(200);
    expect(tableLoading(true)).toEqual({ spinning: true, delay: 200 });
    expect(tableLoading(false)).toEqual({ spinning: false, delay: 200 });
  });
});

describe('进度页分批取数', () => {
  it('按 200 的上限分批取完，页码从 1 开始，空数也有第一页', () => {
    expect(pagesFor({ total: 0, pageSize: 200 })).toEqual([1]);
    expect(pagesFor({ total: 200, pageSize: 200 })).toEqual([1]);
    expect(pagesFor({ total: 201, pageSize: 200 })).toEqual([1, 2]);
    expect(pagesFor({ total: 606, pageSize: 200 })).toEqual([1, 2, 3, 4]);
  });
});

describe('进度说明分批读取', () => {
  it('每批最多 200 个订单行，覆盖全部行', () => {
    const ids = Array.from({ length: 606 }, (_unused, index) => `line-${index}`);
    const batches = noteBatches(ids);
    expect(batches.length).toBe(4);
    expect(batches.every((batch) => batch.length <= 200)).toBe(true);
    expect(batches.flat()).toEqual(ids);
    expect(noteBatches([])).toEqual([]);
  });
});

describe('到货日期列', () => {
  it('同年写 MM-DD，跨年写完整日期，缺失留破折号', () => {
    expect(arrivalTableDate({ arrival: { kind: 'dated', dateText: '2026-10-01' }, now: NOW })).toBe('10-01');
    expect(arrivalTableDate({ arrival: { kind: 'overdue', dateText: '2025-12-31' }, now: NOW })).toBe('2025-12-31');
    expect(arrivalTableDate({ arrival: { kind: 'missing', dateText: '—' }, now: NOW })).toBe('—');
  });
});

describe('表格模板约束', () => {
  it('跟进台在原生表格内固定表头，保留横向滚动和固定列', async () => {
    const source = await readFile(new URL('../../apps/web/src/pages/lines/list/line-table.tsx', import.meta.url), 'utf8');
    expect(source).toContain("position: 'sticky', top: 0");
    expect(source).toContain("position: 'sticky', top: topBar");
    expect(source).toContain("fixed: 'left'");
    expect(source).toContain("x: 'max-content'");
    expect(source).not.toContain('scroll: { y');
  });
});

describe('批量条', () => {
  it('批量条写已选数量，分配用 antd 控件，没有原生 select', () => {
    const html = render(ActorRoles, { roles: ['buyer'], children: bulkBarElement() });
    expect(html).toContain('已选 2 行');
    expect(html).toContain('ant-select');
    expect(html).not.toContain('<select');
  });
});

describe('仓库里不再有 TanStack 表', () => {
  it('页面源码不引用 @tanstack，依赖里也删掉了', async () => {
    const sources = await collectSources(path.join(WEB_ROOT, 'src'));
    expect(sources.some((file) => file.includes('@tanstack'))).toBe(false);
    const pkg = JSON.parse(await readFile(path.join(WEB_ROOT, 'package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith('@tanstack'))).toEqual([]);
    expect(Object.keys(pkg.devDependencies ?? {}).filter((name) => name.startsWith('@tanstack'))).toEqual([]);
  });
});

function showTotalOf(config: ReturnType<typeof tablePagination>): (total: number) => string {
  const showTotal = config.showTotal;
  if (typeof showTotal !== 'function') throw new Error('缺少 showTotal');
  return (total: number) => {
    const text = showTotal(total, [total, total]);
    if (typeof text !== 'string') throw new Error('showTotal 没有返回字符串');
    return text;
  };
}

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

function bulkBarElement(): unknown {
  const react = requireWeb('react');
  if (!isCreator(react)) throw new Error('web 渲染模块不齐');
  return react.createElement(LineBulkBar, {
    users: [{ id: 'u1', name: '采购甲' }],
    isOwnerVisible: true,
    buyerId: '',
    setBuyerId: () => undefined,
    picked: ['line-1', 'line-2'],
    onReload: () => undefined,
    setMessage: () => undefined,
    setSkips: () => undefined,
  });
}

function render(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return typeof value === 'object' && value !== null && 'createElement' in value && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return typeof value === 'object' && value !== null && 'renderToStaticMarkup' in value && typeof value.renderToStaticMarkup === 'function';
}

async function collectSources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSources(next)));
      continue;
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
    files.push(await readFile(next, 'utf8'));
  }
  return files;
}
