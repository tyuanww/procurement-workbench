ALTER TABLE product_development_projects
  ADD COLUMN progress jsonb,
  ADD COLUMN progress_version integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT product_development_projects_progress_check CHECK (jsonb_typeof(progress) = 'object' AND progress_version >= 0);
--> statement-breakpoint
ALTER TABLE product_development_nodes
  ADD COLUMN follow_up jsonb,
  ADD CONSTRAINT product_development_nodes_follow_up_check CHECK (jsonb_typeof(follow_up) = 'object');
