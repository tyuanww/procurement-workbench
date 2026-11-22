-- 旧核实记录曾把占位凭据或单位计入履约。凭据原文保留，仅修正依赖它们的批次和订单行。
WITH active_records (batch_id, qty, fulfillment, is_receipt) AS (
  SELECT batch_id, qty, fulfillment, true FROM receipts WHERE voided_at IS NULL
  UNION ALL
  SELECT batch_id, qty, fulfillment, false FROM shipments WHERE voided_at IS NULL
),
prior_admission AS (
  SELECT *,
    fulfillment IS NULL OR fulfillment = 'null'::jsonb AS is_legacy,
    (fulfillment ->> 'kind' IS DISTINCT FROM 'reported' AND fulfillment -> 'reviewReason' = 'null'::jsonb) IS TRUE AS was_verified
  FROM active_records
),
checked AS (
  SELECT *, was_verified AND EXISTS (
    SELECT 1 FROM (VALUES (fulfillment ->> 'unit'), (fulfillment ->> 'evidence')) AS proof(value)
    -- 与 isNotProvided 相同：先去首尾空白，再按 NFKC 识别占位符。
    WHERE coalesce(normalize(btrim(proof.value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), NFKC), '')
      IN ('', '/', '-', '—')
  ) AS lacks_proof
  FROM prior_admission
),
admitted AS (
  SELECT *, is_legacy OR (was_verified AND NOT lacks_proof) AS counts
  FROM checked
),
affected_totals AS (
  SELECT batch_id,
    sum(qty) FILTER (WHERE is_receipt AND counts) AS received_qty,
    bool_or(NOT is_receipt AND counts) AS has_shipment
  FROM admitted
  GROUP BY batch_id
  HAVING bool_or(lacks_proof)
),
batch_statuses AS (
  -- 与 deriveBatchStatus 同序。计划与实收均按 numeric(18, 4) 储存。
  SELECT b.id, b.order_line_id, CASE
    WHEN b.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN b.closed_at IS NOT NULL THEN 'closed'
    WHEN totals.received_qty > 0 AND totals.received_qty >= b.planned_qty THEN 'received'
    WHEN totals.received_qty > 0 THEN 'partially_received'
    WHEN totals.has_shipment THEN 'shipped'
    WHEN b.date_buyer_confirmed IS NOT NULL THEN 'confirmed'
    ELSE 'awaiting_date'
  END AS status
  FROM affected_totals AS totals
  JOIN delivery_batches AS b ON b.id = totals.batch_id
),
updated_batches AS (
  UPDATE delivery_batches AS b
  SET status = projected.status, status_changed_at = transaction_timestamp(), updated_at = transaction_timestamp()
  FROM batch_statuses AS projected
  WHERE b.id = projected.id AND b.status IS DISTINCT FROM projected.status
  RETURNING b.id, b.status, b.status_changed_at
),
affected_lines AS (
  SELECT DISTINCT order_line_id FROM batch_statuses
),
current_batches AS (
  SELECT b.id, b.order_line_id, b.seq, b.date_buyer_confirmed,
    coalesce(updated.status, b.status) AS status,
    coalesce(updated.status_changed_at, b.status_changed_at) AS status_changed_at
  FROM affected_lines AS affected
  JOIN delivery_batches AS b ON b.order_line_id = affected.order_line_id
  LEFT JOIN updated_batches AS updated ON updated.id = b.id
),
next_open AS (
  -- projectLine 先取有确认日的最早开放批次，再按 seq、id 破同序。
  SELECT DISTINCT ON (order_line_id) order_line_id, id, date_buyer_confirmed, status, status_changed_at
  FROM current_batches
  WHERE status IN ('awaiting_date', 'confirmed', 'shipped', 'partially_received')
  ORDER BY order_line_id, date_buyer_confirmed ASC NULLS LAST, seq, id COLLATE "C"
),
last_live AS (
  SELECT order_line_id, max(status_changed_at) AS status_changed_at
  FROM current_batches
  WHERE status <> 'cancelled'
  GROUP BY order_line_id
),
projected_lines AS (
  SELECT line.id, CASE
    WHEN line.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN head.status = 'awaiting_date' THEN 'awaiting_date'
    WHEN head.status = 'confirmed' THEN 'awaiting_shipment'
    WHEN head.status = 'shipped' THEN 'awaiting_receipt'
    WHEN head.status = 'partially_received' THEN 'partially_received'
    WHEN latest.order_line_id IS NOT NULL THEN 'done'
    ELSE 'no_batch'
  END AS stage,
    coalesce(line.cancelled_at, head.status_changed_at, latest.status_changed_at, line.created_at) AS stage_changed_at,
    CASE WHEN line.cancelled_at IS NULL THEN head.id END AS next_due_batch_id,
    CASE WHEN line.cancelled_at IS NULL THEN head.date_buyer_confirmed END AS next_due_date
  FROM affected_lines AS affected
  JOIN order_lines AS line ON line.id = affected.order_line_id
  LEFT JOIN next_open AS head ON head.order_line_id = line.id
  LEFT JOIN last_live AS latest ON latest.order_line_id = line.id
)
UPDATE order_lines AS line
SET stage = projected.stage, stage_changed_at = projected.stage_changed_at,
  next_due_batch_id = projected.next_due_batch_id, next_due_date = projected.next_due_date
FROM projected_lines AS projected
WHERE line.id = projected.id
  AND (line.stage, line.stage_changed_at, line.next_due_batch_id, line.next_due_date)
    IS DISTINCT FROM (projected.stage, projected.stage_changed_at, projected.next_due_batch_id, projected.next_due_date);
