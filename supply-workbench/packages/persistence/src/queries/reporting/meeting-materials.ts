import { reportedProcurementQuantity, type ManagementMeetingPeriod, type ManagementMeetingStore, type MeetingFinishedLine, type MeetingMaterial, type ProcurementFact } from '@sw/application';
import { localDate } from '@sw/domain';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../client.js';
import { currentLineOaReference } from '../store-progress/line-oa-reference.js';
import { STORE_EVIDENCE, scopedEdgeExists } from '../store-progress/scope.js';
import { loadMeetingBatches, meetingQuantities, openRisk } from './meeting-fulfillment.js';

type SourceRow = {
  readonly materialId: string;
  readonly importBatchId: string;
  readonly fact: ProcurementFact;
  readonly poRef: string | null;
  readonly buyerName: string | null;
  readonly supplierName: string | null;
  readonly receiverName: string | null;
};

type FinishedRow = MeetingFinishedLine & {
  readonly materialId: string;
  readonly targetDate: string | null;
};

export async function meetingMaterials(input: {
  readonly db: AppDatabase;
  readonly period: ManagementMeetingPeriod;
  readonly timeZone: string;
}): Promise<readonly MeetingMaterial[]> {
  const { db, period } = input;
  const sourceRows = await sources(db, period.store);
  const parents = await finished(db, period.store);
  const batchesById = await loadMeetingBatches({ ...input, lineIds: sourceRows.rows.map((row) => row.materialId) });
  const byMaterial = new Map<string, FinishedRow[]>();
  for (const row of parents.rows) {
    const bucket = byMaterial.get(row.materialId);
    if (bucket === undefined) byMaterial.set(row.materialId, [row]);
    else bucket.push(row);
  }
  return sourceRows.rows.map((row) => {
    const batches = batchesById.get(row.materialId) ?? [];
    const { fact } = row;
    const unit = fact.unitRaw;
    const sourceReportedProgress = fact.deliveryProgressRaw ?? null;
    const sourceReportedQty = sourceReportedProgress === null ? null : reportedProcurementQuantity(sourceReportedProgress, unit);
    const sourceReportedGap = fact.quantity === null || sourceReportedQty === null || sourceReportedQty > fact.quantity
      ? null : fact.quantity - sourceReportedQty;
    const quantities = meetingQuantities({ batches, unit, ordered: fact.quantity, reportedGap: sourceReportedGap });
    const affectedFinished = (byMaterial.get(row.materialId) ?? []).flatMap(({ id, name, oaRef, targetDate }) =>
      openRisk({ quantities, batches, plannedEnd: targetDate === null ? null : localDate(targetDate), weekEnd: period.weekEnd })
        ? [{ id, name, oaRef }] : [],
    );
    return {
      materialLineId: row.materialId, name: fact.componentNameRaw, code: fact.componentCodeRaw, poRef: row.poRef,
      orderedQty: fact.quantity, unit, source: { importBatchId: row.importBatchId, ...fact.source },
      sourceReportedProgress, sourceReportedQty, sourceReportedGap, ...quantities, affectedFinished,
      buyerName: row.buyerName, supplierName: row.supplierName, receiverName: row.receiverName,
      batches: batches.map((batch) => batch.view),
    };
  });
}

export async function hasMeetingMaterial(db: AppDatabase, input: {
  readonly store: ManagementMeetingStore;
  readonly materialLineId: string;
}): Promise<boolean> {
  const rows = await db.execute<{ visible: boolean }>(sql`select exists (select 1 from order_lines where id = ${input.materialLineId} and cancelled_at is null) and ${scopedEdgeExists({
    store: input.store, edgeCondition: sql`material_line_id = ${input.materialLineId}`,
  })} as visible`);
  return rows.rows[0]?.visible === true;
}

function sources(db: AppDatabase, store: ManagementMeetingStore) {
  return db.execute<SourceRow>(sql`
    with ${STORE_EVIDENCE}
    select distinct on (o.material_line_id) o.material_line_id as "materialId", o.import_batch_id as "importBatchId",
      o.fact, po.po_raw as "poRef", buyer.name as "buyerName",
      coalesce(supplier.display_name, po.supplier_raw) as "supplierName", receiver.display_name as "receiverName"
    from scoped_edges edge
    join procurement_finished_lines link on link.material_line_id = edge.material_line_id and link.finished_line_id = edge.finished_id
    join procurement_observations o on (o.import_batch_id, o.sheet_name, o.row_no) = (edge.import_batch_id, edge.sheet_name, edge.row_no)
    join import_batches b on b.id = o.import_batch_id
    join order_lines material on material.id = o.material_line_id
    join purchase_orders po on po.id = material.purchase_order_id
    left join users buyer on buyer.id = material.buyer_user_id
    left join parties supplier on supplier.id = po.supplier_party_id
    left join parties receiver on receiver.id = material.receiver_party_id
    where edge.store = ${store} and material.cancelled_at is null
    order by o.material_line_id, b.committed_at desc nulls last, b.id desc, o.sheet_name, o.row_no
  `);
}

function finished(db: AppDatabase, store: ManagementMeetingStore) {
  const oaRef = currentLineOaReference({ lineId: sql`line.id`, snapshotId: sql`line.current_snapshot_id` });
  return db.execute<FinishedRow>(sql`
    with ${STORE_EVIDENCE}, edges as (
      select distinct link.material_line_id, link.finished_line_id
      from scoped_edges edge
      join procurement_finished_lines link on link.material_line_id = edge.material_line_id and link.finished_line_id = edge.finished_id
      where edge.store = ${store}
    )
    select edges.material_line_id as "materialId", line.id, line.name_raw as name, ${oaRef} as "oaRef",
      dates.target_date::text as "targetDate"
    from edges
    join order_lines line on line.id = edges.finished_line_id and line.cancelled_at is null
    left join lateral (
      select min(coalesce(batch.date_factory_required, batch.date_buyer_confirmed, batch.date_supplier_promised)) as target_date
      from delivery_batches batch
      where batch.order_line_id = line.id and batch.status not in ('closed', 'received', 'cancelled')
    ) dates on true
    where line.stage not in ('done', 'cancelled')
    order by line.name_raw, line.id
  `);
}
