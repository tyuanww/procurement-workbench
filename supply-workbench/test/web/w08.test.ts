import { describe, expect, it } from 'vitest';
import type { LineStage } from '../../packages/domain/src/index.js';
import { groupByFiling, imageLabel, isChannelVariant, materialsCopy, stockMissingText } from '../../apps/web/src/features/product-archive/browse/groups.js';
import { purchaseStageButtons } from '../../apps/web/src/features/product-archive/index.js';

describe('产品档案浏览', () => {
  it('按备案名称分组，渠道规格有标签，没图写无图', () => {
    expect(groupByFiling([{ id: 'a', filingName: '面膜' }, { id: 'b', filingName: '面膜' }, { id: 'c', filingName: null }])).toEqual([
      { filingName: '面膜', ids: ['a', 'b'] },
      { filingName: '未备案', ids: ['c'] },
    ]);
    expect(isChannelVariant('2000000003023-2')).toBe(true);
    expect(isChannelVariant('2000000003023')).toBe(false);
    expect(imageLabel(false)).toBe('无图');
  });

  it('阶段按钮用中文，数量 0 保留，未知键原样，地址仍写英文码', () => {
    const counts: Readonly<Record<LineStage, number>> = {
      no_batch: 0,
      awaiting_date: 0,
      awaiting_shipment: 2,
      awaiting_receipt: 0,
      partially_received: 0,
      done: 0,
      cancelled: 0,
    };
    const buttons = purchaseStageButtons(counts);
    expect(buttons.find((button) => button.code === 'awaiting_shipment')).toEqual({ code: 'awaiting_shipment', text: '待发货 2' });
    expect(buttons.find((button) => button.code === 'no_batch')).toEqual({ code: 'no_batch', text: '未建要货 0' });
    expect(purchaseStageButtons({ nope: 1 })).toEqual([{ code: 'nope', text: 'nope 1' }]);
  });

  it('库存连不上写原因，组成说明里没有齐套', () => {
    expect(stockMissingText('没有已批准的对照')).toContain('去主数据审核');
    expect(materialsCopy()).not.toContain('齐套');
  });
});
