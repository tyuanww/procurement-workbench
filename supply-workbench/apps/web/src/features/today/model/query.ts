import type { GroupMode } from './types.js';
import { LEGACY_STATUS_KEYS } from '../../../shared/ui/status.js';

export function withReason(input: { readonly search: string; readonly code: string }): string {
  const params = new URLSearchParams(input.search);
  const current = readReasons(input.search);
  const next = current.includes(input.code) ? current.filter((code) => code !== input.code) : [...current, input.code];
  if (next.length === 0) params.delete('reasons');
  else params.set('reasons', next.join(','));
  return params.toString();
}

export function withGroup(input: { readonly search: string; readonly group: GroupMode }): string {
  const params = new URLSearchParams(input.search);
  if (input.group === 'kanban') params.delete('group');
  else params.set('group', input.group);
  return params.toString();
}

export function readReasons(search: string): string[] {
  const raw = new URLSearchParams(search).get('reasons') ?? '';
  return raw.split(',').filter((part) => part !== '').map((part) => LEGACY_STATUS_KEYS[part] ?? part);
}

export function readGroup(search: string): GroupMode {
  return resolveGroup(new URLSearchParams(search).get('group'));
}

export function resolveGroup(value: string | null): GroupMode {
  if (value === 'priority' || value === 'waiting' || value === 'reason' || value === 'date' || value === 'schedule' || value === 'owner' || value === 'supplier') return value;
  return 'kanban';
}
