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
ALTER TABLE records ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS delete_reason TEXT;


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
ALTER TABLE working_nests ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE working_nests ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE working_nests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE working_nests ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE working_nests ADD COLUMN IF NOT EXISTS delete_reason TEXT;


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
ALTER TABLE photos ADD COLUMN IF NOT EXISTS uploaded_by TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS delete_reason TEXT;


CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','coordinator','observer')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  invite_sent_at TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
