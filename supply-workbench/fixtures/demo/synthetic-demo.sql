-- Synthetic demo dataset for supply-workbench. Run inside a transaction.
-- It keeps the 606 order lines and replaces only demo-scoped overlays.

BEGIN;

DELETE FROM work_item_events WHERE work_item_id LIKE 'demo-%';
DELETE FROM work_items WHERE id LIKE 'demo-%';
DELETE FROM owner_assignments;
DELETE FROM line_factory_links;
DELETE FROM exceptions WHERE id LIKE 'demo-%';
DELETE FROM follow_ups WHERE id LIKE 'demo-%';
DELETE FROM parties WHERE id LIKE 'demo-%';

WITH aliases AS (
  SELECT raw_name, row_number() OVER (ORDER BY raw_name) AS rn
  FROM party_aliases
  WHERE raw_name <> '宜侬'
)
INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse, note)
SELECT 'demo-sup-' || lpad(rn::text, 2, '0'), now(), now(), raw_name, true, false, false, 'demo supplier'
FROM aliases;

UPDATE party_aliases AS pa
SET party_id = p.id,
    status = 'approved',
    reviewed_by = '0199f0a0-0000-7000-8000-000000000001',
    reviewed_at = now(),
    updated_at = now()
FROM parties AS p
WHERE p.id LIKE 'demo-sup-%' AND p.display_name = pa.raw_name;

INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse, note)
VALUES
  ('demo-fac-01', now(), now(), '苏州代工厂', true, true, false, 'demo factory'),
  ('demo-fac-02', now(), now(), '广州代工厂', true, true, false, 'demo factory')
ON CONFLICT (id) DO NOTHING;

UPDATE purchase_orders AS po
SET supplier_party_id = pa.party_id
FROM party_aliases AS pa
WHERE pa.raw_name = po.supplier_raw AND pa.party_id IS NOT NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM order_lines
)
UPDATE order_lines AS l
SET buyer_user_id = CASE r.rn % 3
      WHEN 0 THEN '0199f0a0-0000-7000-8000-000000000001'
      WHEN 1 THEN '0199f0a0-0000-7000-8000-000000000002'
      ELSE '0199f0a0-0000-7000-8000-000000000003'
    END,
    stage = CASE
      WHEN r.rn <= 90 THEN 'no_batch'
      WHEN r.rn <= 190 THEN 'awaiting_date'
      WHEN r.rn <= 360 THEN 'awaiting_shipment'
      WHEN r.rn <= 430 THEN 'awaiting_receipt'
      WHEN r.rn <= 520 THEN 'partially_received'
      ELSE 'done'
    END,
    stage_changed_at = now() - ((r.rn % 18)::text || ' days')::interval,
    next_due_date = CASE WHEN r.rn > 520 THEN NULL ELSE current_date + (((r.rn % 25) - 5)::int) END
FROM ranked AS r
WHERE l.id = r.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM order_lines
)
INSERT INTO owner_assignments (id, created_at, updated_at, subject_type, subject_id, owner_user_id, owner_name_raw, status, source, source_ref, effective_at, superseded_at)
SELECT 'demo-owner-' || lpad(r.rn::text, 3, '0'), now(), now(), 'order_line', r.id,
  CASE r.rn % 3
    WHEN 0 THEN '0199f0a0-0000-7000-8000-000000000001'
    WHEN 1 THEN '0199f0a0-0000-7000-8000-000000000002'
    ELSE '0199f0a0-0000-7000-8000-000000000003'
  END,
  CASE r.rn % 3 WHEN 0 THEN '管理员' WHEN 1 THEN '采购甲' ELSE '采购乙' END,
  'assigned', 'manual', NULL, now(), NULL
FROM ranked AS r;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM order_lines
  LIMIT 500
)
INSERT INTO line_factory_links (id, created_at, updated_at, order_line_id, factory_party_id, status, source, confidence, po_raw, item_code_raw, barcode_raw, reason, linked_at)
SELECT 'demo-lfl-' || lpad(r.rn::text, 3, '0'), now(), now(), r.id,
  CASE r.rn % 3
    WHEN 0 THEN '01a1321b-5b98-7523-9f80-0b1f92f9520f'
    WHEN 1 THEN 'demo-fac-01'
    ELSE 'demo-fac-02'
  END,
  'linked', 'manual', 'manual', NULL, NULL, NULL, NULL, now()
FROM ranked AS r;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM delivery_batches
)
UPDATE delivery_batches AS b
SET status = CASE r.rn % 5
      WHEN 0 THEN 'awaiting_date'
      WHEN 1 THEN 'confirmed'
      WHEN 2 THEN 'shipped'
      WHEN 3 THEN 'partially_received'
      ELSE 'received'
    END,
    date_buyer_confirmed = current_date + (((r.rn % 20) - 4)::int),
    date_factory_required = current_date + (((r.rn % 20) - 2)::int),
    date_supplier_promised = current_date + (((r.rn % 20) + 1)::int),
    status_changed_at = now() - ((r.rn % 14)::text || ' days')::interval
FROM ranked AS r
WHERE b.id = r.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM order_lines
  LIMIT 40
), suppliers AS (
  SELECT ol.id AS line_id, po.supplier_party_id
  FROM order_lines ol JOIN purchase_orders po ON po.id = ol.purchase_order_id
)
INSERT INTO work_items (id, created_at, updated_at, subject_type, subject_id, kind, title, owner_user_id, counterparty_party_id, counterparty_role, planned_start, planned_end, status, priority, source, parent_id, version)
SELECT 'demo-wi-' || lpad(r.rn::text, 2, '0'), now(), now(), 'order_line', r.id,
  CASE WHEN r.rn % 4 = 0 THEN 'milestone' ELSE 'task' END,
  CASE r.rn % 6
    WHEN 0 THEN '确认供应商包装稿'
    WHEN 1 THEN '催供应商回传送货单'
    WHEN 2 THEN '确认工厂排产日期'
    WHEN 3 THEN '处理到货异常'
    WHEN 4 THEN '核对待收数量'
    ELSE '补录确认到货日'
  END,
  CASE r.rn % 3
    WHEN 0 THEN '0199f0a0-0000-7000-8000-000000000001'
    WHEN 1 THEN '0199f0a0-0000-7000-8000-000000000002'
    ELSE '0199f0a0-0000-7000-8000-000000000003'
  END,
  CASE WHEN r.rn % 4 = 0 THEN CASE WHEN r.rn % 8 = 0 THEN 'demo-fac-01' ELSE 'demo-fac-02' END ELSE s.supplier_party_id END,
  CASE WHEN r.rn % 4 = 0 THEN 'factory' ELSE 'supplier' END,
  current_date + (((r.rn % 7) - 5)::int),
  current_date + (((r.rn % 7) - 5)::int) + (((r.rn % 5) + 1)::int),
  CASE r.rn % 5 WHEN 0 THEN 'planned' WHEN 1 THEN 'in_progress' WHEN 2 THEN 'blocked' WHEN 3 THEN 'done' ELSE 'planned' END,
  CASE r.rn % 4 WHEN 0 THEN 'high' WHEN 1 THEN 'normal' WHEN 2 THEN 'urgent' ELSE 'normal' END,
  'manual', NULL, 0
FROM ranked AS r
LEFT JOIN suppliers AS s ON s.line_id = r.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM order_lines
  LIMIT 12
)
INSERT INTO exceptions (id, created_at, updated_at, order_line_id, batch_id, type, note, status, opened_by, closed_by, closed_at, close_note)
SELECT 'demo-ex-' || lpad(r.rn::text, 2, '0'), now(), now(), r.id, NULL, 'delay', 'demo open exception', 'open',
  '0199f0a0-0000-7000-8000-000000000001', NULL, NULL, NULL
FROM ranked AS r;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM order_lines
  LIMIT 20
)
INSERT INTO follow_ups (id, created_at, updated_at, order_line_id, batch_id, kind, text, party_id, created_by)
SELECT 'demo-fu-' || lpad(r.rn::text, 2, '0'), now(), now(), r.id, NULL, 'call', 'demo follow-up recorded', NULL,
  '0199f0a0-0000-7000-8000-000000000001'
FROM ranked AS r;

COMMIT;
