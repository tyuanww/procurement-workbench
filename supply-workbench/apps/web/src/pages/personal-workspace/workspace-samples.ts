import { shiftDay, type PersonalTask, type WorkspaceEntry } from './workspace-model.js';

const examples: readonly (Pick<PersonalTask, 'title' | 'description' | 'priority' | 'status'> & { offset: number })[] = [
  { title: '确认修护精华剩余发货日', description: 'TODAY-DEMO-01 · 合成修护精华 30mL。向工厂确认剩余 6,000 件的发货安排。', priority: 'high', status: 'doing', offset: -1 },
  { title: '核对洁面的到仓回单', description: 'TODAY-DEMO-04 · 合成氨基酸洁面 120g。与收货方核对在途 8,000 件。', priority: 'high', status: 'todo', offset: 0 },
  { title: '确认旅行套装首批收货方', description: 'TODAY-DEMO-03 · 合成清润水乳旅行套装。按采购订单数量 6,200 件核对首批计划。', priority: 'normal', status: 'todo', offset: 1 },
  { title: '复核身体乳排产回复', description: 'TODAY-DEMO-07 · 合成柔润身体乳 250mL。按订单号核对工厂回复的排产日期。', priority: 'normal', status: 'doing', offset: 2 },
  { title: '补录冻干面膜确认日期', description: 'TODAY-DEMO-02 · 合成冻干面膜 5片装。等待工厂确认首批交付时间。', priority: 'high', status: 'todo', offset: 3 },
  { title: '整理下周成品排产需求', description: '按供应商和产品条码核对需生产数量。', priority: 'low', status: 'todo', offset: 5 },
  { title: '登记修护精华已收凭据', description: 'TODAY-DEMO-01 · 核对首批已实收 4,000 件的凭据。', priority: 'normal', status: 'done', offset: 0 },
  { title: '核对晚安面膜产品条码', description: 'TODAY-DEMO-06 · 合成晚安面膜 50g。按原表回查对应的产品条码。', priority: 'low', status: 'done', offset: -1 },
];

export function sampleEntries(today: string): WorkspaceEntry[] {
  const next = shiftDay(today, 1);
  return [
    ...examples.map(({ offset, ...item }, index): WorkspaceEntry => ({
      kind: 'task', item: { ...item, id: 'sample-task-' + index, due: shiftDay(today, offset) },
    })),
    { kind: 'event', item: { id: 'sample-event-1', title: '修护精华补发确认', category: '会议', start: today + 'T15:00', end: today + 'T15:30', location: '电话会议' } },
    { kind: 'event', item: { id: 'sample-event-2', title: '洁面到仓复核', category: '任务', start: next + 'T09:30', end: next + 'T10:00', location: '收货仓' } },
  ];
}
