import { sql, type SQL } from 'drizzle-orm';
import { reportedProcurementGap, type StoreProgressLine, type StoreProgressMaterial } from '@sw/application';
import type { ProcurementFact } from '../../../../application/src/ports/procurement-preview.js';
import type { AppDatabase } from '../../client.js';
import { isOriginalImportBatch } from '../imports/applied-source.js';
import { STORE_EVIDENCE } from './scope.js';

type Store = StoreProgressLine['store'];
type Source = StoreProgressLine['sources'][number];
type FinishedRow = ({ [K in keyof Source]: Source[K] | null }) & { finishedId: string; store: Store };
type MaterialRow = {
  finishedId: string;
  id: string;
  poRaw: string | null;
  importBatchId: string;
  fact: ProcurementFact;
};

export async function storeProgressOf(db: AppDatabase, finishedIds: readonly string[]): Promise<ReadonlyMap<string, StoreProgressLine>> {
  if (finishedIds.length === 0) return new Map();
  const ids = sql.join(finishedIds.map((id) => sql`${id}`), sql`, `);
  const [sources, materials] = await Promise.all([finishedRows(db, ids), materialRows(db, ids)]);
  const byLine = new Map<string, { store: Store; sources: Source[]; materials: StoreProgressMaterial[] }>();
  for (const { finishedId, store, ...source } of sources.rows) {
    const row = byLine.get(finishedId) ?? { store, sources: [], materials: [] };
    const { importBatchId, sheetName, rowNo, oaRaw } = source;
    if (importBatchId !== null && sheetName !== null && rowNo !== null) row.sources.push({ importBatchId, sheetName, rowNo, oaRaw });
    byLine.set(finishedId, row);
  }
  for (const material of materials.rows) byLine.get(material.finishedId)?.materials.push(toMaterial(material));
  return byLine;
}

function finishedRows(db: AppDatabase, ids: SQL) {
  return db.execute<FinishedRow>(sql`
      with ${STORE_EVIDENCE},
      latest_rows as (
        select r.target_id, r.import_batch_id, r.sheet_name, r.row_no,
          r.parsed->'oaDemandRef'->>'raw' as oa_raw,
          dense_rank() over (partition by r.target_id order by b.committed_at desc nulls last, b.id desc) as revision
        from import_rows r
        join import_batches b on b.id = r.import_batch_id and b.status = 'committed' and b.template = 'po-master-v1'
        where r.target_id in (${ids}) and r.action not in ('skip', 'conflict')
          and ${isOriginalImportBatch({ id: sql`b.id`, fileId: sql`b.file_id`, template: sql`b.template` })}
      )
      select ol.id as "finishedId", coalesce(fs.store, 'unassigned') as store,
        r.import_batch_id as "importBatchId", r.sheet_name as "sheetName", r.row_no as "rowNo", r.oa_raw as "oaRaw"
      from order_lines ol
      left join finished_stores fs on fs.finished_id = ol.id
      left join latest_rows r on r.target_id = ol.id and r.revision = 1
      where ol.id in (${ids})
      order by ol.id, r.sheet_name, r.row_no
    `);
}

function materialRows(db: AppDatabase, ids: SQL) {
  return db.execute<MaterialRow>(sql`
      with ${STORE_EVIDENCE}
      select distinct on (link.finished_line_id, o.material_line_id)
        link.finished_line_id as "finishedId", o.material_line_id as id, po.po_raw as "poRaw",
        o.import_batch_id as "importBatchId", o.fact
      from procurement_finished_lines link
      join scoped_edges edge on edge.material_line_id = link.material_line_id and edge.finished_id = link.finished_line_id
      join procurement_observations o on o.import_batch_id = edge.import_batch_id and o.sheet_name = edge.sheet_name and o.row_no = edge.row_no
      join import_batches b on b.id = o.import_batch_id and b.status = 'committed' and b.template = 'po-master-v1'
      join order_lines material on material.id = o.material_line_id
      join purchase_orders po on po.id = material.purchase_order_id
      where link.finished_line_id in (${ids})
      order by link.finished_line_id, o.material_line_id, b.committed_at desc nulls last, b.id desc, o.sheet_name, o.row_no
    `);
}

function toMaterial({ id, poRaw, importBatchId, fact }: MaterialRow): StoreProgressMaterial {
  const counts = { quantity: fact.quantity, unit: fact.unitRaw, deliveryProgressRaw: fact.deliveryProgressRaw ?? null };
  const isCompleted = fact.status === 'completed';
  return {
    id, nameRaw: fact.componentNameRaw, codeRaw: fact.componentCodeRaw, poRaw, completed: isCompleted, ...counts,
    source: { importBatchId, ...fact.source },
    reportedGap: isCompleted ? null : reportedProcurementGap(counts),
  };
}
