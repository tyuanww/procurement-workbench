import { Button, Flex, Pagination, Typography } from 'antd';
import type { OrderLineDetail, OrderLineRow } from '@sw/contracts';
import { normalizeProcurementReference, procurementOaReferences } from '@sw/domain';
import { useCan } from '../../shared/actor.js';
import { space } from '../../theme/tokens.js';
import { planningRowTriggerId } from './planning-navigation.js';
import { planningOrderFields, type PlanningGroup, type PlanningSource } from './planning-rows.js';
import { progressOrderRef } from './store-order.js';

export type OpenPlanningOrder = (id: string, triggerId: string) => void;

export function PlanningOrderMatches({ rows, onOpen, selectedRow, detail, page, onPage }: {
  readonly rows: readonly OrderLineRow[];
  readonly onOpen: OpenPlanningOrder;
  readonly selectedRow: string | null;
  readonly detail: OrderLineDetail | null;
  readonly page: number;
  readonly onPage: (page: number) => void;
}) {
  const canBuild = useCan('records.write');
  if (rows.length === 0) return null;
  const size = 8;
  const current = Math.min(page, Math.ceil(rows.length / size));
  return <section className="planning-order-matches" aria-label="匹配成品订单">
    <Typography.Text strong>匹配成品订单 {rows.length} 条</Typography.Text>
    {rows.slice((current - 1) * size, current * size).map((row) => {
      return <PlanningOrderResult key={row.id} {...{ row, onOpen, selectedRow }}
        detail={detail?.line.id === row.id ? detail : null} canBuild={canBuild} />;
    })}
    {rows.length <= size ? null : <Pagination size="small" current={current} pageSize={size} total={rows.length} onChange={onPage} />}
  </section>;
}

function PlanningOrderResult({ row, onOpen, selectedRow, detail, canBuild }: {
  readonly row: OrderLineRow; readonly onOpen: OpenPlanningOrder; readonly selectedRow: string | null;
  readonly detail: OrderLineDetail | null; readonly canBuild: boolean;
}) {
  const key = `order:${row.id}`;
  const id = planningRowTriggerId(key);
  const schedule = detail?.procurementSchedule;
  const label = row.nameRaw ?? '未命名成品';
  const status = scheduleStatus(schedule);
  const action = status === '未建排期' && canBuild && row.origin === 'import_po_master' ? '建立排期' : '查看排期';
  return <div className="planning-order-result" data-selected={selectedRow === key}>
    <div><Typography.Text strong>{label}</Typography.Text>
      <div className="planning-row-meta">{[progressOrderRef(row), row.po.poRaw].filter(Boolean).join(' · ')}</div></div>
    <Flex gap={space[1]} align="center" wrap>
      {status === null ? null : <Typography.Text type="secondary">{status}</Typography.Text>}
      <Button id={id} aria-label={`${action} ${label}`} onClick={() => onOpen(row.id, id)}>{action}</Button>
    </Flex>
  </div>;
}

function scheduleStatus(schedule: OrderLineDetail['procurementSchedule']): string | null {
  if (schedule === undefined) return null;
  return schedule.items.length === 0 ? '未建排期' : '已建排期';
}

export function planningOrderPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function uniqueMatchedOrderId(rows: readonly OrderLineRow[]): string | null {
  return rows.length === 1 ? rows[0]?.id ?? null : null;
}

export function matchingOrders(orders: readonly OrderLineRow[], keyword: string): readonly OrderLineRow[] {
  if (keyword === '') return [];
  const needle = keyword.toLocaleLowerCase();
  return orders.filter((order) => isExactOrderReference(order, keyword)
    || planningOrderFields(order).some((field) => field?.toLocaleLowerCase().includes(needle)));
}

export function hasUnambiguousWeeklyBatch({ groups, rows, keyword }: {
  readonly groups: readonly PlanningGroup[];
  readonly rows: readonly OrderLineRow[];
  readonly keyword: string;
}): boolean {
  const order = rows.length === 1 ? rows[0] : undefined;
  if (order === undefined || !isExactOrderReference(order, keyword)) return false;
  if (!isDirectWeeklyBatch(groups[0]?.rows[0]?.source, order.id)) return false;
  return groups.every((group) => group.rows.every(({ source }) => source.kind !== 'batch' || source.batch.orderLineId === order.id));
}

function isDirectWeeklyBatch(source: PlanningSource | undefined, orderLineId: string): boolean {
  return source?.kind === 'batch' && source.batch.orderLineId === orderLineId && source.batch.kind === 'order'
    && source.batch.weeklyDelivery !== undefined && source.batch.node === undefined;
}

function isExactOrderReference(order: OrderLineRow, keyword: string): boolean {
  const needle = normalizeProcurementReference(keyword);
  if (needle === '') return false;
  const matches = (value: string | null) => value !== null && normalizeProcurementReference(value) === needle;
  return matches(order.po.poRaw) || (order.storeProgress?.sources ?? []).some(({ oaRaw }) =>
    matches(oaRaw) || procurementOaReferences(oaRaw).some(({ raw }) => matches(raw)));
}
