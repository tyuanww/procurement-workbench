ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS latest_import_presence text NOT NULL DEFAULT 'not_applicable';
--> statement-breakpoint
UPDATE order_lines
SET latest_import_presence = CASE
  WHEN origin = 'import_po_master' AND missing_in_latest_import THEN 'missing'
  WHEN origin = 'import_po_master' THEN 'present'
  ELSE 'not_applicable'
END
WHERE latest_import_presence = 'not_applicable';
