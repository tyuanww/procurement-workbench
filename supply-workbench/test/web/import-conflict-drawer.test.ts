import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ImportRowView } from '../../packages/application/src/imports/views.js';
import { drawerWidth, drawerWide } from '../../apps/web/src/theme/tokens.js';
import { ImportConflictDrawerFields } from '../../apps/web/src/pages/imports/ImportConflictDrawer.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import type { ConflictCandidate } from '../../apps/web/src/features/imports/index.js';
import { readImportConflictDrawer, writeImportConflictDrawer } from '../../apps/web/src/pages/imports/import-conflict-drawer-url.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

const row: ImportRowView = {
  id: 'row-1',
  importBatchId: 'batch-1',
  sheetName: '采购订单总表',
  rowNo: 12,
  raw: {},
  parsed: {},
  issues: [{ code: 'KEY_AMBIGUOUS_EXISTING', severity: 'conflict', column: null, message: '有多个可能的订单行', raw: 'PO-1' }],
  action: 'conflict',
  targetId: null,
  skipReason: null,
};

const candidate: ConflictCandidate = {
  id: 'line-1',
  poRaw: 'PO-1',
  nameRaw: '海葡萄',
  barcodeRaw: '2000000003023',
};

describe('导入冲突 720 抽屉', () => {
  it('打开和关闭只改 drawer 参数，保留现有页码', () => {
    const opened = writeImportConflictDrawer({ search: '?page=2', isOpen: true });
    expect(opened.toString()).toBe('page=2&drawer=conflicts');
    expect(readImportConflictDrawer('?page=2&drawer=conflicts')).toBe(true);

    const closed = writeImportConflictDrawer({ search: opened.toString(), isOpen: false });
    expect(closed.toString()).toBe('page=2');
    expect(readImportConflictDrawer('?drawer=alias')).toBe(false);
  });

  it('导入冲突使用 720，现有快捷抽屉仍是 480', () => {
    expect(drawerWide).toBe(720);
    expect(drawerWidth).toBe(480);
  });

  it('展示冲突行、现有候选和新建选项', () => {
    const react = requireWeb('react');
    if (!isCreator(react)) throw new Error('web 渲染模块不齐');
    const html = markup(ActorRoles, {
      roles: ['reviewer'],
      children: react.createElement(ImportConflictDrawerFields, {
        rows: [row],
        candidates: { 'row-1': [candidate] },
        choices: { 'row-1': 'line-1' },
        onChoice: () => undefined,
      }),
    });
    expect(html).toContain('第 12 行');
    expect(html).toContain('选择现有订单行或新建');
    expect(html).toContain('PO-1');
    expect(html).toContain('海葡萄');
    expect(html).toContain('新建');
  });
});

function markup(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
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
