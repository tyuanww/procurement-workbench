import type { ListPendingOwners, ListPendingOwnersDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeListPendingOwners =
  (deps: ListPendingOwnersDeps): ListPendingOwners =>
  async (_input, actor) => {
    authorize(actor, 'master.review');
    return { items: await deps.owners.pending() };
  };
