import type { GetOwnerCoverage, GetOwnerCoverageDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetOwnerCoverage =
  (deps: GetOwnerCoverageDeps): GetOwnerCoverage =>
  async (query, actor) => {
    authorize(actor, 'lines.write');
    if (actor.roles.includes('admin')) return deps.owners.coverage(query);
    return deps.owners.coverage({ buyerUserId: actor.id });
  };
