import { describe, expect, it } from 'vitest';
import { hintSkipText, loadViews, presetViews, readDesk, saveView } from '../../apps/web/src/features/follow-up/index.js';

describe('跟进台筛选和视图', () => {
  it('成品线和物料线列不同', () => {
    const finished = readDesk('lane=finished').columns.map((column) => column.key);
    const material = readDesk('lane=material').columns.map((column) => column.key);
    expect(finished).toContain('factoryDelivered');
    expect(material).toContain('factoryRequired');
    expect(material).not.toContain('factoryDelivered');
  });

  it('预设视图进查询串，自定义视图按用户存在本地', () => {
    expect(presetViews().map((view) => view.id)).toEqual(['mine-overdue', 'no-batch', 'yinong']);
    expect(presetViews().map((view) => view.query)).toEqual(['buyer=me&overdue=1', 'stage=no_batch', 'q=宜侬']);
    const storage = memoryStorage();
    saveView({ storage, userId: 'buyer-1', view: { id: 'custom', label: '我的', query: 'q=面膜' } });
    expect(loadViews(storage, 'buyer-1')).toEqual([{ id: 'custom', label: '我的', query: 'q=面膜' }]);
    expect(loadViews(storage, 'buyer-2')).toEqual([]);
    storage.setItem('sw.line-views.buyer-1', '{');
    expect(loadViews(storage, 'buyer-1')).toEqual([]);
    storage.setItem('sw.line-views.buyer-1', JSON.stringify([{ id: 1, label: '坏', query: 'q=1' }]));
    expect(loadViews(storage, 'buyer-1')).toEqual([]);
  });

  it('第二页仍是独立请求，每页不超过 200', () => {
    const first = new URLSearchParams(readDesk('q=宜侬').requestQuery);
    const second = new URLSearchParams(readDesk('q=宜侬&page=2&pageSize=500').requestQuery);
    expect(second.get('page')).toBe('2');
    expect(Number(second.get('pageSize'))).toBeLessThanOrEqual(200);
    expect(first.toString()).not.toBe(second.toString());
  });

  it('生成批次的跳过原因列出来', () => {
    expect(hintSkipText([{ lineId: 'l1', reason: '没有订单数量' }])).toEqual(['l1：没有订单数量']);
  });
});

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
}
