-- P1 owner attribution. 只建表，不给现有 606 行回填假负责人。
CREATE TABLE IF NOT EXISTS "owner_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "subject_type" text DEFAULT 'order_line' NOT NULL,
  "subject_id" text NOT NULL,
  "owner_user_id" text,
  "owner_name_raw" text,
  "status" text NOT NULL,
  "source" text NOT NULL,
  "source_ref" text,
  "effective_at" timestamp with time zone NOT NULL,
  "superseded_at" timestamp with time zone,
  CONSTRAINT "owner_assignments_status_check" CHECK ("status" in ('assigned', 'pending')),
  CONSTRAINT "owner_assignments_source_check" CHECK ("source" in ('po_master', 'mapping_import', 'manual')),
  CONSTRAINT "owner_assignments_owner_check" CHECK (("status" = 'assigned') = ("owner_user_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "owner_assignments_current_uq"
  ON "owner_assignments" USING btree ("subject_type", "subject_id")
  WHERE "superseded_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_assignments_subject"
  ON "owner_assignments" USING btree ("subject_type", "subject_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_assignments_owner_user_id"
  ON "owner_assignments" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_assignments_status"
  ON "owner_assignments" USING btree ("status");
