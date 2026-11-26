WITH current_assignment AS (
  SELECT owner.product_id, owner.owner_name, audit.actor_user_id, audit.at
  FROM product_archive_owners owner
  JOIN LATERAL (
    SELECT action, after, actor_user_id, at
    FROM audit_log
    WHERE entity_id = owner.product_id
      AND (
        (action = 'product.owner' AND after -> 'partCodeRaw' = 'null'::jsonb)
        OR (action = 'product.contacts' AND after ->> 'role' = 'product_info')
      )
    ORDER BY at DESC, id DESC
    LIMIT 1
  ) audit ON audit.action = 'product.owner' AND audit.after ->> 'ownerName' = owner.owner_name
  WHERE owner.part_code_raw = ''
    AND NOT EXISTS (
      SELECT 1 FROM product_contacts contact
      WHERE contact.product_id = owner.product_id AND contact.role = 'product_info' AND contact.updated_at >= audit.at
    )
), superseded_contacts AS (
  DELETE FROM product_contacts contact
  USING current_assignment assignment
  WHERE contact.product_id = assignment.product_id AND contact.role = 'product_info'
)
INSERT INTO product_contacts (product_id, role, user_id, name_raw, note, source, updated_by, updated_at)
SELECT product_id, 'product_info', NULL, owner_name, NULL, 'workbench', actor_user_id, at
FROM current_assignment;
--> statement-breakpoint
DELETE FROM product_archive_owners owner
WHERE owner.part_code_raw = ''
  OR NOT EXISTS (
    SELECT 1 FROM products product
    JOIN bom_lines part ON part.product_barcode_raw = product.barcode_raw
    WHERE product.id = owner.product_id AND part.part_code_raw = owner.part_code_raw
  );
