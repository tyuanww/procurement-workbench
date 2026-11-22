CREATE TABLE IF NOT EXISTS work_items (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  subject_type text NOT NULL,
  subject_id text,
  kind text NOT NULL,
  title text NOT NULL,
  owner_user_id text,
  counterparty_party_id text,
  counterparty_role text,
  planned_start date NOT NULL,
  planned_end date NOT NULL,
  status text NOT NULL,
  priority text NOT NULL,
  source text NOT NULL,
  parent_id text,
  version integer NOT NULL DEFAULT 0,
  CONSTRAINT work_items_subject_type_check CHECK (subject_type in ('order_line', 'delivery_batch', 'standalone')),
  CONSTRAINT work_items_kind_check CHECK (kind in ('milestone', 'task', 'follow_up')),
  CONSTRAINT work_items_status_check CHECK (status in ('planned', 'in_progress', 'blocked', 'done', 'cancelled')),
  CONSTRAINT work_items_priority_check CHECK (priority in ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT work_items_source_check CHECK (source in ('manual', 'batch_milestone', 'import')),
  CONSTRAINT work_items_counterparty_role_check CHECK (counterparty_role is null or counterparty_role in ('supplier', 'factory', 'customer', 'internal', 'other')),
  CONSTRAINT work_items_planned_range_check CHECK (planned_end >= planned_start)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_status_planned_end_idx ON work_items (status, planned_end);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_planned_seq_idx ON work_items (planned_end);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_owner_planned_end_idx ON work_items (owner_user_id, planned_end);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_counterparty_planned_end_idx ON work_items (counterparty_party_id, planned_end);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_subject_idx ON work_items (subject_type, subject_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS work_item_events (
  id text PRIMARY KEY,
  work_item_id text NOT NULL,
  kind text NOT NULL,
  field text,
  old_value jsonb,
  new_value jsonb,
  actor_user_id text NOT NULL,
  note text,
  created_at timestamptz NOT NULL,
  CONSTRAINT work_item_events_kind_check CHECK (kind in ('created', 'status_changed', 'owner_changed', 'date_changed', 'dependency_changed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_item_events_work_item_created_idx ON work_item_events (work_item_id, created_at);
--> statement-breakpoint
CREATE OR REPLACE RULE work_item_events_no_update AS ON UPDATE TO work_item_events DO INSTEAD NOTHING;
--> statement-breakpoint
CREATE OR REPLACE RULE work_item_events_no_delete AS ON DELETE TO work_item_events DO INSTEAD NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS work_item_dependencies (
  id text PRIMARY KEY,
  from_item_id text NOT NULL,
  to_item_id text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT work_item_dependencies_kind_check CHECK (kind in ('finish_to_start')),
  CONSTRAINT work_item_dependencies_not_self_check CHECK (from_item_id <> to_item_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_item_dependencies_pair_uq ON work_item_dependencies (from_item_id, to_item_id, kind);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_item_dependencies_to_idx ON work_item_dependencies (to_item_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_item_dependencies_from_idx ON work_item_dependencies (from_item_id);
