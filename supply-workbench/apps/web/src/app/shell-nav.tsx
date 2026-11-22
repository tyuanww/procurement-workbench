import {
  AppstoreOutlined,
  CalendarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  ImportOutlined,
  ProfileOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { NavPath, NavRow } from '../features/shell/index.js';
import { NavBadge } from './shell-session.js';

export function navMenuItems(input: {
  readonly rows: readonly NavRow[];
  readonly isCollapsed: boolean;
  readonly onNavigate: () => void;
}): NonNullable<MenuProps['items']> {
  return input.rows.map((row) => ({
    key: row.to,
    label: <NavLink row={row} isCollapsed={input.isCollapsed} onNavigate={input.onNavigate} />,
  }));
}

function NavLink(input: { readonly row: NavRow; readonly isCollapsed: boolean; readonly onNavigate: () => void }) {
  const badgeId = useId();
  const hasVisibleCount = !input.isCollapsed && input.row.badge.kind === 'count';
  return (
    <Link
      to={input.row.to}
      aria-label={input.row.label}
      aria-describedby={hasVisibleCount ? badgeId : undefined}
      onClick={input.onNavigate}
      style={{ color: 'inherit' }}
    >
      <span aria-hidden="true">{navGlyph(input.row.to)}</span>
      {input.isCollapsed ? null : `${input.row.label} `}
      <NavBadge mark={input.row.badge} compact={input.isCollapsed} id={badgeId} />
    </Link>
  );
}

function navGlyph(path: NavPath): ReactNode {
  switch (path) {
    case '/progress':
      return <FieldTimeOutlined />;
    case '/today':
      return <CalendarOutlined />;
    case '/lines':
      return <ProfileOutlined />;
    case '/dashboard':
      return <DashboardOutlined />;
    case '/reports':
      return <FileTextOutlined />;
    case '/products':
      return <AppstoreOutlined />;
    case '/imports':
      return <ImportOutlined />;
    case '/master':
      return <DatabaseOutlined />;
    case '/settings':
      return <SettingOutlined />;
    default:
      return missed(path);
  }
}

function missed(path: never): never {
  throw new Error(`导航没有图标 ${path}`);
}
