import type { ListAuditEntries, ListAuditEntriesDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeListAuditEntries =
  (deps: ListAuditEntriesDeps): ListAuditEntries =>
  async (input, actor) => {
    authorize(actor, 'admin');
    return deps.audit.list(input);
  };
