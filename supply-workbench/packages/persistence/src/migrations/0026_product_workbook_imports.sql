CREATE TABLE product_workbook_imports (
  id text PRIMARY KEY,
  anchor_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_by text NOT NULL,
  file_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  session jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX product_workbook_imports_upload ON product_workbook_imports (anchor_id, created_by, file_hash, created_at DESC);
--> statement-breakpoint
INSERT INTO product_contacts (product_id, role, user_id, name_raw, note, source, updated_by, updated_at)
SELECT owner.product_id, 'product_info', NULL, owner.owner_name, NULL, 'workbench', coalesce(audit.actor_user_id, product.edited_by, 'system'), coalesce(audit.at, product.updated_at)
FROM product_archive_owners owner
JOIN products product ON product.id = owner.product_id
LEFT JOIN LATERAL (
  SELECT actor_user_id, at FROM audit_log
  WHERE entity_id = owner.product_id AND action = 'product.owner'
    AND after -> 'partCodeRaw' = 'null'::jsonb
  ORDER BY at DESC LIMIT 1
) audit ON true
WHERE owner.part_code_raw = ''
  AND NOT EXISTS (
    SELECT 1 FROM product_contacts contact
    WHERE contact.product_id = owner.product_id AND contact.role = 'product_info'
  );
