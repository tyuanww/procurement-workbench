import type { GetImportBatch, GetImportBatchDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetImportBatch =
  (deps: GetImportBatchDeps): GetImportBatch =>
  async (input, actor) => {
    authorize(actor, 'imports.write');
    return deps.imports.getBatch(input);
  };
