import type { OrderLineRow } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';

export const DELIVERY_RISK_REASONS = { overdue: '已逾期', late: '确认到货晚于需求' } as const;

export function deliveryRiskReasons(line: Pick<OrderLineRow, 'nextDue'>, today: LocalDate): (keyof typeof DELIVERY_RISK_REASONS)[] {
  const date = line.nextDue?.dateBuyerConfirmed;
  if (!date) return [];
  const demand = line.nextDue?.dateFactoryRequired;
  const reasons: (keyof typeof DELIVERY_RISK_REASONS)[] = [];
  if (date < today) reasons.push('overdue');
  if (demand && demand < date) reasons.push('late');
  return reasons;
}
