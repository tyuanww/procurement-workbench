import { Card, Empty, Flex, Select } from 'antd';
import { type ProcurementStore } from '@sw/contracts';
import { useSearchParams } from 'react-router';
import { deliveryBuyerOf, deliveryStoreOf, homeDeliveryRiskOf } from '../../features/follow-up/index.js';
import { space } from '../../theme/tokens.js';
import { DeliveryRiskOrders } from './delivery-risk-orders.js';
import { ProgressCurrent } from './progress-current.js';
import { progressFilterStyle } from './store-order.js';
import { storeLabels, withProgressScope, withProgressStore } from './store-query.js';

const storeOptions = Object.entries(storeLabels).map(([value, label]) => ({ value, label }));
const buyerOptions = [{ value: 'all', label: '全部事项' }, { value: 'mine', label: '我的事项' }];

export function DeliveryOrders() {
  const [params, setParams] = useSearchParams();
  const risk = homeDeliveryRiskOf(params);
  if (risk.kind !== 'daily') return <DeliveryRiskOrders risk={risk} />;

  const store = deliveryStoreOf(params);
  const buyer = deliveryBuyerOf(params);
  const onStore = (value: ProcurementStore) => {
    const next = withProgressStore(params.toString(), value);
    next.delete('lane');
    setParams(next);
  };
  const onBuyer = (value: 'all' | 'mine') => {
    const next = withProgressScope(params.toString(), value === 'mine');
    next.delete('buyer');
    setParams(next);
  };
  const filters = <>
    <Select<ProcurementStore> aria-label="店铺" value={store} placeholder="请选择店铺"
      options={storeOptions} style={progressFilterStyle} onChange={onStore} />
    <Select<'all' | 'mine'> aria-label="事项范围" value={buyer} placeholder="请选择事项范围"
      options={buyerOptions} style={progressFilterStyle} onChange={onBuyer} />
  </>;
  if (store !== null && buyer !== null) {
    return <ProgressCurrent store={store} isMine={buyer === 'mine'} filters={filters} origin="delivery" />;
  }

  return <>
    <Card size="small" style={{ marginBottom: space[3] }}>
      <Flex gap={space[2]} wrap align="center" role="group" aria-label="店铺交付筛选">{filters}</Flex>
    </Card>
    <Empty description="当前条件无法用于成品交付。请在上方选择店铺或事项范围。" />
  </>;
}
