ALTER TABLE import_batches
  DROP CONSTRAINT IF EXISTS import_batches_coverage_check;
--> statement-breakpoint
ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_coverage_check
  CHECK (coverage IN ('full_snapshot', 'partial'));
--> statement-breakpoint
ALTER TABLE order_lines
  DROP CONSTRAINT IF EXISTS order_lines_latest_import_presence_check;
--> statement-breakpoint
ALTER TABLE order_lines
  ADD CONSTRAINT order_lines_latest_import_presence_check
  CHECK (latest_import_presence IN ('present', 'missing', 'unknown', 'not_applicable'));
