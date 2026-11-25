import type { DirectorProject } from '@sw/contracts';
import { compareArrival, plannedArrival, type Arrival } from './project-register.js';

export const preparationFields = [
  { key: 'BOM表搭建情况', label: 'BOM 表' }, { key: '大货稿件情况', label: '大货稿件' }, { key: '成本核算情况', label: '成本核算' },
] as const;
export type ProjectGroup = { label: string; projects: DirectorProject[]; showPreparation?: boolean };
function monthOffset(month: string, today: string) {
  return (Number(month.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(month.slice(5, 7)) - Number(today.slice(5, 7));
}

function bucketLabel(key: string) {
  if (key === 'past') return '此前月份';
  if (key === 'later') return '六个月以后';
  if (key === 'unknown') return '月份待确认';
  return key.slice(0, 4) + ' 年 ' + Number(key.slice(5)) + ' 月';
}

function bucketKey(arrival: Arrival | undefined, today: string) {
  if (!arrival) return 'unknown';
  const offset = monthOffset(arrival.month, today);
  if (offset < 0) return 'past';
  return offset < 6 ? arrival.month : 'later';
}

export function arrivalGroups(projects: readonly DirectorProject[], today: string): ProjectGroup[] {
  const buckets = new Map<string, DirectorProject[]>();
  for (const project of projects) {
    const key = bucketKey(plannedArrival(project.arrival), today);
    const rows = buckets.get(key) ?? [];
    rows.push(project);
    buckets.set(key, rows);
  }
  const keys = ['past', ...[...buckets.keys()].filter((key) => /^\d/u.test(key)).sort(), 'later', 'unknown'];
  return keys.flatMap((key) => {
    const rows = buckets.get(key);
    return rows ? [{ label: bucketLabel(key), projects: rows, showPreparation: true }] : [];
  });
}

export function projectFocus(projects: readonly DirectorProject[], today: string) {
  const ordered = [...projects].sort(compareArrival);
  const dated = ordered.flatMap((project) => {
    const arrival = plannedArrival(project.arrival);
    return arrival ? [{ project, arrival }] : [];
  });
  const past = dated.find(({ arrival }) => arrival.day ? arrival.day < today : arrival.month < today.slice(0, 7));
  if (past) return { project: past.project, action: '核对实际入仓情况', reason: '已过预计入仓时间' };
  const first = dated[0];
  if (!first) {
    const project = ordered[0];
    return project ? { project, action: '确认预计入仓月份', reason: '排期表尚无可定位的月份' } : undefined;
  }
  const month = first.arrival.month;
  const next = dated.filter((item) => item.arrival.month === month).map((item) => item.project);
  const reason = bucketLabel(month) + '预计入仓';
  const pending = next.find((p) => preparationFields.some(({ key }) => p.milestones[key].trim() === '未完成'));
  if (pending) {
    const names = preparationFields.flatMap(({ key, label }) => pending.milestones[key].trim() === '未完成' ? [label] : []);
    return { project: pending, action: names.join('、') + '未完成', reason };
  }
  const project = first.project;
  return { project, action: project.notes.trim() || '核对入仓准备情况', reason };
}
