ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS coverage text NOT NULL DEFAULT 'full_snapshot';
