import { FollowUpViewSchema } from '@sw/contracts';
import { apiSend } from '../../shared/api/client.js';
import { reminderChangeOf } from './follow-up-time.js';
import type { NoteRef, OpenForm } from './TodayForms.js';

export function saveTodayNote({ draft, target, nextFollowUpAt }: {
  readonly draft: Extract<OpenForm, { readonly kind: 'note' }>;
  readonly target: NoteRef;
  readonly nextFollowUpAt: string | undefined;
}) {
  const reminder = reminderChangeOf(draft.nextFollowUpLocal, nextFollowUpAt);
  return apiSend({
    path: '/api/v1/follow-ups', method: 'POST', schema: FollowUpViewSchema,
    body: { orderLineId: target.lineId, batchId: target.batchId, kind: draft.followKind, text: draft.text.trim(), ...reminder },
  });
}
