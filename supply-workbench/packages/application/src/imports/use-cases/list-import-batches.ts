import type { ListImportBatches, ListImportBatchesDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeListImportBatches =
  (deps: ListImportBatchesDeps): ListImportBatches =>
  async (input, actor) => {
    authorize(actor, 'imports.write');
    return deps.imports.listBatches(input);
  };
