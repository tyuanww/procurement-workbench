import { Button, Flex, Form, Input, Select, Slider, Tag, Typography } from 'antd';
import {
  SettingsSchema,
  UserViewSchema,
  type AuditEntryView,
  type Settings,
  type UserView,
} from '@sw/contracts';
import { roleLabel } from '@sw/domain';
import { apiSend } from '../../shared/api/client.js';
import {
  SETTING_FIELDS,
  auditChanged,
  roleOptions,
  selectedRoles,
} from '../../features/platform/index.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { horizontalFormLayout } from '../../shared/ui/form.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { space } from '../../theme/tokens.js';
import { SettingsGroup, formStyle, rowStyle } from './settings-ui.js';
import { reportSettingsError } from './settings-actions.js';
import { UserActions } from './settings-user-actions.js';

export type UsersPanelProps = {
  readonly users: readonly UserView[];
  readonly onRefresh: () => void;
  readonly setMessage: (message: UiNotice | null) => void;
};

export type ThresholdPanelProps = {
  readonly settings: Settings;
  readonly onDone: (settings: Settings) => void;
  readonly setMessage: (message: UiNotice | null) => void;
};

export type AuditPanelProps = {
  readonly audit: readonly AuditEntryView[];
  readonly openId: string | null;
  readonly setOpenId: (id: string | null) => void;
};

type CreateUserValues = { readonly name: string; readonly roles: readonly string[] };
type SettingsValues = {
  readonly upcomingDays: number;
  readonly deliveryNoteAlertDays: number | null;
};

export function UsersPanel(input: UsersPanelProps) {
  return (
    <Flex vertical gap={space[5]} style={{ width: '100%' }}>
      <UserForm onDone={input.onRefresh} setMessage={input.setMessage} />
      <SettingsGroup title="现有用户">
        <UserRows
          users={input.users}
          onRefresh={input.onRefresh}
          setMessage={input.setMessage}
        />
      </SettingsGroup>
    </Flex>
  );
}

function UserRows(input: UsersPanelProps) {
  return (
    <Flex vertical style={{ width: '100%' }}>
      {input.users.map((user) => (
        <UserRow
          key={user.id}
          user={user}
          onRefresh={input.onRefresh}
          setMessage={input.setMessage}
        />
      ))}
    </Flex>
  );
}

type UserRowProps = {
  readonly user: UserView;
  readonly onRefresh: () => void;
  readonly setMessage: (message: UiNotice | null) => void;
};

function UserRow(input: UserRowProps) {
  return (
    <Flex justify="space-between" align="center" gap={space[3]} wrap style={rowStyle()}>
      <UserIdentity user={input.user} />
      <UserActions user={input.user} onRefresh={input.onRefresh} setMessage={input.setMessage} />
    </Flex>
  );
}

function UserIdentity({ user }: { readonly user: UserView }) {
  return (
    <Flex align="center" gap={space[1]} wrap>
      <Typography.Text strong>{user.name}</Typography.Text>
      {user.roles.map((role) => (
        <Tag key={role}>{roleLabel(role)}</Tag>
      ))}
      <Tag>{user.active ? '在用' : '已停用'}</Tag>
    </Flex>
  );
}

export function ThresholdPanel(input: ThresholdPanelProps) {
  return (
    <SettingsGroup title="提醒阈值">
      <Form<SettingsValues>
        {...horizontalFormLayout}
        className="settings-form"
        initialValues={{
          upcomingDays: input.settings.upcomingDays,
          deliveryNoteAlertDays: input.settings.deliveryNoteAlertDays ?? 7,
        }}
        onFinish={(values) => {
          void saveSettings({ values, onDone: input.onDone, setMessage: input.setMessage });
        }}
        style={formStyle()}
      >
        {SETTING_FIELDS.map((field) => (
          <Form.Item key={field.key} name={field.key} label={field.label} extra={field.hint}>
            <Slider
              min={0}
              max={365}
              ariaLabelForHandle={field.label}
              ariaValueTextFormatterForHandle={(value) => `${value} 天`}
              marks={{ 0: '0 天', 90: '90 天', 365: '365 天' }}
              tooltip={{ formatter: (value) => `${value ?? 0} 天` }}
            />
          </Form.Item>
        ))}
        <Form.Item label=" " colon={false}>
          <Flex justify="end">
            <Button type="primary" htmlType="submit">
              保存阈值
            </Button>
          </Flex>
        </Form.Item>
      </Form>
    </SettingsGroup>
  );
}

export function AuditPanel(input: AuditPanelProps) {
  return (
    <SettingsGroup title="变更记录">
      <Flex vertical style={{ width: '100%' }}>
        {input.audit.map((entry) => (
          <Flex key={entry.id} vertical gap={space[1]} style={rowStyle()}>
            <Flex justify="space-between" align="center" gap={space[3]} wrap>
              <Typography.Text>
                {entry.action} {entry.entity} · {formatDateTime(entry.at) ?? '时间无法识别'}
              </Typography.Text>
              <Button onClick={() => input.setOpenId(input.openId === entry.id ? null : entry.id)}>
                {input.openId === entry.id ? '收起审计' : '展开审计'}
              </Button>
            </Flex>
            {input.openId === entry.id && auditChanged(entry.before, entry.after) ? (
              <Typography.Text type="secondary">
                修改前 {textOf(entry.before)}，修改后 {textOf(entry.after)}
              </Typography.Text>
            ) : null}
          </Flex>
        ))}
      </Flex>
    </SettingsGroup>
  );
}

function UserForm(input: {
  readonly onDone: () => void;
  readonly setMessage: (message: UiNotice | null) => void;
}) {
  return (
    <SettingsGroup title="新增用户">
      <Form<CreateUserValues>
        {...horizontalFormLayout}
        className="settings-form"
        initialValues={{ name: '', roles: ['buyer'] }}
        onFinish={(values) => {
          void createUser({ values, onDone: input.onDone, setMessage: input.setMessage });
        }}
        style={formStyle()}
      >
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: '填写姓名' }]}>
          <Input placeholder="新用户姓名" />
        </Form.Item>
        <Form.Item
          name="roles"
          label="角色"
          rules={[{ required: true, message: '至少选一个角色' }]}
        >
          <Select
            mode="multiple"
            aria-label="角色"
            options={roleOptions().map((option) => ({ value: option.code, label: option.text }))}
          />
        </Form.Item>
        <Form.Item label=" " colon={false}>
          <Flex justify="end">
            <Button type="primary" htmlType="submit">
              新增用户
            </Button>
          </Flex>
        </Form.Item>
      </Form>
    </SettingsGroup>
  );
}

async function createUser(input: {
  readonly values: CreateUserValues;
  readonly onDone: () => void;
  readonly setMessage: (message: UiNotice | null) => void;
}) {
  const name = input.values.name.trim();
  const roles = selectedRoles([...input.values.roles]);
  if (name === '' || !roles.ok) {
    if (!roles.ok) input.setMessage({ kind: 'error', text: roles.message });
    return;
  }
  try {
    await apiSend({
      path: '/api/v1/users',
      method: 'POST',
      body: { name, roles: roles.roles },
      schema: UserViewSchema,
    });
    input.setMessage({ kind: 'info', text: '已新增用户' });
    input.onDone();
  } catch (error) {
    reportSettingsError({ setMessage: input.setMessage, error, fallback: '用户没有新增。' });
  }
}

async function saveSettings(input: {
  readonly values: SettingsValues;
  readonly onDone: (settings: Settings) => void;
  readonly setMessage: (message: UiNotice | null) => void;
}) {
  try {
    const saved = await apiSend({
      path: '/api/v1/settings',
      method: 'PUT',
      body: {
        upcomingDays: input.values.upcomingDays,
        deliveryNoteAlertDays: input.values.deliveryNoteAlertDays,
      },
      schema: SettingsSchema,
    });
    input.onDone(saved);
    input.setMessage({ kind: 'info', text: '阈值已保存' });
  } catch (error) {
    reportSettingsError({ setMessage: input.setMessage, error, fallback: '阈值没有保存。' });
  }
}


function textOf(value: unknown): string {
  return JSON.stringify(value);
}
