DO $dup$
DECLARE
  duplicates text;
BEGIN
  SELECT string_agg(candidate_key || ' [' || ids || ']', '; ' ORDER BY candidate_key)
  INTO duplicates
  FROM (
    SELECT candidate_key, string_agg(id, ', ' ORDER BY id) AS ids
    FROM order_lines
    WHERE candidate_key IS NOT NULL
    GROUP BY candidate_key
    HAVING count(*) > 1
  ) AS repeated;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION '采购总表订单行候选键重复，不能加唯一约束：%', duplicates;
  END IF;
END
$dup$;
--> statement-breakpoint
DROP INDEX IF EXISTS order_lines_candidate_key;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS order_lines_candidate_key_uq
  ON order_lines (candidate_key)
  WHERE candidate_key IS NOT NULL;
