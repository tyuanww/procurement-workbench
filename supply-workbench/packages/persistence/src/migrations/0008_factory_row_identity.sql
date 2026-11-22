-- Older imports were allowed to write the same physical row more than once.
-- Keep the most recently linked/updated copy before enforcing row identity.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY import_batch_id, fingerprint, sheet_name, row_no
      ORDER BY (linked_order_line_id IS NOT NULL) DESC, updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM factory_in_transit_rows
)
DELETE FROM factory_in_transit_rows AS duplicate
USING ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS factory_in_transit_row_identity_uq
  ON factory_in_transit_rows (import_batch_id, fingerprint, sheet_name, row_no);
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY import_batch_id, fingerprint, sheet_name, row_no
      ORDER BY (linked_order_line_id IS NOT NULL) DESC, updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM factory_shipment_rows
)
DELETE FROM factory_shipment_rows AS duplicate
USING ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS factory_shipment_row_identity_uq
  ON factory_shipment_rows (import_batch_id, fingerprint, sheet_name, row_no);
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY import_batch_id, fingerprint, sheet_name, row_no
      ORDER BY (linked_order_line_id IS NOT NULL) DESC, updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM factory_stock_rows
)
DELETE FROM factory_stock_rows AS duplicate
USING ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS factory_stock_row_identity_uq
  ON factory_stock_rows (import_batch_id, fingerprint, sheet_name, row_no);
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY import_batch_id, fingerprint, sheet_name, row_no
      ORDER BY (linked_order_line_id IS NOT NULL) DESC, updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM factory_schedule_cells
)
DELETE FROM factory_schedule_cells AS duplicate
USING ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS factory_schedule_row_identity_uq
  ON factory_schedule_cells (import_batch_id, fingerprint, sheet_name, row_no);
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY import_batch_id, fingerprint, sheet_name, row_no
      ORDER BY (linked_order_line_id IS NOT NULL) DESC, updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM factory_material_demand_rows
)
DELETE FROM factory_material_demand_rows AS duplicate
USING ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS factory_demand_row_identity_uq
  ON factory_material_demand_rows (import_batch_id, fingerprint, sheet_name, row_no);
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY import_batch_id, fingerprint, sheet_name, row_no
      ORDER BY (linked_order_line_id IS NOT NULL) DESC, updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM factory_packaging_combo_rows
)
DELETE FROM factory_packaging_combo_rows AS duplicate
USING ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS factory_packaging_row_identity_uq
  ON factory_packaging_combo_rows (import_batch_id, fingerprint, sheet_name, row_no);
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY import_batch_id, fingerprint, sheet_name, row_no
      ORDER BY (linked_order_line_id IS NOT NULL) DESC, updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM customer_supplied_receipt_rows
)
DELETE FROM customer_supplied_receipt_rows AS duplicate
USING ranked
WHERE duplicate.id = ranked.id
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS customer_supplied_row_identity_uq
  ON customer_supplied_receipt_rows (import_batch_id, fingerprint, sheet_name, row_no);
