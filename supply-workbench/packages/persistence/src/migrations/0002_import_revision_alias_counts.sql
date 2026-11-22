ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "party_aliases" ADD COLUMN IF NOT EXISTS "seen_batch_count" integer NOT NULL DEFAULT 0;
