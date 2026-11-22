ALTER TABLE auth_oauth_states
  ADD COLUMN IF NOT EXISTS nonce_hash text;
--> statement-breakpoint
UPDATE auth_oauth_states
SET nonce_hash = state_hash
WHERE nonce_hash IS NULL;
--> statement-breakpoint
ALTER TABLE auth_oauth_states
  ALTER COLUMN nonce_hash SET NOT NULL;
