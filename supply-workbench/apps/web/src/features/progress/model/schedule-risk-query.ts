import { diffDays, parseLocalDate } from '@sw/domain';
import { taskIdOf, taskParam } from '../../today/index.js';
import { progressViewOf } from './planning-section.js';
import { scheduleWindow } from './schedule.js';

export const schedulePath = '/progress/schedule';
export const scheduleRiskLabel = '排期任务进度';

const RISK_KEYS = ['preset', 'from', 'to', 'lane', 'dimension', 'groupPage', 'risk', 'riskGroup', 'riskPage', 'scheduleReturn'] as const;
const SCHEDULE_KEYS = ['view', 'store', 'scale', 'from', 'ownerUserId', 'supplierPartyId', 'factoryPartyId', 'status',
  'scheduleLine', 'scheduleBatch', 'scheduleBatchEntry', 'procurementTask', 'planScope', 'planSearch', 'planDisplay', 'planOrderPage',
  'planSelected', 'planRiskOnly', 'weeklyBucket', 'developmentProject', 'developmentNode', 'planEntry'] as const;
const TASK_PARENT = 'taskParent';

export function isScheduleRiskAddress(path: string, search: string): boolean {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const route = path.toLowerCase().replace(/\/+$/u, '');
  return params.get('lens') === 'risk' && (route === schedulePath || (route === '/progress' && progressViewOf(view) === 'schedule'));
}

export function scheduleSource(params: URLSearchParams, pathname: string | undefined): URLSearchParams {
  const source = new URLSearchParams(params);
  const route = pathname?.toLowerCase().replace(/\/+$/u, '');
  if (route === '/progress/development') source.set('planEntry', 'development');
  else if (route === '/progress') source.set('planEntry', 'alias');
  else if (route === schedulePath) source.delete('planEntry');
  return source;
}

export function scheduleWorkspaceBack(source: URLSearchParams): string {
  const params = new URLSearchParams(source);
  const entry = params.get('planEntry');
  params.delete('planEntry');
  const path = entry === 'development' ? '/progress/development' : entry === 'alias' ? '/progress' : schedulePath;
  return params.size === 0 ? path : `${path}?${params}`;
}

export function scheduleRiskPath(search: URLSearchParams): string {
  const params = copyParams(search, RISK_KEYS);
  params.set('lens', 'risk');
  return pathWith(params);
}

export function scheduleRiskEntry(input: {
  readonly search: URLSearchParams;
  readonly from: string;
  readonly to: string;
  readonly pathname?: string;
}): string {
  const source = scheduleSource(copyParams(input.search, SCHEDULE_KEYS), input.pathname);
  return scheduleRiskPath(new URLSearchParams({
    preset: 'custom', from: input.from, to: input.to,
    scheduleReturn: source.toString(),
  }));
}

export function scheduleReturnPath(search: URLSearchParams, period: { readonly from: string; readonly to?: string }): string {
  const source = scheduleRiskSource(search);
  if (source !== null) return scheduleWorkspaceBack(source);
  const scale = scaleForRiskWindow(period);
  return scheduleWorkspaceBack(new URLSearchParams({ from: period.from, ...(scale === 'week' ? {} : { scale }) }));
}

function scaleForRiskWindow({ from, to }: { readonly from: string; readonly to?: string }) {
  const first = parseLocalDate(from);
  const last = parseLocalDate(to ?? '');
  if (!first.ok || !last.ok) return 'week';
  const anchor = first.value;
  const end = last.value;
  if (anchor === end) return 'day';
  const month = scheduleWindow({ scale: 'month', anchor });
  if (month.from === anchor && month.to === end) return 'month';
  return diffDays(end, anchor) >= 7 ? 'month' : 'week';
}

export function scheduleRiskSource(search: URLSearchParams): URLSearchParams | null {
  const origin = search.get('scheduleReturn');
  return origin === null ? null : copyParams(new URLSearchParams(origin), SCHEDULE_KEYS);
}

export function scheduleRiskTaskPath(input: {
  readonly id: string;
  readonly anchor: string;
  readonly search: URLSearchParams;
}): string {
  return pathWith(new URLSearchParams({
    from: input.anchor,
    drawer: taskParam(input.id),
    taskMode: 'read',
    riskReturn: copyParams(input.search, RISK_KEYS).toString(),
  }));
}

export function schedulePredecessorPath(input: { readonly predecessorId: string; readonly search: URLSearchParams; readonly pathname?: string }): string {
  const params = new URLSearchParams(input.search);
  const parent = taskIdOf(params.get('drawer'));
  if (parent !== null) params.append(TASK_PARENT, parent);
  params.set('drawer', taskParam(input.predecessorId));
  return scheduleWorkspaceBack(scheduleSource(params, input.pathname));
}

export function scheduleTaskParentPath(search: URLSearchParams, pathname?: string): string | null {
  const parents = search.getAll(TASK_PARENT);
  const parent = parents.pop();
  if (parent === undefined || parent === '') return null;
  const params = new URLSearchParams(search);
  params.set('drawer', taskParam(parent));
  params.delete(TASK_PARENT);
  for (const previous of parents) params.append(TASK_PARENT, previous);
  return scheduleWorkspaceBack(scheduleSource(params, pathname));
}

function pathWith(params: URLSearchParams): string {
  return params.size === 0 ? schedulePath : `${schedulePath}?${params}`;
}

function copyParams(search: URLSearchParams, keys: readonly string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of search) if (keys.includes(key) && !params.has(key)) params.set(key, value);
  return params;
}
