ALTER TABLE work_items DROP CONSTRAINT work_items_subject_type_check,
  ADD CONSTRAINT work_items_subject_type_check
    CHECK (subject_type IN ('order_line', 'delivery_batch', 'standalone', 'product_development'));
--> statement-breakpoint
ALTER TABLE work_item_events DROP CONSTRAINT work_item_events_kind_check,
  ADD CONSTRAINT work_item_events_kind_check
    CHECK (kind IN ('created', 'status_changed', 'owner_changed', 'date_changed', 'dependency_changed', 'development_replied', 'development_linked'));
--> statement-breakpoint
CREATE TABLE product_development_projects (
  id text PRIMARY KEY,
  store text NOT NULL CHECK (store IN ('dafuyan', 'yiling')),
  title text NOT NULL,
  product_lead_user_id text NOT NULL REFERENCES users(id),
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX product_development_projects_store_idx ON product_development_projects (store);
--> statement-breakpoint
CREATE TABLE product_development_nodes (
  id text PRIMARY KEY REFERENCES work_items(id),
  project_id text NOT NULL REFERENCES product_development_projects(id),
  destination text NOT NULL CHECK (destination IN ('pilot_material_to_factory', 'packaging_to_factory', 'finished_to_warehouse', 'other')),
  buyer_user_id text REFERENCES users(id),
  order_line_id text REFERENCES order_lines(id),
  procurement_line_id text REFERENCES order_lines(id),
  oa_ref text,
  CONSTRAINT product_development_nodes_link_check CHECK (
    (order_line_id IS NULL AND procurement_line_id IS NULL AND oa_ref IS NULL) OR
    (order_line_id IS NOT NULL AND procurement_line_id IS NOT NULL AND oa_ref IS NOT NULL
      AND ((destination = 'finished_to_warehouse' AND order_line_id = procurement_line_id)
        OR (destination IN ('pilot_material_to_factory', 'packaging_to_factory') AND order_line_id <> procurement_line_id)))
  )
);
--> statement-breakpoint
CREATE INDEX product_development_nodes_project_idx ON product_development_nodes (project_id);
