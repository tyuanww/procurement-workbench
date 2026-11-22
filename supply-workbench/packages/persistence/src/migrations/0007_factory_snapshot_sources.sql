ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS source_key text;
--> statement-breakpoint
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS source_fingerprint text;
--> statement-breakpoint
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS effective_at timestamptz;
--> statement-breakpoint
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS import_batches_source_key_idx
  ON import_batches (source_key);
--> statement-breakpoint
DROP INDEX IF EXISTS import_batches_committed_source_fingerprint_uq;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_active_source_uq
  ON import_batches (source_key)
  WHERE status = 'committed'
    AND source_key IS NOT NULL
    AND superseded_at IS NULL;
