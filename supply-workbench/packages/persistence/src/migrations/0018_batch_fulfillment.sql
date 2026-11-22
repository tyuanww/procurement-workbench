ALTER TABLE delivery_batches ADD COLUMN planned_unit text;

UPDATE delivery_batches AS batch
SET planned_unit = NULLIF(btrim(line.unit), '')
FROM order_lines AS line
WHERE batch.order_line_id = line.id;

ALTER TABLE shipments ADD COLUMN fulfillment jsonb;
ALTER TABLE receipts ADD COLUMN fulfillment jsonb;
