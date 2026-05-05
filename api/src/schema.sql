CREATE TABLE IF NOT EXISTS records (
  uid TEXT PRIMARY KEY,
  nest_id TEXT,
  species TEXT,
  observer TEXT,
  season TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  client_id TEXT,
  payload JSONB NOT NULL,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_records_server_updated_at ON records(server_updated_at);
CREATE INDEX IF NOT EXISTS idx_records_payload ON records USING GIN(payload);
