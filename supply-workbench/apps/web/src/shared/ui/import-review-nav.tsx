import { useCan } from '../actor.js';
import { ViewNav } from './view-nav.js';

const VIEWS = [{ to: '/imports', label: '导入中心' }, { to: '/master', label: '主数据' }];

export function ImportReviewNav() {
  const canReadImports = useCan('imports.read');
  const canReview = useCan('master.review');
  if (!canReadImports || !canReview) return null;
  return <ViewNav label="导入与审核" views={VIEWS} />;
}
