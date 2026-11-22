import { FOLLOW_UP_BULK_MAX } from '@sw/domain';
import type { AddFollowUps, AddFollowUpsDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { appendFollowUp } from './append-follow-up.js';

export const makeAddFollowUps =
  (deps: AddFollowUpsDeps): AddFollowUps =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    if (input.items.length > FOLLOW_UP_BULK_MAX) throw tooMany();
    const at = deps.clock.now();
    let created = 0;
    await deps.uow.run(async (tx) => {
      for (const item of input.items) {
        await appendFollowUp(tx, { input: item, actor, at, id: deps.ids.next() });
        created += 1;
      }
    });
    return { created };
  };

function tooMany(): ValidationFailedError {
  return new ValidationFailedError(`一次最多 ${FOLLOW_UP_BULK_MAX} 条`, {
    field: 'items',
    max: FOLLOW_UP_BULK_MAX,
  });
}
