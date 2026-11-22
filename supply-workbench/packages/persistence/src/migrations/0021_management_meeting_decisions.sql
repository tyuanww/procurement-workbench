CREATE TABLE management_meeting_decisions (
  id text PRIMARY KEY,
  store text NOT NULL CHECK (store IN ('store_a', 'store_b', 'unassigned')),
  week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  material_line_id text NOT NULL REFERENCES order_lines(id),
  decision text NOT NULL,
  owner_id text NOT NULL REFERENCES users(id),
  owner_name text NOT NULL,
  due_date date NOT NULL CHECK (due_date >= week_start),
  completion_criteria text NOT NULL,
  recorded_at timestamptz NOT NULL,
  decided_by_id text NOT NULL REFERENCES users(id),
  decided_by_name text NOT NULL,
  completion_evidence text,
  completed_at timestamptz,
  completed_by_id text REFERENCES users(id),
  completed_by_name text,
  CONSTRAINT management_meeting_completion_check CHECK (
    num_nonnulls(completion_evidence, completed_at, completed_by_id, completed_by_name) IN (0, 4)
  )
);

CREATE INDEX management_meeting_store_week_idx ON management_meeting_decisions (store, week_start DESC);
