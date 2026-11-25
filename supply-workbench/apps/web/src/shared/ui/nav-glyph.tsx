import {
  AppstoreOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  HomeOutlined,
  ImportOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { NavPath } from '../page-manifest.js';

export function navGlyph(path: NavPath): ReactNode {
  switch (path) {
    case '/home':
      return <HomeOutlined />;
    case '/progress':
      return <FieldTimeOutlined />;
    case '/today':
      return <CalendarOutlined />;
    case '/lines':
      return <ProfileOutlined />;
    case '/dashboard':
      return <DashboardOutlined />;
    case '/products':
      return <AppstoreOutlined />;
    case '/imports':
      return <ImportOutlined />;
    default:
      return missed(path);
  }
}

function missed(path: never): never {
  throw new Error(`导航没有图标 ${path}`);
}
