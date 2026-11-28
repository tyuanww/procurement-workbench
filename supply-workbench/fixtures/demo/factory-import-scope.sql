-- Synthetic committed factory import scopes for the isolated browser acceptance.
BEGIN;

INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
VALUES ('scope-factory-a', now(), now(), '合成导入甲厂', false, true, false),
       ('scope-factory-b', now(), now(), '合成导入乙厂', false, true, false);

CREATE TEMP TABLE factory_scope_orders ON COMMIT DROP AS
SELECT * FROM (VALUES ('manual', 'FS-MANUAL'), ('matched', 'FS-MATCHED'), ('yiling', 'FS-YILING'),
  ('ambiguous', 'FS-AMBIGUOUS'), ('other-batch', 'FS-OTHER-BATCH'), ('other-factory', 'FS-OTHER-FACTORY')
) AS orders(key, po);

INSERT INTO purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, lane)
SELECT 'scope-po-' || key, now(), now(), po, po, 'OTHER', ARRAY[]::text[], 'finished' FROM factory_scope_orders;

INSERT INTO order_lines (id, created_at, updated_at, purchase_order_id, lane, name_raw, qty_ordered, unit,
  origin, missing_in_latest_import, latest_import_presence, stage, stage_changed_at)
SELECT 'scope-line-' || key, now(), now(), 'scope-po-' || key, 'finished', '合成范围订单 ' || po, 10, '件',
  'manual', false, 'not_applicable', 'no_batch', now() FROM factory_scope_orders;

INSERT INTO import_batches (id, created_at, updated_at, file_id, template, factory_party_id, status, source_key,
  superseded_at, file_meta, stats, decisions, created_by, committed_by, committed_at)
SELECT 'scope-import-' || sample.key, now(), now(), 'scope-file-' || sample.key, sample.template, sample.factory, 'committed',
  sample.source_key, CASE WHEN sample.key = 'current' THEN now() END, '{"bytes":0,"pendingLinks":0}', '{}',
  '{"issueDecisions":{},"rowSkips":[],"conflictResolutions":[]}',
  '0199f0a0-0000-7000-8000-000000000001', '0199f0a0-0000-7000-8000-000000000001', now()
FROM (VALUES
  ('current', 'factory-progress-v1', 'scope-factory-a', 'scope-a'),
  ('other-batch', 'factory-progress-v1', 'scope-factory-a', 'scope-a'),
  ('other-factory', 'factory-progress-v1', 'scope-factory-b', 'scope-b'),
  ('empty', 'factory-progress-v1', 'scope-factory-b', 'scope-b-empty'),
  ('store-evidence', 'po-master-v1', NULL, NULL)
) AS sample(key, template, factory, source_key);

INSERT INTO procurement_observations (import_batch_id, sheet_name, row_no, finished_line_ids, reasons, fact)
VALUES ('scope-import-store-evidence', '达肤妍项目进度表', 2, ARRAY['scope-line-manual', 'scope-line-matched'], ARRAY[]::text[], '{}'),
       ('scope-import-store-evidence', '译龄项目进度表', 2, ARRAY['scope-line-yiling'], ARRAY[]::text[], '{}');

INSERT INTO factory_stock_rows (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint,
  linked_order_line_id, link_status, created_at, updated_at)
SELECT 'scope-stock-' || report.key, 'scope-import-' || report.batch, report.factory, '库存数量汇总', report.row_no,
  '{}', 'scope-stock-' || report.key, 'scope-line-' || report.line, report.link_status, now(), now()
FROM (VALUES
  ('manual', 'current', 'scope-factory-a', 2, 'manual', 'manual'),
  ('duplicate', 'current', 'scope-factory-a', 3, 'matched', 'linked'),
  ('yiling', 'current', 'scope-factory-a', 4, 'yiling', 'linked'),
  ('ambiguous', 'current', 'scope-factory-a', 5, 'ambiguous', 'ambiguous'),
  ('mismatched-party', 'current', 'scope-factory-b', 6, 'other-factory', 'linked'),
  ('other-batch', 'other-batch', 'scope-factory-a', 2, 'other-batch', 'linked'),
  ('other-factory', 'other-factory', 'scope-factory-b', 2, 'other-factory', 'manual'),
  ('unlinked', 'empty', 'scope-factory-b', 2, NULL, 'unlinked')
) AS report(key, batch, factory, row_no, line, link_status);

INSERT INTO factory_in_transit_rows (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint,
  linked_order_line_id, link_status, created_at, updated_at)
VALUES ('scope-transit-matched', 'scope-import-current', 'scope-factory-a', '在途订单汇总', 2, '{}', 'scope-transit-matched',
  'scope-line-matched', 'linked', now(), now());

INSERT INTO import_rows (id, import_batch_id, sheet_name, row_no, raw, parsed, issues, action, target_id)
SELECT id || ':source', import_batch_id, sheet_name, row_no, raw, '{}'::jsonb, '[]'::jsonb, 'create', id
FROM factory_stock_rows WHERE id LIKE 'scope-stock-%'
UNION ALL
SELECT id || ':source', import_batch_id, sheet_name, row_no, raw, '{}', '[]', 'create', id
FROM factory_in_transit_rows WHERE id = 'scope-transit-matched';

COMMIT;
