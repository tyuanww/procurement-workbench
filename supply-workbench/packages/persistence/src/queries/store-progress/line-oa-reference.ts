import { sql, type SQLWrapper } from 'drizzle-orm';

export function currentLineOaReference({ lineId, snapshotId }: {
  readonly lineId: SQLWrapper;
  readonly snapshotId: SQLWrapper;
}) {
  return sql<string | null>`(
    select source.parsed->'oaDemandRef'->>'raw'
    from order_line_snapshots snapshot
    join import_rows source on source.id = snapshot.import_row_id and source.import_batch_id = snapshot.import_batch_id
    join import_batches batch on batch.id = source.import_batch_id and batch.status = 'committed'
    where snapshot.id = ${snapshotId} and snapshot.order_line_id = ${lineId} and source.target_id = ${lineId}
  )`;
}
