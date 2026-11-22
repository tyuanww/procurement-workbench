import { NotFoundError } from '@sw/application/errors';
import { expect, it } from 'vitest';

type HasId = { readonly id: string };

type IdRepo<T extends HasId> = {
  get(id: string): Promise<T>;
  find(id: string): Promise<T | undefined>;
  save(entity: T): Promise<void>;
};

export function describeIdRepositoryContract<T extends HasId>(
  title: string,
  make: () => { readonly repo: IdRepo<T>; readonly sample: () => T },
): void {
  it(`${title}保存后能按 id 取回`, async () => {
    const { repo, sample } = make();
    const entity = sample();
    await repo.save(entity);
    expect(await repo.get(entity.id)).toEqual(entity);
  });

  it(`${title}找不到时 get 抛 NotFoundError，find 返回 undefined`, async () => {
    const { repo } = make();
    expect(await repo.find('missing')).toBeUndefined();
    await expect(repo.get('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
}
