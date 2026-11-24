-- Synthetic scenarios for the action board, daily schedule, and product archive.
-- Apply after the standard user and warehouse seed in an isolated PostgreSQL database.
BEGIN;

CREATE TEMP TABLE preview_orders ON COMMIT DROP AS
SELECT scenario.*, (now() AT TIME ZONE 'Asia/Shanghai')::date AS business_day
FROM (VALUES
  ('chase', 'UI-DEMO-001', '演示净润洁面乳', '2099000000101', '001', 1000, 'awaiting_shipment', 'confirmed', -1),
  ('no-date', 'UI-DEMO-002', '演示清润面霜', '2099000000200', '001', 600, 'awaiting_date', 'awaiting_date', NULL),
  ('pending', 'UI-DEMO-003', '演示净润洁面乳渠道装', '2099000000101-1', '001', 500, 'no_batch', NULL, NULL),
  ('arrival', 'UI-DEMO-004', '演示净润洁面乳', '2099000000101', '001', 800, 'awaiting_receipt', 'shipped', 0),
  ('buyer', 'UI-DEMO-005', '演示净润洁面乳渠道装', '2099000000101-1', '002', 300, 'awaiting_shipment', 'confirmed', 0)
) AS scenario(key, po, product_name, barcode, user_suffix, quantity, stage, batch_status, confirmed_offset);

INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
VALUES ('ui-demo-factory', now(), now(), '演示包装工厂', true, true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, supplier_party_id, lane)
SELECT 'ui-demo-po-' || key, now(), now(), po, po, 'OTHER', ARRAY[]::text[], 'ui-demo-factory', 'finished'
FROM preview_orders
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_lines (id, created_at, updated_at, purchase_order_id, lane, barcode_raw, name_raw, qty_ordered, unit,
  buyer_user_id, receiver_party_id, origin, missing_in_latest_import, latest_import_presence, stage, stage_changed_at)
SELECT 'ui-demo-line-' || key, now(), now(), 'ui-demo-po-' || key, 'finished', barcode, product_name, quantity, '件',
  '0199f0a0-0000-7000-8000-000000000' || user_suffix, '0199f0a0-0000-7000-8000-000000000010',
  'manual', false, 'not_applicable', stage, now()
FROM preview_orders
ON CONFLICT (id) DO NOTHING;

INSERT INTO line_factory_links (id, created_at, updated_at, order_line_id, factory_party_id, status, source, confidence, linked_at)
SELECT 'ui-demo-link-' || key, now(), now(), 'ui-demo-line-' || key, 'ui-demo-factory', 'manual', 'manual', 'manual', now()
FROM preview_orders
ON CONFLICT (id) DO NOTHING;

INSERT INTO delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit,
  receiver_party_id, date_buyer_confirmed, first_confirmed_date, status, status_changed_at, origin)
SELECT 'ui-demo-batch-' || key, now(), now(), 'ui-demo-line-' || key, 1, quantity, '件',
  '0199f0a0-0000-7000-8000-000000000010', business_day + confirmed_offset, business_day + confirmed_offset, batch_status, now(), 'manual'
FROM preview_orders WHERE batch_status IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO shipments (id, created_at, updated_at, batch_id, qty, shipped_on, source, note, created_by, fulfillment)
SELECT 'ui-demo-shipment', now(), now(), 'ui-demo-batch-arrival', quantity, business_day, 'manual',
  '合成发货凭据', '0199f0a0-0000-7000-8000-000000000001',
  '{"kind":"verified","unit":"件","evidence":"合成发货凭据","reviewReason":null}'
FROM preview_orders WHERE key = 'arrival'
ON CONFLICT (id) DO NOTHING;

INSERT INTO work_items (id, created_at, updated_at, subject_type, subject_id, kind, title, owner_user_id,
  counterparty_party_id, counterparty_role, planned_start, planned_end, status, priority, source)
SELECT 'ui-demo-task-' || entry.key, now(), now(), 'order_line', 'ui-demo-line-chase', 'task', entry.title,
  '0199f0a0-0000-7000-8000-000000000001', 'ui-demo-factory', 'supplier',
  dates.business_day + entry.day_offset, dates.business_day + entry.day_offset, entry.status, entry.priority, 'manual'
FROM (SELECT business_day FROM preview_orders WHERE key = 'chase') AS dates
CROSS JOIN (VALUES
  ('today', '演示排期 · 确认今日出货', 0, 'in_progress', 'high'),
  ('blocked', '演示排期 · 核实逾期包材', -1, 'blocked', 'urgent'),
  ('future', '演示排期 · 明日复核', 1, 'planned', 'normal'),
  ('done', '演示排期 · 已完成确认', 0, 'done', 'normal')
) AS entry(key, title, day_offset, status, priority)
ON CONFLICT (id) DO NOTHING;

INSERT INTO work_item_dependencies (id, from_item_id, to_item_id, kind, created_at)
VALUES ('ui-demo-task-dependency', 'ui-demo-task-blocked', 'ui-demo-task-today', 'finish_to_start', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, created_at, updated_at, barcode_raw, barcode_base, filing_name, filing_no, sku_name,
  net_content, case_pack, product_line, field_sources)
VALUES
  ('ui-demo-cleanser', now(), now(), '2099000000101', '2099000000101', '演示净润洁面乳', 'DEMO-001',
    '演示净润洁面乳', '100 mL', '24 件/箱', '演示洁面线', '{"skuName":"workbench"}'),
  ('ui-demo-cleanser-channel', now(), now(), '2099000000101-1', '2099000000101', '演示净润洁面乳', 'DEMO-001',
    '演示净润洁面乳渠道装', '100 mL', '12 件/箱', '演示洁面线', '{"skuName":"workbench"}'),
  ('ui-demo-cream', now(), now(), '2099000000200', '2099000000200', NULL, NULL,
    '演示清润面霜', '50 g', NULL, '演示护肤线', '{"skuName":"workbench"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_contacts (product_id, role, user_id, note, source, updated_by, updated_at)
SELECT 'ui-demo-cleanser', 'purchasing', '0199f0a0-0000-7000-8000-000000000002', '演示采购联系人',
  'workbench', '0199f0a0-0000-7000-8000-000000000001', now()
WHERE NOT EXISTS (SELECT 1 FROM product_contacts WHERE product_id = 'ui-demo-cleanser' AND role = 'purchasing');

INSERT INTO bom_lines (product_barcode_raw, product_name, part_code_raw, part_name, import_batch_id, row_no, merged_fill)
SELECT '2099000000101', '演示净润洁面乳', part.code, part.name, 'ui-demo-bom', part.row_no, false
FROM (VALUES ('UI-DEMO-TUBE', '演示洁面管', 1), ('UI-DEMO-CAP', '演示旋盖', 2)) AS part(code, name, row_no)
WHERE NOT EXISTS (SELECT 1 FROM bom_lines WHERE import_batch_id = 'ui-demo-bom' AND row_no = part.row_no);

INSERT INTO item_codes (id, created_at, updated_at, code_type, code_raw, code_norm, status)
VALUES
  ('ui-demo-barcode', now(), now(), 'barcode_69', '2099000000101', '2099000000101', 'active'),
  ('ui-demo-stock-code', now(), now(), 'other', 'UI-DEMO-STOCK', 'UI-DEMO-STOCK', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO code_links (id, created_at, updated_at, from_code_id, to_code_id, status, reviewed_by, reviewed_at)
VALUES ('ui-demo-stock-link', now(), now(), 'ui-demo-barcode', 'ui-demo-stock-code', 'approved',
  '0199f0a0-0000-7000-8000-000000000001', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO import_batches (id, created_at, updated_at, file_id, template, factory_party_id, status, source_key,
  file_meta, stats, decisions, created_by, committed_by, committed_at)
VALUES ('ui-demo-stock-batch', now(), now(), 'ui-demo-stock-file', 'factory-progress-v1', 'ui-demo-factory', 'committed',
  'ui-demo-factory-stock', '{"sheets":[{"name":"演示库存","hidden":false}],"coreXmlModifiedAt":null,"bytes":0,"pendingLinks":0}',
  '{"rows":1,"byAction":{},"byIssue":{},"pendingAliases":0,"pendingCodes":0,"pendingLinks":0}',
  '{"issueDecisions":{},"rowSkips":[],"conflictResolutions":[]}',
  '0199f0a0-0000-7000-8000-000000000001', '0199f0a0-0000-7000-8000-000000000001', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO factory_stock_rows (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint,
  linked_order_line_id, link_status, created_at, updated_at, item_code_raw, item_code_norm, name_raw, lot_raw, qty_on_hand)
VALUES ('ui-demo-stock-row', 'ui-demo-stock-batch', 'ui-demo-factory', '演示库存', 2, '{}', 'ui-demo-stock-fingerprint',
  'ui-demo-line-chase', 'manual', now(), now(), 'UI-DEMO-STOCK', 'UI-DEMO-STOCK', '演示净润洁面乳', 'UI-DEMO-LOT', 320)
ON CONFLICT (id) DO NOTHING;

INSERT INTO import_rows (id, import_batch_id, sheet_name, row_no, raw, parsed, issues, action, target_id)
VALUES ('ui-demo-stock-import-row', 'ui-demo-stock-batch', '演示库存', 2,
  '{"itemCodeRaw":"UI-DEMO-STOCK","qtyOnHand":320}', '{}', '[]', 'create', 'ui-demo-stock-row')
ON CONFLICT (id) DO NOTHING;

COMMIT;
