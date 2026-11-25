import { isLocalDate } from '@sw/domain';
import type { DirectorProject } from '@sw/contracts';

export type BrandScope = 'all' | 'unassigned' | `brand:${string}`;
export type Membership = { lineId: string; brand: string | null };

export function brandIndex(members: readonly Membership[]) {
  const index = new Map<string, Set<string | null>>();
  for (const member of members) {
    const brands = index.get(member.lineId) ?? new Set<string | null>();
    brands.add(member.brand);
    index.set(member.lineId, brands);
  }
  return index;
}

export function lineInScope(scope: BrandScope, memberships: Set<string | null> | undefined) {
  if (scope === 'all') return true;
  if (scope === 'unassigned') return !memberships?.size || memberships.has(null);
  return memberships?.has(scope.slice(6)) ?? false;
}

export function rankedContacts(projects: readonly DirectorProject[]) {
  const totals = new Map<string, number>();
  for (const project of projects) {
    if (project.contact) totals.set(project.contact, (totals.get(project.contact) ?? 0) + 1);
  }
  return [...totals].sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b, 'zh-CN'))
    .map(([name, count], index) => ({ name, count, rank: index + 1 }));
}

export type Arrival = { month: string; day: string | null };

export function plannedArrival(raw: string): Arrival | undefined {
  const match = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/u.exec(raw.trim());
  if (!match?.[2]) return undefined;
  const month = match[1] + '-' + match[2].padStart(2, '0');
  const day = month + '-' + (match[3] ?? '01').padStart(2, '0');
  if (!isLocalDate(day)) return undefined;
  return { month, day: match[3] === undefined ? null : day };
}

function arrivalKey(raw: string) {
  const arrival = plannedArrival(raw);
  if (!arrival) return raw ? '1-' + raw : '2';
  return '0-' + (arrival.day ?? arrival.month + '-32');
}

export function compareArrival(a: DirectorProject, b: DirectorProject) {
  return arrivalKey(a.arrival).localeCompare(arrivalKey(b.arrival)) || a.brand.localeCompare(b.brand, 'zh-CN') || a.row - b.row;
}
