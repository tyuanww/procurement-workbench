import type { OrderLineRow, PartyDetail, PartyView } from '@sw/contracts';
import { parseEntityId, type EntityId } from '@sw/domain';
import type { LineColumnKey } from '../../../features/follow-up/index.js';
import type { ReadFailure } from '../../../shared/api/failure.js';
import { failureText } from '../../../shared/api/failure.js';
import { writeUrlState } from '../../../shared/hooks/url-state.js';

export const PARTY_PREVIEW_ROLES = ['supplier', 'factory', 'receiver'] as const;

export type PartyPreviewRole = (typeof PARTY_PREVIEW_ROLES)[number];

export type OpenParty = {
  readonly partyId: EntityId;
  readonly role: PartyPreviewRole;
};

export type PartyPreviewSession =
  | null
  | { readonly kind: 'open'; readonly opened: OpenParty; readonly preservedSearch: string };

export type PartyPreviewPhase =
  | { readonly kind: 'loading'; readonly opened: OpenParty }
  | { readonly kind: 'ready'; readonly opened: OpenParty; readonly detail: PartyDetail }
  | { readonly kind: 'forbidden'; readonly opened: OpenParty; readonly message: string }
  | { readonly kind: 'missing'; readonly opened: OpenParty; readonly message: string }
  | { readonly kind: 'failed'; readonly opened: OpenParty; readonly message: string };

export type PartyPreviewSignal =
  | { readonly kind: 'load'; readonly opened: OpenParty }
  | { readonly kind: 'ready'; readonly partyId: EntityId; readonly detail: PartyDetail }
  | { readonly kind: 'forbidden'; readonly partyId: EntityId; readonly message: string }
  | { readonly kind: 'missing'; readonly partyId: EntityId; readonly message: string }
  | { readonly kind: 'failed'; readonly partyId: EntityId; readonly message: string };

export function partyPreviewRoleLabel(role: PartyPreviewRole): string {
  switch (role) {
    case 'supplier':
      return '供应商';
    case 'factory':
      return '工厂';
    case 'receiver':
      return '收货代工厂';
    default: {
      const unreachable: never = role;
      return unreachable;
    }
  }
}

export function partyFlagLabel(party: PartyView): string {
  const labels = [
    party.isSupplier ? '供应商' : '',
    party.isFactory ? '工厂' : '',
    party.isOwnWarehouse ? '自有仓' : '',
  ].filter((label) => label !== '');
  if (labels.length === 0) return '未标记角色';
  return labels.join('、');
}

export function partyKpiLine(detail: PartyDetail): string {
  return `应到 ${detail.kpis.dueBatches.n} · 准时样本 ${detail.kpis.onTime.n} · 近一个月 ${detail.kpiWindow.from} 至 ${detail.kpiWindow.to}`;
}

export function partyPreviewTarget(input: { readonly column: LineColumnKey; readonly row: OrderLineRow }): OpenParty | null {
  if (input.column === 'supplier') return openedFrom(input.row.supplier.id, 'supplier');
  if (input.column === 'factory') return openedFrom(input.row.factory?.id ?? null, 'factory');
  if (input.column === 'receiver') return openedFrom(input.row.receiver?.id ?? null, 'receiver');
  return null;
}

export function loadingPartyPreview(opened: OpenParty): PartyPreviewPhase {
  return { kind: 'loading', opened };
}

export function partyPreviewPhase(phase: PartyPreviewPhase, signal: PartyPreviewSignal): PartyPreviewPhase {
  if (signal.kind === 'load') return loadingPartyPreview(signal.opened);
  if (signal.partyId !== phase.opened.partyId) return phase;
  switch (signal.kind) {
    case 'ready':
      if (signal.detail.party.id !== signal.partyId) {
        return { kind: 'failed', opened: phase.opened, message: '读到的主体和打开的记录不一致。' };
      }
      return { kind: 'ready', opened: phase.opened, detail: signal.detail };
    case 'forbidden':
      return { kind: 'forbidden', opened: phase.opened, message: signal.message };
    case 'missing':
      return { kind: 'missing', opened: phase.opened, message: signal.message };
    case 'failed':
      return { kind: 'failed', opened: phase.opened, message: signal.message };
    default: {
      const unreachable: never = signal;
      return unreachable;
    }
  }
}

export function partyPreviewFailure(input: { readonly partyId: EntityId; readonly failure: ReadFailure }): PartyPreviewSignal {
  const message = failureText(input.failure);
  if (input.failure.kind === 'api' && input.failure.code === 'FORBIDDEN') {
    return { kind: 'forbidden', partyId: input.partyId, message };
  }
  if (input.failure.kind === 'api' && input.failure.code === 'NOT_FOUND') {
    return { kind: 'missing', partyId: input.partyId, message };
  }
  return { kind: 'failed', partyId: input.partyId, message };
}

export function readPartyPreview(search: string): PartyPreviewSession {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.get('drawer') !== 'party') return null;
  const parsed = parseEntityId(params.get('partyId') ?? '');
  const role = roleOf(params.get('partyRole'));
  if (!parsed.ok || role === null) return null;
  return {
    kind: 'open',
    opened: { partyId: parsed.value, role },
    preservedSearch: writeUrlState(search, { drawer: null, partyId: null, partyRole: null }),
  };
}

export function writePartyPreview(input: { readonly search: string; readonly session: PartyPreviewSession }): URLSearchParams {
  const patch = input.session === null
    ? { drawer: null, partyId: null, partyRole: null }
    : { drawer: 'party', partyId: input.session.opened.partyId, partyRole: input.session.opened.role, lineId: null };
  return new URLSearchParams(writeUrlState(input.search, patch));
}

export function openPartyPreview(input: { readonly search: string; readonly opened: OpenParty }): URLSearchParams {
  return writePartyPreview({
    search: input.search,
    session: {
      kind: 'open',
      opened: input.opened,
      preservedSearch: writeUrlState(input.search, { drawer: null, partyId: null, partyRole: null }),
    },
  });
}

export function closePartyPreview(search: string): URLSearchParams {
  return writePartyPreview({ search, session: null });
}

function openedFrom(id: string | null, role: PartyPreviewRole): OpenParty | null {
  if (id === null) return null;
  const parsed = parseEntityId(id);
  if (!parsed.ok) return null;
  return { partyId: parsed.value, role };
}

function roleOf(value: string | null): PartyPreviewRole | null {
  if (value === 'supplier' || value === 'factory' || value === 'receiver') return value;
  return null;
}
