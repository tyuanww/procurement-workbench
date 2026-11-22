import { Result, Typography } from 'antd';
import { Link } from 'react-router';
import { usePageTitle } from '../../shared/ui/page.js';

export function MissingPage() {
  usePageTitle('页面不存在');
  return <Result status="404" title={<Typography.Title level={1}>页面不存在</Typography.Title>} extra={<Link to="/today">返回今日</Link>} />;
}
