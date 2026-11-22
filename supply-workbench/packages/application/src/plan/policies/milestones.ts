import type { DeliveryBatch } from '../../../../domain/src/entities/orders.js';
import type { MilestoneField } from '../../../../domain/src/entities/work-items.js';
import type { LocalDate } from '../../../../domain/src/values/local-date.js';
import { entityId } from '../../../../domain/src/values/ids.js';
import type { EntityId } from '../../../../domain/src/values/ids.js';

export type MilestoneDraft = {
  readonly field: MilestoneField;
  readonly title: string;
  readonly date: LocalDate;
};

const MILESTONE_LABELS: Readonly<Record<MilestoneField, string>> = {
  date_buyer_confirmed: '确认到货日',
  date_factory_required: '工厂要求日',
  date_supplier_promised: '供应商承诺日',
};

/** 从批次的三个日期字段生成里程碑；没有日期的字段不生成。 */
export function milestoneDrafts(batch: DeliveryBatch): readonly MilestoneDraft[] {
  return [
    draftOf('date_buyer_confirmed', batch.dateBuyerConfirmed),
    draftOf('date_factory_required', batch.dateFactoryRequired),
    draftOf('date_supplier_promised', batch.dateSupplierPromised),
  ].flatMap((item) => (item === null ? [] : [item]));
}

/** 生成的里程碑用确定性 id，重复导入靠它去重。 */
export function milestoneWorkItemId(batchId: EntityId, field: MilestoneField): EntityId {
  return entityId(`work-item:batch:${batchId}:${field}`);
}

function draftOf(field: MilestoneField, date: LocalDate | null): MilestoneDraft | null {
  if (date === null) return null;
  return { field, title: `${MILESTONE_LABELS[field]} ${date}`, date };
}
