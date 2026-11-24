import { Badge, Button, Dropdown, Menu, Tag, Tooltip, Typography, type MenuProps } from 'antd';
import { LogoutOutlined, QuestionCircleOutlined, SettingOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useCan } from '../shared/actor.js';
import { SETTINGS_PATH } from '../shared/page-manifest.js';
import {
  endSession,
  type AccountEntry,
  type BadgeMark,
  type FreshnessChip,
  type ShellView,
} from '../features/shell/index.js';
import { bg, brand, space, statusColor, text } from '../theme/tokens.js';

export function NavBadge({ mark, compact, id }: { readonly mark: BadgeMark; readonly compact: boolean; readonly id: string }) {
  switch (mark.kind) {
    case 'count':
      if (compact) return null;
      return <Badge id={id} count={mark.value} color={brand[100]} styles={{ indicator: { color: brand[800] } }} />;
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

export function FreshnessLink({ freshness }: { readonly freshness: ShellView['freshness'] }) {
  const canReadImports = useCan('imports.read');
  const body =
    freshness.chips.length === 0 ? (
      <span style={{ color: text.secondary }}>{freshness.headline}</span>
    ) : (
      freshness.chips.map((chip) => <FreshnessChipView key={chip.key} chip={chip} />)
    );
  const style = freshnessLinkStyle();
  return canReadImports ? <Link to="/imports" style={style}>{body}</Link> : <div style={style}>{body}</div>;
}

export function AccountMenu({ account }: { readonly account: ShellView['account'] }) {
  const [isOpen, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const name = account.entries.find((entry) => entry.kind === 'name');
  const label = name === undefined ? '' : name.label;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div onKeyDown={(event) => {
      // Let native Tab navigation reach links inside this custom dropdown panel.
      if (isOpen && event.key === 'Tab') event.stopPropagation();
    }}>
      <Dropdown
        trigger={['click']}
        open={isOpen}
        onOpenChange={setOpen}
        placement="bottomRight"
        getPopupContainer={(node) => node.closest('header') ?? node.ownerDocument.body}
        popupRender={() => (
          <AccountPanel id={panelId} entries={account.entries} onClose={close} onFail={() => setLogoutError('退出没有完成')} />
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

export function freshnessLinkStyle(): { readonly minWidth: 0; readonly flex: string; readonly overflow: 'hidden'; readonly display: 'flex'; readonly gap: number; readonly alignItems: 'center' } {
  return { minWidth: 0, flex: '0 1 auto', overflow: 'hidden', display: 'flex', gap: space[1], alignItems: 'center' };
}

export function freshnessChipBoxStyle(status: FreshnessChip['status'] | boolean): CSSProperties {
  const normalized = typeof status === 'boolean' ? (status ? 'stale' : 'fresh') : status;
  return { ...chipStyle(normalized), flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

function FreshnessChipView({ chip }: { readonly chip: FreshnessChip }) {
  return (
    <Tooltip title={chip.tooltip}>
      <span style={freshnessChipBoxStyle(chip.status)}>
        {chip.status === 'stale' ? <WarningOutlined /> : chip.status === 'unknown' ? <QuestionCircleOutlined /> : null}
        {chip.text}
      </span>
    </Tooltip>
  );
}

function chipStyle(status: FreshnessChip['status']): { readonly color: string; readonly background?: string } {
  if (status === 'fresh') return { color: text.secondary };
  if (status === 'unknown') return { color: statusColor.warning.text };
  return { color: statusColor.warning.text, background: statusColor.warning.bg };
}

function AccountPanel(input: { readonly id: string; readonly entries: readonly AccountEntry[]; readonly onClose: () => void; readonly onFail: () => void }) {
  return (
    <div id={input.id} style={{ background: bg.surface, padding: space[2], display: 'flex', flexDirection: 'column', gap: space[1] }}>
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
