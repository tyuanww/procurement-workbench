WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY factory_party_id
      ORDER BY coalesce(committed_at, created_at) DESC, id DESC
    ) AS position
  FROM import_batches
  WHERE template = 'factory-progress-v1'
    AND factory_party_id IS NOT NULL
    AND status = 'committed'
)
UPDATE import_batches AS batch
SET source_key = 'factory-progress-v1:' || batch.factory_party_id,
    source_fingerprint = coalesce(batch.source_fingerprint, batch.file_id),
    effective_at = coalesce(batch.effective_at, batch.committed_at, batch.created_at),
    superseded_at = CASE
      WHEN ranked.position = 1 THEN NULL
      ELSE coalesce(batch.superseded_at, batch.committed_at, batch.created_at)
    END
FROM ranked
WHERE ranked.id = batch.id;
--> statement-breakpoint
DROP INDEX IF EXISTS import_batches_active_source_uq;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_active_source_uq
  ON import_batches (source_key)
  WHERE status = 'committed'
    AND source_key IS NOT NULL
    AND superseded_at IS NULL;
