ALTER TABLE follow_ups ADD COLUMN reminder jsonb;
--> statement-breakpoint
CREATE INDEX follow_ups_batch_reminder ON follow_ups (batch_id, created_at DESC, id DESC)
WHERE reminder IS NOT NULL AND batch_id IS NOT NULL;
