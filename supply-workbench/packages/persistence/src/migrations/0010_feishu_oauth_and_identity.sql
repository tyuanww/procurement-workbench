CREATE UNIQUE INDEX IF NOT EXISTS users_feishu_open_id_uq
  ON users (feishu_open_id)
  WHERE feishu_open_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_oauth_states (
  id text PRIMARY KEY NOT NULL,
  state_hash text NOT NULL,
  redirect_uri text NOT NULL,
  return_to text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS auth_oauth_states_state_hash
  ON auth_oauth_states (state_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_oauth_states_expires_at
  ON auth_oauth_states (expires_at);
