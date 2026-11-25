import { expect, it } from 'vitest';
import { DirectorProjectSchema, SCHEDULE_MILESTONES, type DirectorProject } from '../../packages/contracts/src/director-projects.js';
import { arrivalGroups, projectFocus } from '../../apps/web/src/pages/director-home/project-progress.js';

function project(arrival: string, bom = ''): DirectorProject {
  const milestones = Object.fromEntries(SCHEDULE_MILESTONES.map((key) => [key, '']));
  return DirectorProjectSchema.parse({ row: 1, name: '合成产品', brand: '测试店铺', arrival, notes: '确认包装资料', contact: '测试经理', milestones: { ...milestones, BOM表搭建情况: bom } });
}

it('首要事项先核对已过预计日期的产品，只有月份时保留整月精度', () => {
  const current = project('2026.11', '未完成');
  const past = project('2026/11/24');
  expect(projectFocus([current, past], '2026-11-25')).toMatchObject({ project: past, action: '核对实际入仓情况' });
  expect(projectFocus([current], '2026-11-25')).toMatchObject({ project: current, action: 'BOM 表未完成' });
});

it('最近入仓月优先看明确未完成的准备项，保留主要事项原文与月份缺失', () => {
  const pending = project('2026.12.28', '未完成');
  const unclear = project('2026/12/01', '待确认');
  expect(projectFocus([unclear, pending, project('2027.01', '未完成')], '2026-11-25')?.project).toBe(pending);
  expect(projectFocus([unclear], '2026-11-25')?.action).toBe('确认包装资料');
  expect(projectFocus([project('下单后两个月')], '2026-11-25')?.action).toBe('确认预计入仓月份');
  expect(projectFocus([], '2026-11-25')).toBeUndefined();
});

it('月份跨年按日历排列，时期外与未定月份均可回查，非法日期不计入当月', () => {
  const rows = ['2026/10/31', '2026/11/1', '2027.01', '2027.04', '2027.05', '2027.02.30', '/', '下单后两个月'].map((date) => project(date));
  const groups = arrivalGroups(rows, '2026-11-25');
  expect(groups.map((g) => [g.label, g.projects.length])).toEqual([
    ['此前月份', 1], ['2026 年 11 月', 1], ['2027 年 1 月', 1], ['2027 年 4 月', 1], ['六个月以后', 1], ['月份待确认', 3],
  ]);
  expect(groups.flatMap((g) => g.projects)).toHaveLength(rows.length);
});
