import { describe, expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import { readDesk } from '../../apps/web/src/features/follow-up/index.js';
import {
  dailyDeliveryParams, deliveryBackAddress, deliveryBuyerOf, deliveryStoreOf, homeDeliveryRiskAddress, homeDeliveryRiskOf, orderLensOf, switchOrderLens,
} from '../../apps/web/src/features/follow-up/line-list/order-lens-query.js';
import { deliveryRiskReasons } from '../../apps/web/src/features/follow-up/line-list/delivery-risk.js';
import { followUpAddress, followUpParams } from '../../apps/web/src/features/follow-up/line-list/follow-up-address.js';
import { followUpFeishuReturn } from '../../apps/web/src/features/follow-up/line-list/follow-up-login.js';
import { arrivalEvidenceLink, readLineDetailBack } from '../../apps/web/src/pages/lines/detail/desk-navigation.js';
import { clearFiltersAddress, saveAddress, viewAddress } from '../../apps/web/src/pages/lines/list/view-bar.js';

describe('跟进中心订单查法', () => {
  it('分别恢复查单和店铺筛选，查单照常用显式线别及页码', () => {
    const initial = new URLSearchParams({ lane: 'finished', q: 'PO20261117009103', store: 'dafuyan', page: '2', view: 'saved' });
    const delivery = switchOrderLens(initial, 'delivery');
    expect(deliveryStoreOf(delivery)).toBe('dafuyan');
    delivery.set('scope', 'mine');
    delivery.set('drill', 'overdue');
    delivery.append('openLine', 'finished-1');
    const orders = switchOrderLens(delivery, 'query');
    expect(new URLSearchParams(readDesk(orders.toString()).requestQuery).get('lane')).toBe('finished');
    expect(orders.get('q')).toBe(initial.get('q'));
    expect(orders.get('page')).toBe('2');
    expect(orders.get('view')).toBe('saved');
    const restored = switchOrderLens(orders, 'delivery');
    expect(deliveryBuyerOf(restored)).toBe('mine');
    expect(restored.get('drill')).toBe('overdue');
    expect(restored.getAll('openLine')).toEqual(['finished-1']);
    expect(saveAddress(orders.toString())).not.toContain('deliveryQuery');
    expect(clearFiltersAddress(orders.toString()).get('deliveryQuery')).toBe(orders.get('deliveryQuery'));
    expect(viewAddress({ search: orders.toString(), view: { id: 'next', label: '新视图', query: 'lane=material' } }).get('deliveryQuery'))
      .toBe(orders.get('deliveryQuery'));
  });

  it('导入批次始终使用订单查询，普通链接保留店铺交付查法', () => {
    const scope = new URLSearchParams({ importBatchId: 'batch-a', store: 'dafuyan', lens: 'delivery' });
    expect(orderLensOf(scope)).toBe('query');
    expect(orderLensOf(switchOrderLens(scope, 'delivery'))).toBe('query');
    expect(switchOrderLens(scope, 'delivery').get('importBatchId')).toBe('batch-a');
    expect(switchOrderLens(scope, 'delivery').get('store')).toBe('dafuyan');
    expect(orderLensOf(new URLSearchParams('importBatchId=&lens=delivery'))).toBe('delivery');
  });

  it('关联子件可返回大小写及尾斜杠不同的原订单地址，拒绝非订单和外部地址', () => {
    const originalState = { lineDeskSearch: 'importBatchId=batch-a&store=dafuyan' };
    const readBack = (to: string) => readLineDetailBack({ lineId: 'component', params: new URLSearchParams(),
      state: { relatedOrderOrigin: { to, state: originalState } }, canReadDashboard: false, canReadImports: true });
    const address = '/Lines/original//?importBatchId=batch-a&store=dafuyan';
    expect(readBack(address)).toEqual({ to: address, label: '返回原订单', state: originalState });
    for (const to of ['/imports/batch-a', '/lines', '/lines/%2e%2e', 'https://external.invalid/lines/original', '//external.invalid/lines/original', '/\\external.invalid/lines/original']) {
      expect(readBack(to)).toBeNull();
    }
  });

  it('详情和到仓凭据从当前范围重建地址，不保留其他批次、店铺或来源的历史状态', () => {
    const source = '/imports/batch-a?store=dafuyan&drawer=import-source&source=batch';
    const params = new URLSearchParams({ importBatchId: 'batch-a', store: 'dafuyan', backToImport: source });
    const proof = { isImportMember: true, isVerifiedProcurement: false, confirmedArrival: false };
    const stale = [
      new URLSearchParams({ importBatchId: 'batch-b', store: 'dafuyan' }),
      new URLSearchParams({ importBatchId: 'batch-a', store: 'yiling' }),
      new URLSearchParams({ importBatchId: 'batch-a', store: 'dafuyan', backToImport: source + '&arrivalPage=2' }),
    ];
    for (const saved of stale) {
      saved.set('q', '原列表筛选');
      const state = { lineDeskSearch: saved.toString(), importBatchOrigin: { stale: true } };
      const back = readLineDetailBack({ lineId: 'manual', params, state, canReadDashboard: false, canReadImports: true, proof });
      expect(back?.to).toBe(source);
      const evidence = arrivalEvidenceLink({ arrivalId: 'receipt', params, state, isImportMember: true });
      const evidenceQuery = new URL(evidence.to, 'https://workbench.invalid').searchParams;
      expect(evidenceQuery.get('importBatchId')).toBe('batch-a');
      expect(evidenceQuery.get('store')).toBe('dafuyan');
      expect(evidenceQuery.get('backToImport')).toBe(source);
      expect(evidenceQuery.has('q')).toBe(false);
      expect(evidence.state).toBeUndefined();
    }
    params.delete('importBatchId');
    const back = readLineDetailBack({ lineId: 'manual', params, state: null, canReadDashboard: false, canReadImports: true });
    expect(back).toBeNull();
  });

  it('明确的物料线、无效店铺及负责人筛选需要重新选择范围', () => {
    expect(deliveryStoreOf(switchOrderLens(new URLSearchParams('lane=material&store=dafuyan'), 'delivery'))).toBeNull();
    expect(deliveryStoreOf(new URLSearchParams('store=other'))).toBeNull();
    expect(deliveryBuyerOf(new URLSearchParams('buyer=specific&scope=all'))).toBeNull();
    expect(deliveryBuyerOf(new URLSearchParams('buyer=me&scope=all'))).toBeNull();
    expect(deliveryStoreOf(new URLSearchParams('lane=all'))).toBe('all');
    expect(deliveryStoreOf(new URLSearchParams('store=unassigned'))).toBe('unassigned');
  });

  it('首页风险保留两类订单行 ID，但明确空组及缺店铺时不进入日常成品查询', () => {
    const date = localDate('2026-11-27');
    const ids = ['finished:1,1', 'procurement-component:p:cap', 'finished:1,1'];
    const address = new URL(homeDeliveryRiskAddress({ store: 'dafuyan', date, ids }), 'http://localhost');
    expect(homeDeliveryRiskOf(address.searchParams)).toEqual({ kind: 'home-risk', store: 'dafuyan', date, ids: ids.slice(0, 2) });
    expect(homeDeliveryRiskOf(new URLSearchParams({ store: 'dafuyan', riskDate: date }))).toEqual({ kind: 'invalid' });
    expect(homeDeliveryRiskOf(new URLSearchParams({ riskLine: 'finished:1,1', riskDate: date }))).toEqual({ kind: 'invalid' });
    expect(homeDeliveryRiskOf(dailyDeliveryParams(address.searchParams))).toEqual({ kind: 'daily' });
    expect(dailyDeliveryParams(address.searchParams).get('store')).toBe('dafuyan');
  });

  it('同一天判断逾期和确认晚于需求，两类原因可同时成立', () => {
    const today = localDate('2026-11-27');
    const nextDue = { batchId: 'batch:1', overdueDays: 1, dateBuyerConfirmed: localDate('2026-11-26'), dateFactoryRequired: localDate('2026-11-25') };
    expect(deliveryRiskReasons({ nextDue }, today)).toEqual(['overdue', 'late']);
    expect(deliveryRiskReasons({ nextDue: { ...nextDue, dateBuyerConfirmed: today } }, today)).toEqual(['late']);
    expect(deliveryRiskReasons({ nextDue: { ...nextDue, dateBuyerConfirmed: null } }, today)).toEqual([]);
  });

  it('数百条风险在新页面、下钻和切换查法时精确保留，HTTP 查询不带整组', () => {
    const ids = Array.from({ length: 320 }, (_, index) => `procurement-component:synthetic-follow-up-risk:${index}`);
    const date = localDate('2026-11-27');
    const base = 'https://workbench.invalid';
    const home = new URL(homeDeliveryRiskAddress({ store: 'dafuyan', date, ids, returnQuery: new URLSearchParams({ backToHome: 'store=dafuyan&drawer=risk' }) }), base);
    expect(home.searchParams.getAll('riskLine')).toEqual([]);
    const selected = followUpParams(home.search, home.hash);
    expect(homeDeliveryRiskOf(selected)).toEqual({ kind: 'home-risk', store: 'dafuyan', date, ids });
    expect(selected.get('backToHome')).toBe('store=dafuyan&drawer=risk');
    selected.set('page', '6');

    const detail = new URL(followUpAddress('/lines/material', new URLSearchParams({ store: 'dafuyan', backToDelivery: selected.toString() })), base);
    expect(detail.searchParams.get('backToDelivery')).toBeNull();
    const back = new URL(deliveryBackAddress(followUpParams(detail.search, detail.hash).get('backToDelivery') ?? ''), base);
    expect(back.searchParams.get('page')).toBe('6');
    expect(followUpParams(back.search, back.hash).getAll('riskLine')).toEqual(ids);

    const switched = new URL(followUpAddress('/lines', switchOrderLens(selected, 'query')), base);
    expect(switched.searchParams.get('deliveryQuery')).toBeNull();
    expect(switchOrderLens(followUpParams(switched.search, switched.hash), 'delivery').getAll('riskLine')).toEqual(ids);
    expect(followUpParams('?store=dafuyan', '#follow-up?store=yiling').get('store')).toBe('dafuyan');
    const login = followUpFeishuReturn(detail.pathname + detail.search + detail.hash, 'd10c6d8b-f7e7-48c7-a086-02a4283f1072');
    expect(login.returnTo.length).toBeLessThan(200);
    expect(login.stored?.value).toBe(detail.pathname + detail.search + detail.hash);
  });
});
