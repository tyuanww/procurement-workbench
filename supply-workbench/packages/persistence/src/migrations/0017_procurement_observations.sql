CREATE TABLE procurement_import_files (
  file_id text PRIMARY KEY,
  import_batch_id text NOT NULL REFERENCES import_batches(id)
);
--> statement-breakpoint
CREATE TABLE procurement_observations (
  import_batch_id text NOT NULL REFERENCES import_batches(id),
  sheet_name text NOT NULL,
  row_no integer NOT NULL,
  identity_key text,
  finished_line_ids text[] NOT NULL,
  material_line_id text REFERENCES order_lines(id),
  reasons text[] NOT NULL,
  fact jsonb NOT NULL,
  PRIMARY KEY (import_batch_id, sheet_name, row_no)
);
--> statement-breakpoint
CREATE INDEX procurement_observations_line_idx ON procurement_observations (material_line_id);
--> statement-breakpoint
CREATE TABLE procurement_finished_lines (
  material_line_id text NOT NULL REFERENCES order_lines(id),
  finished_line_id text NOT NULL REFERENCES order_lines(id),
  PRIMARY KEY (material_line_id, finished_line_id)
);
--> statement-breakpoint
CREATE INDEX procurement_finished_lines_finished_idx ON procurement_finished_lines (finished_line_id);
