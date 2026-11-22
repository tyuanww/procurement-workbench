import type { TodayResponse } from '@sw/contracts';
import { readTodayPage } from '../../shared/api/reads.js';

const ACTION_PAGE_SIZE = 100;
const RISK_READ_ERROR = '待办读取不完整，物料风险仍需核对';

export async function progressActionSource(today: TodayResponse): Promise<{ readonly items: TodayResponse['items']; readonly notice: string }> {
  if (!today.truncated) return { items: today.items, notice: '' };
  const firstPage = Math.floor(today.items.length / ACTION_PAGE_SIZE) + 1;
  try {
    const first = await readActionPage(firstPage);
    const lastPage = Math.ceil(first.paging.total / ACTION_PAGE_SIZE);
    const later = await Promise.all(Array.from({ length: Math.max(0, lastPage - firstPage) }, (_unused, index) => readActionPage(firstPage + index + 1)));
    const pages = [first, ...later];
    const items = new Map([...today.items, ...pages.flatMap((page) => page.items)].map((item) => [item.id, item]));
    const isComplete = items.size === first.paging.total && pages.every((page, index) =>
      page.asOf === today.asOf && page.paging.total === first.paging.total && page.paging.page === firstPage + index,
    );
    return isComplete ? { items: [...items.values()], notice: '' } : { items: today.items, notice: RISK_READ_ERROR };
  } catch {
    return { items: today.items, notice: RISK_READ_ERROR };
  }
}

function readActionPage(page: number) {
  const query = new URLSearchParams({ scope: 'all', page: String(page), pageSize: String(ACTION_PAGE_SIZE) });
  return readTodayPage({ query: query.toString(), scope: 'all' });
}
