import { sql, type SQL } from 'drizzle-orm';
import { orderLines } from '../../schema/orders.js';
import { factoryReportTables } from '../factory-links/report-tables.js';

export function importedOrderLines(importBatchId: string): SQL {
  return sql`${orderLines.id} in (
    with source as (
      select id, template, status, factory_party_id from import_batches where id = ${importBatchId}
    ), factory_source as (
      select id, factory_party_id from source where template = 'factory-progress-v1' and status = 'committed'
    )
    select orders.order_line_id from (${procurementOrderIds(importBatchId)}) orders
    where not exists (select 1 from source where template = 'factory-progress-v1')
    union all
    ${factoryOrderIds()}
  )`;
}

function procurementOrderIds(importBatchId: string): SQL {
  return sql`
    select s.order_line_id from order_line_snapshots s where s.import_batch_id = ${importBatchId}
    union all
    select r.target_id from import_rows r
    inner join source b on b.id = r.import_batch_id
    where b.template = 'po-master-v1' and b.status = 'committed'
      and r.target_id is not null and r.action <> 'skip'
    union all
    select o.material_line_id from procurement_observations o
    where o.import_batch_id = ${importBatchId} and o.material_line_id is not null
  `;
}

function factoryOrderIds(): SQL {
  const reports = Object.values(factoryReportTables).map((table) => sql`
    select ${table.linkedOrderLineId} from ${table}
    inner join factory_source on factory_source.id = ${table.importBatchId}
      and factory_source.factory_party_id = ${table.factoryPartyId}
    where ${table.linkStatus} in ('linked', 'manual') and ${table.linkedOrderLineId} is not null
  `);
  return sql.join(reports, sql` union all `);
}
