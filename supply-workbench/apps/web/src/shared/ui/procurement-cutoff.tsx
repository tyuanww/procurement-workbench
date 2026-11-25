import { useOutletContext } from 'react-router';
import { text } from '../../theme/tokens.js';

export function ProcurementCutoff() {
  const date = useOutletContext<{ readonly procurementDate: string | null } | null>()?.procurementDate;
  if (!date) return null;
  return <div className="procurement-cutoff" title="最近一次生效的采购订单总表的文件上传日期"
    style={{ marginInlineStart: 'auto', flexShrink: 0, whiteSpace: 'nowrap', color: text.secondary }}>
    *数据截止 <time dateTime={date}>{date}</time>
  </div>;
}
