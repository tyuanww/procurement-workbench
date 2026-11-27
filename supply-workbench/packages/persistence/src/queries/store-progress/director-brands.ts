import { sql } from 'drizzle-orm';
import { OBSERVED_EDGES } from './scope.js';
import type { AppDatabase } from '../../client.js';

export async function directorBrands(db: AppDatabase) {
  const result = await db.execute<{ lineId: string; brand: string | null }>(sql`
    with ${OBSERVED_EDGES}, finished as (
      select finished_id, case when count(distinct brand) = 1 then min(brand) end as brand
      from observed_edges group by finished_id
    )
    select finished_id as "lineId", brand from finished
    union
    select e.material_line_id as "lineId", f.brand from observed_edges e join finished f using (finished_id)
    where e.material_line_id is not null and (f.brand is null or e.brand = f.brand)
  `);
  return result.rows;
}
