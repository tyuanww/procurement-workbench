import { ViewNav } from './view-nav.js';

const VIEWS = [{ to: '/dashboard', label: '看板' }, { to: '/reports', label: '周报' }];

export function ManagementViewNav() {
  return <ViewNav label="管理视图" views={VIEWS} />;
}
