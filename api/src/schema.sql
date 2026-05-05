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

CREATE TABLE IF NOT EXISTS working_nests (
  id TEXT PRIMARY KEY,
  status TEXT,
  note TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  client_id TEXT,
  payload JSONB NOT NULL,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_working_nests_server_updated_at ON working_nests(server_updated_at);
CREATE INDEX IF NOT EXISTS idx_working_nests_payload ON working_nests USING GIN(payload);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  record_uid TEXT,
  kind TEXT,
  position INTEGER,
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  client_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  data BYTEA,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_record_uid ON photos(record_uid);
CREATE INDEX IF NOT EXISTS idx_photos_server_updated_at ON photos(server_updated_at);
CREATE INDEX IF NOT EXISTS idx_photos_payload ON photos USING GIN(payload);
