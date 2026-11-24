import { describe, expect, it } from 'vitest';
import { progressPagination, withProgressPagination, resetProgressPagination } from '../../apps/web/src/pages/progress/store-query.js';

describe('当前进度回查', () => {
  it('从地址恢复页码和每页条数', () => {
    expect(progressPagination(new URLSearchParams('store=dafuyan&drill=overdue&page=2&pageSize=20')))
      .toEqual({ page: 2, pageSize: 20 });
    expect(progressPagination(new URLSearchParams('page=-2&pageSize=999'))).toEqual({ page: 1, pageSize: 50 });
  });

  it('翻页保留原筛选并移除旧定位，切换查询时回到第一页', () => {
    const params = new URLSearchParams('store=dafuyan&oa=OA-11&drill=overdue&focusLine=line-51');
    const next = withProgressPagination(params, { page: 2, pageSize: 100 });
    expect(Object.fromEntries(next)).toEqual({ store: 'dafuyan', oa: 'OA-11', drill: 'overdue', page: '2', pageSize: '100' });
    expect(Object.fromEntries(resetProgressPagination(next))).toEqual({ store: 'dafuyan', oa: 'OA-11', drill: 'overdue', pageSize: '100' });
  });
});
