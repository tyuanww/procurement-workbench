import type { GetFactoryTemplate, GetFactoryTemplateDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetFactoryTemplate =
  (deps: GetFactoryTemplateDeps): GetFactoryTemplate =>
  async (_input, actor) => {
    authorize(actor, 'imports.write');
    return { bytes: deps.blankFactoryTemplate(), fileName: 'factory-progress-v1.xlsx' };
  };
