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
  working_nest_id TEXT,
  local_ref TEXT,
  photo_role TEXT,
  filename TEXT,
  original_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_photos_record_uid ON photos(record_uid);
CREATE INDEX IF NOT EXISTS idx_photos_working_nest_id ON photos(working_nest_id);
CREATE INDEX IF NOT EXISTS idx_photos_sha256 ON photos(sha256);
CREATE INDEX IF NOT EXISTS idx_photos_local_ref ON photos(local_ref);
