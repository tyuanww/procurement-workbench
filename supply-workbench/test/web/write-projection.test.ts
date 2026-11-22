import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { can, type PermissionAction, type Role } from '../../packages/domain/src/index.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { TaskActionBar } from '../../apps/web/src/features/plan/TaskDrawer.js';
import { ActionBoard } from '../../apps/web/src/pages/today/ActionBoard.js';
import { RecordFooter } from '../../apps/web/src/pages/today/TodayDrawer.js';
import { ConflictSaveBar, ImportConflictDrawerFields } from '../../apps/web/src/pages/imports/ImportConflictDrawer.js';
import type { ImportRowView } from '../../packages/contracts/src/index.js';
import { ImportCenter } from '../../apps/web/src/pages/imports/ImportCenter.js';
import { LineBulkBar } from '../../apps/web/src/pages/lines/list/actions.js';
import { ProgressNote } from '../../apps/web/src/pages/progress/progress-note.js';
import { FeishuPublish, ReportListPage } from '../../apps/web/src/pages/reports/ReportPages.js';
import type { TodayBoard } from '../../apps/web/src/features/today/index.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ROLES = ['manager', 'lead', 'buyer', 'reviewer'] as const satisfies readonly Role[];

const CASES: readonly { readonly marker: string; readonly action: PermissionAction; readonly show: (role: Role) => string }[] = [
  { marker: '按总表生成批次', action: 'lines.write', show: showBulk },
  { marker: '记下进度', action: 'records.write', show: showNote },
  { marker: '登记发货', action: 'records.write', show: showShip },
  { marker: '标记完成', action: 'records.write', show: showTask },
  { marker: '取消任务', action: 'records.write', show: showTask },
  { marker: '确 认', action: 'records.write', show: showConfirm },
  { marker: '开始解析', action: 'imports.write', show: showImport },
  { marker: '保存当前页', action: 'imports.write', show: showConflict },
  { marker: '选择现有订单行或新建', action: 'imports.write', show: showConflictForm },
  { marker: '生成全店周报', action: 'reports.generate', show: showGenerate },
  { marker: '写入飞书文档', action: 'reports.generate', show: showFeishu },
];

for (const role of ROLES) {
  for (const item of CASES) {
    const canSee = can({ roles: [role] }, item.action);
    it(`${role} ${canSee ? '看得到' : '看不到'} ${item.marker}`, () => {
      const html = item.show(role);
      if (canSee) expect(html).toContain(item.marker);
      else expect(html).not.toContain(item.marker);
    });
  }
}

function showBulk(role: Role): string {
  return roleMarkup({ role, type: LineBulkBar, props: {
    users: [{ id: 'u1', name: '采购甲' }],
    isOwnerVisible: true,
    buyerId: '',
    setBuyerId: () => undefined,
    picked: ['line-1'],
    query: '',
    setRows: () => undefined,
    setTotal: () => undefined,
    gate: { start: () => 1, isLatest: () => true },
    setMessage: () => undefined,
    setSkips: () => undefined,
  } });
}

function showNote(role: Role): string {
  return roleMarkup({ role, type: ProgressNote, props: {
    lineId: 'line-1',
    saved: '',
    draft: '',
    onDraft: () => undefined,
    onSaved: () => undefined,
    onError: () => undefined,
  } });
}

function showShip(role: Role): string {
  return roleMarkup({ role, type: ActionBoard, props: {
    board: shipBoard(),
    insight: { total: 1, urgent: 0, overdue: 0, missingDate: 0 },
    focus: null,
    fading: null,
    onToggleReason: () => undefined,
    onGroup: () => undefined,
    onOpen: () => undefined,
    onQuick: () => undefined,
    onCopy: () => undefined,
  } });
}

function showTask(role: Role): string {
  return roleMarkup({
    role,
    type: TaskActionBar,
    props: { status: 'in_progress', isSaving: false, onClose: () => undefined, onChange: () => undefined },
  });
}

function showConfirm(role: Role): string {
  return roleMarkup({
    role,
    type: RecordFooter,
    props: { draft: { kind: 'ship', qty: 1, shippedOn: '2026-11-10' }, hadDate: false, isSaving: false, onSubmit: () => undefined },
  });
}

function showImport(role: Role): string {
  const react = reactOf();
  const router = routerOf();
  const page = react.createElement(router.MemoryRouter, { children: react.createElement(ImportCenter, null) });
  return markup(ActorRoles, { roles: [role], children: page });
}

function showConflict(role: Role): string {
  return roleMarkup({
    role,
    type: ConflictSaveBar,
    props: { rowCount: 1, page: 1, total: 1, isSaving: false, isLoading: false, canSave: true, onPageChange: () => undefined, onSave: () => undefined },
  });
}

function showConflictForm(role: Role): string {
  return roleMarkup({
    role,
    type: ImportConflictDrawerFields,
    props: { rows: [conflictRow()], candidates: {}, choices: {}, onChoice: () => undefined },
  });
}

function conflictRow(): ImportRowView {
  return {
    id: 'row-1',
    importBatchId: 'batch-1',
    sheetName: '总表',
    rowNo: 2,
    raw: {},
    parsed: {},
    issues: [{ code: 'HEADER_NOT_FOUND', severity: 'error', column: null, message: '多个订单行', raw: null }],
    action: 'conflict',
    targetId: null,
    skipReason: null,
  };
}

function showGenerate(role: Role): string {
  return roleMarkup({ role, type: ReportListPage, props: null });
}

function showFeishu(role: Role): string {
  return roleMarkup({ role, type: FeishuPublish, props: { configured: true, isPending: false, onPublish: () => undefined } });
}

function roleMarkup(input: { readonly role: Role; readonly type: unknown; readonly props: unknown }): string {
  const react = reactOf();
  return markup(ActorRoles, { roles: [input.role], children: react.createElement(input.type, input.props) });
}

function shipBoard(): TodayBoard {
  const row = {
    id: 'row-1',
    face: { reason: '逾期', overdue: '—', overdueTone: 'quiet' as const, orderNo: 'PO', productName: '面膜', date: '—' },
    actions: [{ kind: 'ship' as const, label: '登记发货' }],
  };
  return {
    group: 'waiting',
    chips: [],
    body: {
      kind: 'groups',
      groups: [{ key: 'g', name: '甲代工厂', counts: [], nudgeText: '催一下', rows: [row] }],
      rows: [row],
    },
  };
}

function markup(type: unknown, props: unknown): string {
  const react = reactOf();
  const server = serverOf();
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function reactOf(): { createElement: (type: unknown, props: unknown) => unknown } {
  const value: unknown = requireWeb('react');
  if (!isCreator(value)) throw new Error('web 渲染模块不齐');
  return value;
}

function serverOf(): { renderToStaticMarkup: (node: unknown) => unknown } {
  const value: unknown = requireWeb('react-dom/server');
  if (!isRenderer(value)) throw new Error('web 渲染模块不齐');
  return value;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function routerOf(): { MemoryRouter: unknown } {
  const value: unknown = requireWeb('react-router');
  if (!isRecord(value) || !('MemoryRouter' in value)) throw new Error('web 路由模块不齐');
  return { MemoryRouter: value.MemoryRouter };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
