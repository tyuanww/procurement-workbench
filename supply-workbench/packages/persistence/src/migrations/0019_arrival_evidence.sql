CREATE TABLE arrivals (
  id text PRIMARY KEY,
  registered_at timestamptz NOT NULL,
  registered_by text NOT NULL,
  source jsonb NOT NULL,
  warehouse_id text NOT NULL,
  received_on date NOT NULL,
  item_code text NOT NULL,
  qty numeric(18, 4) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  allocation jsonb
);

CREATE INDEX arrivals_received_on_idx ON arrivals (received_on DESC, id DESC);
CREATE INDEX arrivals_pending_idx ON arrivals (received_on DESC, id DESC) WHERE allocation IS NULL;

CREATE TABLE arrival_references (
  key text PRIMARY KEY,
  arrival_id text NOT NULL REFERENCES arrivals(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE arrival_revisions (
  arrival_id text NOT NULL REFERENCES arrivals(id),
  revision integer NOT NULL CHECK (revision > 0),
  request_key text NOT NULL,
  PRIMARY KEY (arrival_id, revision)
);
