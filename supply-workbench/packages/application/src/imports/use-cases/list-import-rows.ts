import type { ListImportRows, ListImportRowsDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeListImportRows =
  (deps: ListImportRowsDeps): ListImportRows =>
  async (input, actor) => {
    authorize(actor, 'imports.write');
    return deps.imports.listRows(input);
  };
