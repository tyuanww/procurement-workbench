import type { OrderLineId } from '@sw/contracts';
import { parseOrderLineId } from '@sw/domain';
import { writeUrlState } from '../../../shared/hooks/url-state.js';

export type FollowUpPreviewSession =
  | null
  | { readonly kind: 'open'; readonly lineId: OrderLineId; readonly preservedSearch: string };

export function readFollowUpPreview(search: string): FollowUpPreviewSession {
  const params = new URLSearchParams(search);
  if (params.get('drawer') !== 'preview') return null;
  const rawLineId = params.get('lineId');
  if (rawLineId === null || rawLineId === '') return null;
  const parsed = parseOrderLineId(rawLineId);
  if (!parsed.ok) return null;
  return { kind: 'open', lineId: parsed.value, preservedSearch: writeUrlState(search, { drawer: null, lineId: null }) };
}

export function writeFollowUpPreview(input: {
  readonly search: string;
  readonly session: FollowUpPreviewSession;
}): URLSearchParams {
  const patch = input.session === null
    ? { drawer: null, lineId: null }
    : { drawer: 'preview', lineId: input.session.lineId, partyId: null, partyRole: null };
  return new URLSearchParams(writeUrlState(input.search, patch));
}

export function openFollowUpPreview(input: { readonly search: string; readonly lineId: OrderLineId }): URLSearchParams {
  return writeFollowUpPreview({
    search: input.search,
    session: { kind: 'open', lineId: input.lineId, preservedSearch: writeUrlState(input.search, { drawer: null, lineId: null }) },
  });
}

export function closeFollowUpPreview(search: string): URLSearchParams {
  return writeFollowUpPreview({ search, session: null });
}
