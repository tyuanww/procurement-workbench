CREATE TABLE IF NOT EXISTS "command_idempotency" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_id" text NOT NULL,
  "route" text NOT NULL,
  "resource_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload_hash" text NOT NULL,
  "result" jsonb,
  "claimed_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "command_idempotency_scope" UNIQUE("actor_id", "route", "resource_id", "idempotency_key")
);
