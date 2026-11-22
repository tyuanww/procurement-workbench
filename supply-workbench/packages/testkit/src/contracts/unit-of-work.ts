import { expect, it } from 'vitest';
import type { FileStore } from '../../../application/src/ports/file-store.js';
import type { UnitOfWork } from '../../../application/src/ports/unit-of-work.js';
import { aUser } from '../builders.js';

export function describeUnitOfWorkContract(make: () => UnitOfWork & {
  readonly readUser: (id: string) => Promise<unknown>;
  readonly auditCount: () => number;
}): void {
  it('回调抛错则本次写入全部回滚', async () => {
    const uow = make();
    const user = aUser();
    await expect(uow.run(async (stores) => {
      await stores.users.save(user);
      await stores.audit.record(entry(user.id));
      throw new Error('失败');
    })).rejects.toThrow('失败');
    expect(await uow.readUser(user.id)).toBeUndefined();
    expect(uow.auditCount()).toBe(0);
  });

  it('回调成功后写入还能读到，并能记审计', async () => {
    const uow = make();
    const user = aUser();
    await uow.run(async (stores) => {
      await stores.users.save(user);
      await stores.audit.record(entry(user.id));
    });
    expect(await uow.readUser(user.id)).toEqual(user);
    expect(uow.auditCount()).toBe(1);
  });
}

export function describeFileStoreContract(make: () => FileStore): void {
  it('相同字节只存一份，没有的哈希返回 undefined', async () => {
    const files = make();
    const bytes = new Uint8Array([1, 2, 3]);
    const first = await files.put({ bytes, originalName: 'a.xlsx', mime: 'application/octet-stream' });
    const second = await files.put({ bytes, originalName: 'b.xlsx', mime: 'application/octet-stream' });
    expect(second.sha256).toBe(first.sha256);
    expect(await files.read(first.sha256)).toEqual(bytes);
    expect(await files.read('missing')).toBeUndefined();
  });
}

function entry(actorUserId: string) {
  return { actorUserId, action: 'user.create', entity: '用户', entityId: actorUserId, before: null, after: null, at: '2026-10-12T00:00:00.000Z' };
}
