import { Typography } from 'antd';
import { Link } from 'react-router';
import { useCanWrite } from '../../shared/actor.js';

export function ProgressNote({ href, saved }: { readonly href: string; readonly saved: string | undefined }) {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  return (
    <>
      {saved === undefined ? null : <div><Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{saved}</Typography.Text></div>}
      <Link to={href}>查看订单行详情</Link>
    </>
  );
}
