import { NotFoundError } from '@sw/application/errors';

export type HasId = { readonly id: string };

export type IdRepository<T extends HasId> = {
  get(id: string): Promise<T>;
  find(id: string): Promise<T | undefined>;
  save(entity: T): Promise<void>;
};

export function idRepository<T extends HasId>(
  rows: () => Map<string, T>,
  entity: string,
): IdRepository<T> {
  return {
    async get(id) {
      const found = rows().get(id);
      if (found === undefined) throw new NotFoundError(entity, id);
      return found;
    },
    async find(id) {
      return rows().get(id);
    },
    async save(row) {
      rows().set(row.id, row);
    },
  };
}
