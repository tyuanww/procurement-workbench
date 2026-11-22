import type { ListCustomerSupplied, ListCustomerSuppliedDeps } from '../boundary.js';

export const makeListCustomerSupplied =
  (deps: ListCustomerSuppliedDeps): ListCustomerSupplied =>
  async (input) => deps.master.listCustomerSupplied(input);
