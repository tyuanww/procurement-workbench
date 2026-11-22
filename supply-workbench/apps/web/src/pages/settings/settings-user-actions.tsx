import { Button, Flex, Select } from 'antd';
import { useEffect, useState } from 'react';
import { UserViewSchema, type UserView } from '@sw/contracts';
import { roleOptions, userPatch } from '../../features/platform/index.js';
import { apiSend } from '../../shared/api/client.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { space } from '../../theme/tokens.js';
import { reportSettingsError } from './settings-actions.js';

export function UserActions(input: {
  readonly user: UserView;
  readonly onRefresh: () => void;
  readonly setMessage: (message: UiNotice | null) => void;
}) {
  const [roles, setRoles] = useState<readonly string[]>(input.user.roles);
  useEffect(() => { setRoles(input.user.roles); }, [input.user.id, input.user.roles.join('|')]);
  return (
    <Flex gap={space[1]} wrap>
      <Select
        mode="multiple"
        aria-label={`${input.user.name} 角色`}
        value={roles}
        options={roleOptions().map((option) => ({ value: option.code, label: option.text }))}
        onChange={(value) => setRoles(value)}
        style={{ minWidth: 180 }}
      />
      <Button disabled={roles.length === 0} onClick={() => { void patchUser({ user: input.user, body: userPatch({ roles }), onRefresh: input.onRefresh, setMessage: input.setMessage }); }}>保存角色</Button>
      <Button onClick={() => { void patchUser({ user: input.user, body: userPatch({ active: !input.user.active }), onRefresh: input.onRefresh, setMessage: input.setMessage }); }}>{input.user.active ? '停用' : '启用'}</Button>
    </Flex>
  );
}

async function patchUser(input: {
  readonly user: UserView;
  readonly body: ReturnType<typeof userPatch>;
  readonly onRefresh: () => void;
  readonly setMessage: (message: UiNotice | null) => void;
}) {
  try {
    await apiSend({ path: `/api/v1/users/${encodeURIComponent(input.user.id)}`, method: 'PATCH', body: input.body, schema: UserViewSchema });
    input.setMessage({ kind: 'info', text: '用户已更新' });
    input.onRefresh();
  } catch (error) {
    reportSettingsError({ setMessage: input.setMessage, error, fallback: '用户没有更新。' });
  }
}
