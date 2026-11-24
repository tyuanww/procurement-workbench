import { Badge, Button, Dropdown, Menu, Tag, Tooltip, Typography, type MenuProps } from 'antd';
import type { CSSProperties } from 'react';
import { LogoutOutlined, QuestionCircleOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCan } from '../shared/actor.js';
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
  const [logoutError, setLogoutError] = useState('');
  const name = account.entries.find((entry) => entry.kind === 'name');
  const label = name === undefined ? '' : name.label;
  return (
    <>
      <Dropdown
        trigger={['click']}
        popupRender={() => (
          <AccountPanel entries={account.entries} onFail={() => setLogoutError('退出没有完成')} />
        )}
      >
        <Button type="text">
          <UserOutlined />
          {label}
        </Button>
      </Dropdown>
      {logoutError === '' ? null : <Typography.Text type="danger">{logoutError}</Typography.Text>}
    </>
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

function AccountPanel(input: { readonly entries: readonly AccountEntry[]; readonly onFail: () => void }) {
  return (
    <div style={{ background: bg.surface, padding: space[2], display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {input.entries.map((entry) => (
        <AccountRow key={entry.key} entry={entry} onFail={input.onFail} />
      ))}
    </div>
  );
}

function AccountRow(input: { readonly entry: AccountEntry; readonly onFail: () => void }) {
  if (input.entry.kind === 'name') return <Typography.Text>{input.entry.label}</Typography.Text>;
  if (input.entry.kind === 'role') return <Tag>{input.entry.label}</Tag>;
  if (input.entry.kind === 'logout') return <LogoutItem entry={input.entry} onFail={input.onFail} />;
  return unreachable(input.entry.kind);
}

function LogoutItem(input: { readonly entry: AccountEntry; readonly onFail: () => void }) {
  return (
    <Menu
      selectable={false}
      items={logoutItems(input.entry)}
      onClick={() => {
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
