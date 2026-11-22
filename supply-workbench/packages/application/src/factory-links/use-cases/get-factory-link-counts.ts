import type { GetFactoryLinkCounts, GetFactoryLinkCountsDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetFactoryLinkCounts =
  (deps: GetFactoryLinkCountsDeps): GetFactoryLinkCounts =>
  async (_input, actor) => {
    authorize(actor, 'master.review');
    return deps.links.countStates();
  };
