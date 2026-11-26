// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { todayBoard } from '../../apps/web/src/features/today/index.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { TodayScreen, type TodayScreenProps } from '../../apps/web/src/pages/today/TodayBoard.js';
import { act, button, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, useHostState } from './party-preview-dom.js';

const pendingRows: NonNullable<TodayScreenProps['pendingBatch']> = [{
  orderLineId: 'line-1', poRaw: 'PO-1', nameRaw: '待建订单样例', qtyOrdered: 120, unit: '件', action: 'create', missingFields: [],
}];
const myPlan: NonNullable<TodayScreenProps['myPlan']> = {
  kind: 'ready',
  rows: [{
    id: 'task:plan-1', workItemId: 'plan-1', title: '逾期排期样例', meta: 'PO-2 · 样品 · 11-22',
    tags: [{ key: 'due', label: '逾期 2 天', tone: 'danger', fill: 'solid' }],
  }],
};
const lane = 'section[aria-label="内部待办"]';
const order = 'a[href="/lines/line-1"]';

it.each([
  { pendingBatch: pendingRows, tasks: { kind: 'idle' }, count: 1 },
  { pendingBatch: [], tasks: myPlan, count: 1 },
  { pendingBatch: pendingRows, tasks: myPlan, count: 2 },
] satisfies readonly { pendingBatch: typeof pendingRows; tasks: typeof myPlan | { kind: 'idle' }; count: number }[])(
  '默认看板只有新增待办也能显示 $count 张卡片', ({ pendingBatch, tasks, count }) => {
    const opened: string[] = [];
    const dispose = renderScreen(element(TodayScreen, props({ pendingBatch, myPlan: tasks, onOpen: (id) => opened.push(id) })));
    try {
      const list = [...document.querySelectorAll(`${lane} li`)];
      expect(list).toHaveLength(count);
      expect(textOf(lane)).toContain(`${count} 项`);
      expect(document.querySelectorAll(order)).toHaveLength(pendingBatch.length);
      expect(document.querySelectorAll(`${lane} ${order}`)).toHaveLength(pendingBatch.length);
      if (tasks.kind === 'ready') {
        expect(list[0]?.textContent).toContain('逾期 2 天');
        click(button('逾期排期样例'));
        expect(opened).toEqual(['task:plan-1']);
      }
      expect(document.body.textContent).not.toContain('生成首批次');
    } finally {
      dispose();
    }
  },
);

it('原因筛选的空结果不混入未匹配的待建订单或排期', () => {
  const base = props({});
  const board = { ...base.board, chips: [{ code: 'unshipped', label: '未发', count: 0, isSelected: true }] };
  const dispose = renderScreen(element(TodayScreen, props({ board, pendingBatch: pendingRows, myPlan })));
  try {
    expect(document.body.textContent).toContain('当前筛选没有待办');
    expect(document.querySelector(order)).toBeNull();
    expect(document.body.textContent).not.toContain('逾期排期样例');
  } finally {
    dispose();
  }
});

it('从订单返回时定位到待建批次的原页和订单链接', () => {
  const pendingBatch = pendingRows.flatMap((row) => Array.from({ length: 51 }, (_, index) => ({
    ...row, orderLineId: 'line-' + (index + 1),
  })));
  const dispose = renderScreen(element(TodayScreen, props({ pendingBatch, pendingFocusId: 'line-51' })));
  try {
    expect(document.querySelector(`${lane} nav[aria-label="待建批次分页"]`)).not.toBeNull();
    expect(document.querySelectorAll(`${lane} li article`)).toHaveLength(1);
    expect(document.activeElement?.getAttribute('href')).toBe('/lines/line-51');
  } finally {
    dispose();
  }
});

it('生成最后一个待建批次后，卡片退出看板但成功反馈仍可见', async () => {
  installFetch();
  const dispose = renderScreen(element(ActorRoles, { roles: ['buyer'], children: element(LastPendingScreen) }));
  try {
    click(button('生成首批次'));
    await act(async () => {
      fulfill({ urlPart: '/api/v1/lines/bulk/hint-batches', status: 200, body: { created: 1, skipped: [] } });
    });
    expect(document.querySelector(order)).toBeNull();
    expect(document.querySelector(lane)).toBeNull();
    expect([...document.querySelectorAll('[role="status"]')].some((status) => status.textContent === '已生成首批次')).toBe(true);
  } finally {
    dispose();
  }
});

function LastPendingScreen() {
  const [rows, setRows] = useHostState(pendingRows);
  return element(TodayScreen, props({
    pendingBatch: rows,
    onPendingBatchChanged: async () => { setRows([]); return true; },
  }));
}

function renderScreen(node: unknown) {
  installMatchMedia();
  const root = mount(memoryRouter(node, '/today'));
  return () => {
    act(() => { root.unmount(); });
    resetDom();
  };
}

const noop = () => undefined;

function props(overrides: Partial<TodayScreenProps>): TodayScreenProps {
  return {
    board: todayBoard({ items: [], reasons: [], group: 'kanban', buyerName: '' }),
    focus: null, fading: null, drawerId: null, draft: null, hadDate: false, lane: 'finished',
    isSaving: false, notice: '', saveError: '', isHelpOpen: false, isReady: true, loadError: '',
    onGroup: noop, onOpen: noop, onQuick: noop, onCopy: noop, onCloseDrawer: noop,
    onDraft: noop, onSubmit: noop, onRetry: noop, onBack: noop,
    ...overrides,
  };
}
