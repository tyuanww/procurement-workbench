-- P2 供应商与代工厂关联。先建当前关联表，再保守回填，不猜数据。
CREATE TABLE IF NOT EXISTS "line_factory_links" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "order_line_id" text NOT NULL,
  "factory_party_id" text,
  "status" text NOT NULL,
  "source" text NOT NULL,
  "confidence" text NOT NULL,
  "po_raw" text,
  "item_code_raw" text,
  "barcode_raw" text,
  "reason" text,
  "linked_at" timestamp with time zone NOT NULL,
  CONSTRAINT "line_factory_links_status_check" CHECK ("status" in ('linked', 'unlinked', 'manual')),
  CONSTRAINT "line_factory_links_source_check" CHECK ("source" in ('po_master', 'factory_progress', 'relink', 'manual')),
  CONSTRAINT "line_factory_links_confidence_check" CHECK ("confidence" in ('po', 'item_code', 'barcode', 'column', 'manual', 'none')),
  CONSTRAINT "line_factory_links_factory_check" CHECK (("status" = 'unlinked') = ("factory_party_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "line_factory_links_order_line_uq"
  ON "line_factory_links" USING btree ("order_line_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_factory_links_factory_party_id"
  ON "line_factory_links" USING btree ("factory_party_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_factory_links_status"
  ON "line_factory_links" USING btree ("status");
--> statement-breakpoint
-- 用已审批的供应商别名回填采购单主体。只做去首尾空白、合并空白后的原文等值匹配，
-- 不做 Unicode 归一化（应用层 normalizeText 的 NFKC 在 SQL 里没有等价函数），
-- 因此宁可少回填，也不把不同供应商并错。剩下的由 approve-alias 的事务内回填处理。
UPDATE "purchase_orders" AS po
SET "supplier_party_id" = pa."party_id",
    "updated_at" = now()
FROM "party_aliases" AS pa
WHERE po."supplier_party_id" IS NULL
  AND pa."status" = 'approved'
  AND pa."party_id" IS NOT NULL
  AND pa."norm_name" = regexp_replace(btrim(po."supplier_raw"), '\s+', ' ', 'g');
--> statement-breakpoint
-- 已有手工工厂关联回填到订单行关联表。当前生产库这一列为空，保留升级路径。
INSERT INTO "line_factory_links" (
  "id", "created_at", "updated_at", "order_line_id", "factory_party_id", "status", "source", "confidence",
  "po_raw", "item_code_raw", "barcode_raw", "reason", "linked_at"
)
SELECT
  'lfl:' || row."linked_order_line_id",
  now(), now(),
  row."linked_order_line_id",
  row."factory_party_id",
  'manual',
  'factory_progress',
  'manual',
  row."po_raw",
  row."item_code_raw",
  row."barcode_raw",
  NULL,
  now()
FROM (
  SELECT "linked_order_line_id", "factory_party_id", "po_raw", "item_code_raw", NULL::text AS "barcode_raw"
  FROM "factory_shipment_rows"
  WHERE "linked_order_line_id" IS NOT NULL AND "link_status" in ('linked', 'manual')
  UNION ALL
  SELECT "linked_order_line_id", "factory_party_id", "po_raw", "item_code_raw", "barcode_raw"
  FROM "factory_in_transit_rows"
  WHERE "linked_order_line_id" IS NOT NULL AND "link_status" in ('linked', 'manual')
) AS row
ON CONFLICT ("order_line_id") DO NOTHING;
