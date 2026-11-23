import type { GetImportTemplate, GetImportTemplateDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetImportTemplate =
  (deps: GetImportTemplateDeps): GetImportTemplate =>
  async (_input, actor) => {
    authorize(actor, 'imports.write');
    return { bytes: deps.generate(), fileName: deps.fileName };
  };
