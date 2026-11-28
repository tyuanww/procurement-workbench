BEGIN;

CREATE TEMP TABLE large_risk_group ON COMMIT DROP AS
SELECT n, 'procurement-component:synthetic-follow-up-large-risk-material:' || lpad(n::text, 4, '0') ||
  CASE WHEN n % 3 = 0 THEN repeat('料', 40) ELSE '' END AS line_id,
  'SYN-RISK-' || lpad(n::text, 4, '0') AS po,
  (now() AT TIME ZONE 'Asia/Shanghai')::date - 2 AS confirmed
FROM generate_series(1, 300) n;

CREATE TEMP TABLE source_risk_group ON COMMIT DROP AS
SELECT observation.import_batch_id, observation.sheet_name, observation.finished_line_ids[1] AS parent_id, observation.fact
FROM procurement_observations observation JOIN import_batches batch ON batch.id = observation.import_batch_id
WHERE batch.template = 'po-master-v1' AND batch.status = 'committed'
  AND observation.sheet_name = '达肤妍项目进度表' AND observation.finished_line_ids[1] IS NOT NULL
ORDER BY observation.row_no LIMIT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM source_risk_group) THEN RAISE EXCEPTION '缺少先前验收导入的合成达肤妍采购表'; END IF;
END $$;

INSERT INTO purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, lane)
SELECT line_id, now(), now(), po, po, 'OTHER', ARRAY[]::text[], 'material' FROM large_risk_group;

INSERT INTO order_lines (id, created_at, updated_at, purchase_order_id, lane, name_raw, qty_ordered, unit,
  buyer_user_id, receiver_party_id, origin, missing_in_latest_import, latest_import_presence, stage, stage_changed_at, next_due_batch_id, next_due_date)
SELECT line_id, now(), now(), line_id, 'material', '合成大组交期 ' || n, 100, '件',
  '0199f0a0-0000-7000-8000-000000000002', '0199f0a0-0000-7000-8000-000000000010', 'manual', false,
  'not_applicable', 'awaiting_shipment', now(), line_id || ':batch', confirmed FROM large_risk_group;

INSERT INTO delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit, receiver_party_id,
  date_buyer_confirmed, first_confirmed_date, status, status_changed_at, origin)
SELECT line_id || ':batch', now(), now(), line_id, 1, 100, '件', '0199f0a0-0000-7000-8000-000000000010', confirmed, confirmed,
  'confirmed', now(), 'manual' FROM large_risk_group;

INSERT INTO procurement_finished_lines (material_line_id, finished_line_id)
SELECT line_id, parent_id FROM large_risk_group CROSS JOIN source_risk_group;

INSERT INTO procurement_observations (import_batch_id, sheet_name, row_no, finished_line_ids, material_line_id, reasons, fact)
SELECT import_batch_id, sheet_name, 100000 + n, ARRAY[parent_id], line_id, ARRAY[]::text[],
  jsonb_set(fact, '{source,rowNo}', to_jsonb(100000 + n)) FROM large_risk_group CROSS JOIN source_risk_group;

COMMIT;
