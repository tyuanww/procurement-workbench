import { isNull, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { ProcurementStore } from '@sw/domain';

export type ScopedStore = Exclude<ProcurementStore, 'all'>;

// Stable material links accumulate across imports. Each observation names
// precisely the finished lines that its own worksheet row confirmed.
export const STORE_EVIDENCE = sql`
  observed_edges as (
    select edge.finished_id, o.material_line_id, o.import_batch_id, o.sheet_name, o.row_no,
      case btrim(o.sheet_name)
        when '店铺甲项目进度表' then 'store_a'
        when '店铺乙项目进度表' then 'store_b'
      end as store
    from procurement_observations o
    join import_batches b on b.id = o.import_batch_id and b.status = 'committed' and b.template = 'po-master-v1'
    cross join lateral unnest(o.finished_line_ids) as edge(finished_id)
  ),
  finished_stores as (
    select finished_id, min(store) as store
    from observed_edges
    where store is not null
    group by finished_id
    having count(distinct store) = 1
  ),
  scoped_edges as (
    select edge.finished_id, edge.material_line_id, edge.import_batch_id, edge.sheet_name, edge.row_no,
      coalesce(finished.store, 'unassigned') as store
    from observed_edges edge
    left join finished_stores finished using (finished_id)
    where finished.store is null or edge.store = finished.store
  )
`;

function storeMembers(store: ScopedStore, hasMaterialScope: boolean): SQL {
  const finished = sql`select finished_id from finished_stores where ${store} = 'unassigned' or store = ${store}`;
  const material = hasMaterialScope ? sql`
    union
    select material_line_id from scoped_edges where material_line_id is not null
      and (case when ${store} = 'unassigned' then store <> 'unassigned' else store = ${store} end)
  ` : sql.empty();
  return sql`with ${STORE_EVIDENCE} ${finished} ${material}`;
}

export function storeFilter(input: { readonly store: ProcurementStore | undefined; readonly line: SQLWrapper; readonly hasMaterialScope: boolean }): SQL | undefined {
  const { store, line, hasMaterialScope } = input;
  if (store === undefined || store === 'all') return undefined;
  const members = storeMembers(store, hasMaterialScope);
  if (store !== 'unassigned') return sql`${line} in (${members})`;
  const unassignedMaterial = hasMaterialScope
    ? sql`${line} in (with ${STORE_EVIDENCE} select material_line_id from scoped_edges where store = 'unassigned')`
    : undefined;
  return or(isNull(line), sql`${line} not in (${members})`, unassignedMaterial);
}

export function scopedEdgeExists(input: {
  readonly store: ScopedStore;
  readonly edgeCondition: SQL;
}): SQL {
  return sql`exists (with ${STORE_EVIDENCE} select 1 from scoped_edges where store = ${input.store} and ${input.edgeCondition})`;
}
