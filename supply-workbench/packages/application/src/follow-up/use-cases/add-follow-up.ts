import type { AddFollowUp, AddFollowUpDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';
import { appendFollowUp } from './append-follow-up.js';

export const makeAddFollowUp =
  (deps: AddFollowUpDeps): AddFollowUp =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const followUpId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      await appendFollowUp(tx, { input, actor, at, id: followUpId });
    });
    return { followUpId };
  };
