import { Typography } from 'antd';
import { Link } from 'react-router';
import { useCanWrite } from '../../shared/actor.js';
import type { ProgressOrderLinkProps } from './delivery-detail-link.js';

export function ProgressNote({ link, saved }: { readonly link: ProgressOrderLinkProps; readonly saved: string | undefined }) {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  return (
    <>
      {saved === undefined ? null : <div><Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{saved}</Typography.Text></div>}
      <Link {...link}>查看订单行详情</Link>
    </>
  );
}
