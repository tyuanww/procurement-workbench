import type { GetLineFactoryLink, GetLineFactoryLinkDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetLineFactoryLink =
  (deps: GetLineFactoryLinkDeps): GetLineFactoryLink =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    return deps.links.getView(input.orderLineId);
  };
