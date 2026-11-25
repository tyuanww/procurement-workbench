import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { sessionRows } from '../../apps/web/src/pages/today/use-today-plan.js';
import { ActionBoard } from '../../apps/web/src/pages/today/ActionBoard.js';
import { ScheduleView } from '../../apps/web/src/pages/today/ScheduleView.js';
import { TodayScreen, type TodayScreenProps } from '../../apps/web/src/pages/today/TodayBoard.js';
import type { BoardRow, PlanLoad, TodayBoard, TodayInsight } from '../../apps/web/src/features/today/index.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const root = new URL('../../', import.meta.url);

describe('今日页两个视图', () => {
  it('个人工作台有统一的范围入口，筛选默认收起', () => {
    const html = render(TodayScreen, todayProps());
    expect(html).toContain('个人工作台');
    expect(html).toContain('aria-label="工作范围"');
    expect(html).toContain('今天要办');
    expect(html).toContain('已约跟进');
    expect(html).toContain('待分派');
    expect(html).not.toContain('title="等待方"');
    expect(html).not.toContain('title="原因"');
    expect(html).not.toContain('title="日期"');
    expect(html).not.toContain('缺确认日期');
    expect(html).not.toContain('供应商');
    expect(html).not.toContain('今天到期');
    expect(html).not.toContain('j k 或方向键移动');
  });

  it('排期视图独立成组，不再显示行动板 KPI 和原因筛选', () => {
    const html = render(TodayScreen, scheduleProps());
    expect(html).toContain('负责人');
    expect(html).toContain('供应商');
    expect(html).toContain('今天到期');
    expect(html).toContain('PO · 样品 · 11-09 至 11-10');
    expect(html).not.toContain('等待方');
    expect(html).not.toContain('缺确认日期');
    expect(html).not.toContain('今日排期指标');
    expect(html).not.toContain('截至今日');
    expect(html).not.toContain('用 j k 移动');
  });

  it('打开键盘帮助后仍可见操作反馈', () => {
    const html = render(TodayScreen, todayProps({ isHelpOpen: true, notice: '已复制催办文本' }));
    expect(html).toContain('j k 或方向键移动，Enter 打开');
    expect(html).toContain('已复制催办文本');
  });

  it('行动板的读取失败不会挡住今日排期任务', () => {
    const html = render(TodayScreen, { ...scheduleProps(), isReady: false, loadError: '行动板失败' });
    expect(html).toContain('今天到期');
    expect(html).toContain('里程碑');
    expect(html).not.toContain('行动板失败');
  });

  it('今日页 KPI 不随视图换成排期口径', () => {
    const html = render(TodayScreen, scheduleProps());
    expect(html).not.toContain('今日排期指标');
    expect(html).not.toContain('未分配');
    expect(html).not.toContain('不会自动归属当前用户');
  });
});

describe('今日视图各自渲染', () => {
  it.each(['priority', 'waiting'] as const)('工作台 %s 保留批次事实和详情入口', (group) => {
    const row: BoardRow = {
      id: 'todo-1',
      face: { ...face(), orderNo: 'PO-1', productName: '样品', date: '2026-11-24', waiting: '样例工厂' },
      actions: [],
    };
    const content = { key: group, name: '待办组标题', counts: [{ label: '待办组计数', count: 1 }], nudgeText: '样例催单', rows: [row] };
    const board: TodayBoard = { group, chips: [], body: { kind: 'groups', groups: [content], rows: [row] } };
    const html = render(ActionBoard, todayProps({ board, batchSeqOf: () => 2 }));
    expect(html).toContain('aria-label="查看详情 PO-1 · 样品 · 第 2 批"');
    expect(html.indexOf('2026-11-24')).toBeLessThan(html.indexOf('aria-label="查看详情'));
    expect(html).toMatch(group === 'priority' ? /<h2[^>]*>样品<\/h2>/ : /<h3[^>]*>样品<\/h3>/);
    if (group === 'priority') {
      expect(html).toMatch(/class="(?=[^"]*\bant-card\b)(?=[^"]*\btoday-row\b)[^"]+"/);
      expect(html).not.toContain('待办组计数');
    } else {
      expect(html).toMatch(/<h2[^>]*>待办组标题<\/h2>/);
      expect(html).toContain('复制催办文本');
    }
  });

  it('清单把分组和原因筛选放在初始收起的同一折叠区', () => {
    const html = render(ActionBoard, todayProps({ board: boardWith([], 'waiting') }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('当前筛选 · 缺确认日期');
    expect(html).not.toContain('aria-label="清单分组"');
    expect(html).not.toContain('aria-label="今日关键指标"');
    expect(html).not.toContain('今天到期');
    expect(html).not.toContain('供应商');
  });

  it('排期视图不带行动洞察也能渲染任务行', () => {
    const html = render(ScheduleView, {
      group: 'owner',
      load: readyPlan(['task:work-1']),
      focus: null,
      drawerId: null,
      onGroup: () => undefined,
      onOpen: () => undefined,
      onCloseDrawer: () => undefined,
      onRetry: () => undefined,
      onTaskChanged: () => undefined,
    });
    expect(html).toContain('今天到期');
    expect(html).toContain('负责人');
    expect(html).toContain('供应商');
    expect(html).not.toContain('今日关键指标');
    expect(html).not.toContain('缺确认日期');
    expect(html).not.toContain('等待方');
    expect(html).not.toContain('今日排期指标');
  });
});

describe('今日视图模型', () => {
  it('键盘行只取当前视图，不把两套模型拼在一起', () => {
    const plan = { load: readyPlan(['task:work-1']) };
    expect(ids(sessionRows({ board: boardWith(['todo-1'], 'waiting'), plan }))).toEqual(['todo-1']);
    expect(ids(sessionRows({ board: boardWith(['todo-1'], 'schedule'), plan }))).toEqual(['task:work-1']);
  });

  it('KPI 只有行动洞察一个函数', async () => {
    const mod: object = await import('../../apps/web/src/features/today/index.js');
    if (!('todayPageKpi' in mod) || !isKpi(mod.todayPageKpi)) throw new Error('缺少 todayPageKpi');
    expect(mod.todayPageKpi({ total: 4, urgent: 1, overdue: 2, missingDate: 3 })).toEqual([
      { key: 'total', label: '今日待办', value: 4 },
      { key: 'urgent', label: '高优先', value: 1 },
      { key: 'overdue', label: '未发逾期', value: 2 },
      { key: 'missing', label: '缺确认日期', value: 3 },
    ]);
  });

  it('任务抽屉在行动板和排期上都开着', () => {
    const action = openDrawers(drawerProps({ group: 'waiting', drawerId: 'task:work-1' }));
    const schedule = openDrawers(drawerProps({ group: 'schedule', drawerId: 'task:work-1' }));
    expect(action.task).toBe(true);
    expect(schedule.task).toBe(true);
  });

  it('订单抽屉在行动板和排期上都开着', () => {
    const action = openDrawers(drawerProps({ group: 'waiting', drawerId: 'todo-1' }));
    const schedule = openDrawers(drawerProps({ group: 'schedule', drawerId: 'todo-1' }));
    expect(action.line).toBe(true);
    expect(schedule.line).toBe(true);
  });

  it('行动板和排期视图各自一个文件，壳不再计算第二套 KPI', async () => {
    const action = await readPage('ActionBoard.tsx');
    const schedule = await readPage('ScheduleView.tsx');
    const shell = await readPage('TodayBoard.tsx');
    expect(action).not.toContain('todayPageKpi');
    expect(action).not.toContain('planInsight');
    expect(action).not.toContain('PlanLoad');
    expect(action).not.toContain('ScheduleView');
    expect(schedule).not.toContain('TaskDrawer');
    expect(schedule).not.toContain('TodayDrawer');
    expect(schedule).not.toContain('todayPageKpi');
    expect(schedule).not.toContain('todayInsights');
    expect(schedule).not.toContain('planInsight');
    expect(schedule).not.toContain('ActionBoard');
    expect(shell).toContain('TaskDrawer');
    expect(shell).toContain('TodayDrawer');
    expect(shell).not.toContain('planInsight');
    expect(shell).not.toContain('todayPageKpi');
    expect(shell).not.toContain('今日排期指标');
  });
});

function drawerProps(input: { readonly group: TodayBoard['group']; readonly drawerId: string }): TodayScreenProps {
  const noop = () => undefined;
  return {
    board: boardWith(['todo-1'], input.group),
    plan: readyPlan(['task:work-1']),
    focus: null,
    fading: null,
    drawerId: input.drawerId,
    draft: null,
    hadDate: false,
    lane: 'finished',
    isSaving: false,
    notice: '',
    saveError: '',
    isHelpOpen: false,
    isReady: true,
    loadError: '',
    onToggleReason: noop,
    onGroup: noop,
    onOpen: noop,
    onQuick: noop,
    onCopy: noop,
    onCloseDrawer: noop,
    onDraft: noop,
    onSubmit: noop,
    onRetry: noop,
    onRetryPlan: noop,
    onTaskChanged: noop,
    onBack: noop,
  };
}

function openDrawers(props: TodayScreenProps): { readonly task: boolean; readonly line: boolean } {
  const found = { task: false, line: false };
  const report = console.error;
  console.error = () => undefined;
  try {
    walk(TodayScreen(props), found);
  } finally {
    console.error = report;
  }
  return found;
}

function walk(node: unknown, found: { task: boolean; line: boolean }): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, found));
    return;
  }
  if (!isElement(node)) return;
  noteDrawer(node.props, found);
  if (typeof node.type === 'function') {
    try {
      walk(node.type(node.props), found);
    } catch {
      // 用了 hook 的组件停在这一层，抽屉是否打开已经记在 props 上。
    }
  }
  walk(node.props.children, found);
}

function noteDrawer(props: unknown, found: { task: boolean; line: boolean }): void {
  if (!isRecord(props) || props.isOpen !== true) return;
  if (typeof props.workItemId === 'string') found.task = true;
  if ('row' in props) found.line = true;
}

function isElement(value: unknown): value is { readonly type: unknown; readonly props: { readonly children?: unknown } } {
  return isRecord(value) && 'type' in value && isRecord(value.props);
}

function ids(rows: readonly { readonly id: string }[]): string[] {
  return rows.map((row) => row.id);
}

function isKpi(value: unknown): value is (insight: TodayInsight) => readonly { readonly key: string; readonly label: string; readonly value: number; readonly hint?: string }[] {
  return typeof value === 'function';
}

async function readPage(name: string): Promise<string> {
  return readFile(new URL(`apps/web/src/pages/today/${name}`, root), 'utf8');
}

function boardWith(rowIds: readonly string[], group: TodayBoard['group']): TodayBoard {
  const rows = rowIds.map((id) => ({ id, face: face(), actions: [] }));
  return { group, chips: [{ code: 'missing_date', label: '缺确认日期', count: 3, isSelected: true }], body: { kind: 'groups', groups: [], rows } };
}

function face(): BoardRow['face'] {
  return { reason: '未发逾期', overdue: '—', overdueTone: 'quiet', orderNo: '—', productName: '—', date: '—' };
}

function readyPlan(rowIds: readonly string[]): PlanLoad {
  const rows = rowIds.map((id) => ({ id, workItemId: id, title: '里程碑', meta: 'PO · 样品 · 11-09 至 11-10', tags: [] }));
  return {
    kind: 'ready',
    board: {
      kind: 'groups',
      groups: [{ key: 'due-today', name: '今天到期', counts: [], note: null, isUnassigned: false, rows }],
      rows,
    },
  };
}

function scheduleProps(): Record<string, unknown> {
  return todayProps({
    board: boardWith(['todo-1'], 'schedule'),
    plan: readyPlan(['task:work-1']),
  });
}

function todayProps(override: Record<string, unknown> = {}): Record<string, unknown> {
  const noop = () => undefined;
  return {
    board: { group: 'kanban', chips: [{ code: 'missing_date', label: '缺确认日期', count: 3, isSelected: false }], body: { kind: 'empty', text: '今天没有需要处理的事。下一步：去跟进中心看看。' } },
    focus: null,
    fading: null,
    drawerId: null,
    draft: null,
    hadDate: false,
    lane: 'finished',
    isSaving: false,
    notice: '',
    saveError: '',
    isHelpOpen: false,
    isReady: true,
    loadError: '',
    onToggleReason: noop,
    onGroup: noop,
    onOpen: noop,
    onQuick: noop,
    onCopy: noop,
    onCloseDrawer: noop,
    onDraft: noop,
    onSubmit: noop,
    onRetry: noop,
    onBack: noop,
    ...override,
  };
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
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => string } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
