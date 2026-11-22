import { expect, it } from 'vitest';
import { developmentForecast } from '../../apps/web/src/pages/progress/product-development-forecast.js';
import { entityId, localDate, orderLineId } from '../../packages/domain/src/index.js';

const nodeId = entityId('node-1');
const required = localDate('2026-11-23');
const lateReply = {
  id: entityId('reply-1'), nodeId, promisedOn: localDate('2026-11-25'), evidence: '最早周三到厂',
  actorUserId: entityId('buyer-1'), actorName: '采购甲', recordedAt: '2026-11-19T00:00:00Z',
};
const open = { status: 'planned', plannedEnd: required, formalLink: null, latestReply: lateReply } satisfies Parameters<typeof developmentForecast>[0];

it('按最新承诺和项目要求的自然日差算预计晚到，跨年仍使用相同口径', () => {
  expect(developmentForecast(open)).toEqual({ kind: 'late', days: 2 });
  expect(developmentForecast({
    ...open, plannedEnd: localDate('2026-12-31'), latestReply: { ...lateReply, promisedOn: localDate('2027-01-02') },
  })).toEqual({ kind: 'late', days: 2 });
});

it('区分未收到承诺和已承诺不晚于要求', () => {
  expect(developmentForecast({ ...open, latestReply: null })).toEqual({ kind: 'unknown' });
  for (const promisedOn of [required, localDate('2026-11-22')]) {
    expect(developmentForecast({ ...open, latestReply: { ...lateReply, promisedOn } })).toEqual({ kind: 'on-time' });
  }
});

it('结束的节点或转入正式履约的节点不再按旧承诺给出预测', () => {
  expect(developmentForecast({ ...open, status: 'done' })).toEqual({ kind: 'inactive' });
  expect(developmentForecast({ ...open, status: 'cancelled' })).toEqual({ kind: 'inactive' });
  const order = orderLineId('order-1');
  expect(developmentForecast({ ...open, formalLink: { orderLineId: order, procurementLineId: order, oaRef: 'OA001' } })).toEqual({ kind: 'inactive' });
});
