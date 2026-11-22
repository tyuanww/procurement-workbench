import { expect, it } from 'vitest';
import { replayFactorySnapshots, type FactorySnapshot } from '../../packages/domain/src/index.js';

const rows = (qty: number) => [{ orderLineId: 'line-1', fingerprint: 'shipment-1', qty }];

it('工厂快照同 fingerprint 重放不重复累计，新快照退休旧快照', () => {
  const input: FactorySnapshot[] = [
    { batchId: 'a1', sourceKey: 'factory-progress-v1:a', fingerprint: 'f1', effectiveAt: '2026-10-01T00:00:00Z', committedAt: '2026-10-01T01:00:00Z', rows: rows(10) },
    { batchId: 'a1-replay', sourceKey: 'factory-progress-v1:a', fingerprint: 'f1', effectiveAt: '2026-10-01T00:00:00Z', committedAt: '2026-10-01T02:00:00Z', rows: rows(10) },
    { batchId: 'a2', sourceKey: 'factory-progress-v1:a', fingerprint: 'f2', effectiveAt: '2026-10-02T00:00:00Z', committedAt: '2026-10-02T01:00:00Z', rows: rows(12) },
  ];
  const result = replayFactorySnapshots(input);
  expect(result.steps[1]?.duplicate).toBe(true);
  expect(result.active).toEqual({ 'factory-progress-v1:a': 'a2' });
  expect(result.totals).toEqual({ 'line-1': 12 });
  expect(result.steps[0]?.totals).toEqual({ 'line-1': 10 });
});

it('快照内重复业务 fingerprint 只取一行', () => {
  const result = replayFactorySnapshots([{
    batchId: 'a1', sourceKey: 'factory-progress-v1:a', fingerprint: 'f1', effectiveAt: '2026-10-01T00:00:00Z', committedAt: '2026-10-01T01:00:00Z',
    rows: [{ orderLineId: 'line-1', fingerprint: 'same', qty: 10 }, { orderLineId: 'line-1', fingerprint: 'same', qty: 10 }],
  }]);
  expect(result.totals).toEqual({ 'line-1': 10 });
});

