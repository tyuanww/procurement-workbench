import { Result, Typography } from 'antd';
import { usePageTitle } from '../../shared/ui/page.js';

export function ForbiddenPage() {
  usePageTitle('无权访问');
  return <Result status="403" title={<Typography.Title level={1}>这个角色看不到这页。</Typography.Title>} />;
}
