import { Badge, Button, Dropdown, Menu, Tag, Typography, type MenuProps } from 'antd';
import { LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { useId, useRef, useState, type Ref } from 'react';
import { Link } from 'react-router';
import { SETTINGS_PATH } from '../shared/page-manifest.js';
import {
  endSession,
  type AccountEntry,
  type BadgeMark,
  type ShellView,
} from '../features/shell/index.js';
import { bg, brand, space } from '../theme/tokens.js';

export function NavBadge({ mark, compact }: { readonly mark: BadgeMark; readonly compact: boolean }) {
  switch (mark.kind) {
    case 'count':
      if (compact) return null;
      return <Badge count={mark.value} color={brand[100]} styles={{ indicator: { color: brand[800] } }} />;
    case 'missing':
      return <span style={{ color: brand[100] }}>—</span>;
    case 'none':
      return null;
    case 'pending':
      return null;
    default:
      return unreachable(mark);
  }
}

export function AccountMenu({ account }: { readonly account: ShellView['account'] }) {
  const [isOpen, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const name = account.entries.find((entry) => entry.kind === 'name');
  const label = name === undefined ? '' : name.label;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      onBlur={({ relatedTarget }) => {
        if (isOpen && !trigger.current?.contains(relatedTarget) && !panel.current?.contains(relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        // Let native Tab navigation reach links inside this custom dropdown panel.
        if (isOpen && event.key === 'Tab') event.stopPropagation();
      }}
    >
      <Dropdown
        trigger={['click']}
        open={isOpen}
        onOpenChange={setOpen}
        placement="bottomRight"
        getPopupContainer={(node) => node.closest('header') ?? node.ownerDocument.body}
        popupRender={() => (
          <AccountPanel id={panelId} panelRef={panel} entries={account.entries} onClose={close} onFail={() => setLogoutError('退出没有完成')} />
        )}
      >
        <Button ref={trigger} type="text" aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined}>
          <UserOutlined aria-hidden="true" />
          {label}
        </Button>
      </Dropdown>
      {logoutError === '' ? null : <Typography.Text type="danger">{logoutError}</Typography.Text>}
    </div>
  );
}

function AccountPanel(input: { readonly id: string; readonly panelRef: Ref<HTMLDivElement>; readonly entries: readonly AccountEntry[]; readonly onClose: () => void; readonly onFail: () => void }) {
  return (
    <div ref={input.panelRef} id={input.id} style={{ background: bg.surface, padding: space[2], display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {input.entries.map((entry) => (
        <AccountRow key={entry.key} entry={entry} onClose={input.onClose} onFail={input.onFail} />
      ))}
    </div>
  );
}

function AccountRow(input: { readonly entry: AccountEntry; readonly onClose: () => void; readonly onFail: () => void }) {
  if (input.entry.kind === 'name') return <Typography.Text>{input.entry.label}</Typography.Text>;
  if (input.entry.kind === 'role') return <Tag>{input.entry.label}</Tag>;
  if (input.entry.kind === 'settings') return (
    <Link to={SETTINGS_PATH} onClick={input.onClose} style={{ display: 'flex', alignItems: 'center', gap: space[1], minHeight: 32, paddingInline: space[2] }}>
      <SettingOutlined aria-hidden="true" />
      {input.entry.label}
    </Link>
  );
  if (input.entry.kind === 'logout') return <LogoutItem {...input} />;
  return unreachable(input.entry.kind);
}

function LogoutItem(input: { readonly entry: AccountEntry; readonly onClose: () => void; readonly onFail: () => void }) {
  return (
    <Menu
      selectable={false}
      items={logoutItems(input.entry)}
      onClick={() => {
        input.onClose();
        void endSession().catch(() => input.onFail());
      }}
    />
  );
}

function logoutItems(entry: AccountEntry): NonNullable<MenuProps['items']> {
  return [{ key: entry.key, icon: <LogoutOutlined />, label: entry.label }];
}

function unreachable(value: never): never {
  throw new Error(`未覆盖的种类 ${JSON.stringify(value)}`);
}
