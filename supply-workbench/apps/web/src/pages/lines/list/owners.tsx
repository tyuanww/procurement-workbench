import { Button, Select } from 'antd';
import { UserViewSchema, type SessionUser } from '@sw/contracts';
import { can } from '@sw/domain';
import { apiGet, asArray } from '../../../shared/api/client.js';
import { read } from '../../../shared/api/reads.js';
import { useCanWrite } from '../../../shared/actor.js';
import { ownerOptions, userDirectoryPath, type DeskUser } from '../../../features/follow-up/index.js';

export function OwnerControls(props: {
  readonly isOwnerVisible: boolean;
  readonly owners: readonly DeskUser[];
  readonly buyerId: string;
  readonly onBuyer: (buyerId: string) => void;
  readonly onAssign: () => void;
}) {
  const canAssign = useCanWrite('lines.write');
  if (!props.isOwnerVisible || !canAssign) return null;
  return (
    <>
      <Select
        aria-label="批量分配负责人"
        placeholder="选择负责人"
        style={{ width: 160 }}
        value={props.buyerId === '' ? null : props.buyerId}
        options={props.owners.map((user) => ({ value: user.id, label: user.name }))}
        onChange={props.onBuyer}
      />
      <Button type="primary" onClick={props.onAssign}>批量分配</Button>
    </>
  );
}

export async function loadDeskOwners(input: {
  readonly setUsers: (users: readonly DeskUser[]) => void;
  readonly setUserId: (id: string) => void;
  readonly setOwnerVisible: (isVisible: boolean) => void;
}): Promise<void> {
  const me = await read({ name: 'me' });
  input.setUserId(me.id);
  const directory = await directoryOf(me.roles);
  const owners = ownerOptions({ roles: me.roles, self: { id: me.id, name: me.name }, directory });
  input.setUsers(owners ?? []);
  input.setOwnerVisible(owners !== null);
}

async function directoryOf(roles: SessionUser['roles']): Promise<readonly DeskUser[]> {
  const path = userDirectoryPath(roles);
  if (path === null) return [];
  const users = await apiGet(path, asArray(UserViewSchema));
  return users.filter((user) => user.active && can(user, 'lines.write')).map((user) => ({ id: user.id, name: user.name }));
}
