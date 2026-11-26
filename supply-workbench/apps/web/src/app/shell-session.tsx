import { App, Badge, Button, Dropdown, Tag, Typography, theme, type BadgeProps } from 'antd';
import { DownOutlined, LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { Fragment, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type Ref } from 'react';
import { Link } from 'react-router';
import { SETTINGS_PATH } from '../shared/page-manifest.js';
import {
  endSession,
  type AccountEntry,
  type BadgeMark,
  type ShellView,
} from '../features/shell/index.js';
import { brand, rowCompact } from '../theme/tokens.js';
import './shell-account.css';

export function NavBadge({ mark, compact, countProps }: {
  readonly mark: BadgeMark;
  readonly compact: boolean;
  readonly countProps?: Pick<BadgeProps, 'overflowCount' | 'title'>;
}) {
  switch (mark.kind) {
    case 'count':
      if (compact) return null;
      return <Badge {...countProps} count={mark.value} color={brand[100]} styles={{ indicator: { color: brand[800] } }} />;
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

export function AccountMenu({ account, hitPx }: { readonly account: ShellView['account']; readonly hitPx: number | undefined }) {
  const { isOpen, setOpen, trigger, panel, close, handleBlur, handleKeyDown } = useAccountDisclosure();
  const { message } = App.useApp();
  const panelId = useId();
  const label = account.entries.find((entry) => entry.kind === 'name')?.label ?? '';
  return (
    <div className="shell-account" onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <Dropdown
        trigger={['click']}
        open={isOpen}
        onOpenChange={setOpen}
        placement="bottomRight"
        getPopupContainer={(node) => node.closest('header') ?? node.ownerDocument.body}
        popupRender={() => (
          <AccountPanel id={panelId} panelRef={panel} label={label} entries={account.entries} hitPx={hitPx ?? rowCompact}
            onClose={close} onFail={() => { void message.error('退出没有完成'); }} />
        )}
      >
        <Button ref={trigger} type="text" className="shell-account-trigger" style={{ minHeight: hitPx }}
          icon={<UserOutlined aria-hidden="true" className="shell-account-user-icon" />}
          aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined}>
          <span className="shell-account-label">{label}</span>
          <DownOutlined aria-hidden="true" className="shell-account-indicator" />
        </Button>
      </Dropdown>
    </div>
  );
}

function useAccountDisclosure() {
  const [isOpen, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  function close(): void {
    setOpen(false);
    trigger.current?.focus();
  }

  function handleBlur({ relatedTarget }: FocusEvent<HTMLDivElement>): void {
    if (isOpen && !trigger.current?.contains(relatedTarget) && !panel.current?.contains(relatedTarget)) setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!isOpen || (event.key !== 'Tab' && event.key !== 'Escape')) return;
    // Allow native Tab navigation through the disclosure actions.
    event.stopPropagation();
    if (event.key === 'Escape') close();
  }

  return { isOpen, setOpen, trigger, panel, close, handleBlur, handleKeyDown };
}

function AccountPanel(input: {
  readonly id: string;
  readonly panelRef: Ref<HTMLDivElement>;
  readonly label: string;
  readonly entries: readonly AccountEntry[];
  readonly hitPx: number;
  readonly onClose: () => void;
  readonly onFail: () => void;
}) {
  const { token } = theme.useToken();
  const roles = input.entries.filter((entry) => entry.kind === 'role');
  const actions = input.entries.filter((entry) => entry.kind === 'settings' || entry.kind === 'logout');
  return (
    <div ref={input.panelRef} id={input.id} className="shell-account-panel" style={{ boxShadow: token.boxShadowSecondary }}>
      <div className="shell-account-identity">
        <Typography.Text strong>{input.label}</Typography.Text>
        {roles.length === 0 ? null : (
          <div className="shell-account-roles">{roles.map((entry) => <Tag key={entry.key}>{entry.label}</Tag>)}</div>
        )}
      </div>
      <div className="shell-account-actions">
        {actions.map((entry, index) => (
          <Fragment key={entry.key}>
            {entry.kind === 'logout' && index > 0 ? <hr className="shell-account-divider" /> : null}
            <AccountAction entry={entry} hitPx={input.hitPx} onClose={input.onClose} onFail={input.onFail} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function AccountAction({ entry, hitPx, onClose, onFail }: {
  readonly entry: AccountEntry;
  readonly hitPx: number;
  readonly onClose: () => void;
  readonly onFail: () => void;
}) {
  if (entry.kind === 'settings') return (
    <Link to={SETTINGS_PATH} onClick={onClose} className="shell-account-action" style={{ minHeight: hitPx }}>
      <SettingOutlined aria-hidden="true" />
      {entry.label}
    </Link>
  );
  if (entry.kind === 'logout') return (
    <Button type="text" className="shell-account-action" style={{ minHeight: hitPx }}
      icon={<LogoutOutlined aria-hidden="true" />}
      onClick={() => {
        onClose();
        void endSession().catch(onFail);
      }}>
      {entry.label}
    </Button>
  );
  return null;
}

function unreachable(value: never): never {
  throw new Error(`未覆盖的种类 ${JSON.stringify(value)}`);
}
