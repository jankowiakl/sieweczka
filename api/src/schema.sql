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

CREATE TABLE IF NOT EXISTS species_catalog (
  id TEXT PRIMARY KEY,
  code TEXT,
  polish_name TEXT NOT NULL,
  latin_name TEXT,
  english_name TEXT,
  status TEXT,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  legacy_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'Komisja Faunistyczna PTZool',
  source_url TEXT NOT NULL DEFAULT 'https://komisjafaunistyczna.pl/lista/',
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_species_catalog_polish_name ON species_catalog(polish_name);
CREATE INDEX IF NOT EXISTS idx_species_catalog_latin_name ON species_catalog(latin_name);
CREATE INDEX IF NOT EXISTS idx_species_catalog_code ON species_catalog(code);
CREATE INDEX IF NOT EXISTS idx_species_catalog_aliases ON species_catalog USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_species_catalog_legacy_values ON species_catalog USING GIN(legacy_values);

CREATE TABLE IF NOT EXISTS species_catalog_meta (
  id TEXT PRIMARY KEY DEFAULT 'kf',
  source TEXT NOT NULL DEFAULT 'Komisja Faunistyczna PTZool',
  source_url TEXT NOT NULL DEFAULT 'https://komisjafaunistyczna.pl/lista/',
  last_fetch_attempt_at TIMESTAMPTZ,
  last_successful_fetch_at TIMESTAMPTZ,
  species_count INTEGER NOT NULL DEFAULT 0,
  parser_version TEXT,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO species_catalog (id, code, polish_name, latin_name, english_name, status, aliases, legacy_values, source_payload)
SELECT 'kf-charadrius-alexandrinus', 'CHAALE', 'Sieweczka morska', 'Charadrius alexandrinus', 'Kentish Plover', '', '[]'::jsonb,
       '["custom:sieweczka-morska", "sieweczka-morska", "Sieweczka morska"]'::jsonb,
       '{"seed": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM species_catalog WHERE id = 'kf-charadrius-alexandrinus')
  AND NOT EXISTS (SELECT 1 FROM species_catalog WHERE latin_name = 'Charadrius alexandrinus');

INSERT INTO species_catalog_meta (id, species_count, parser_version)
VALUES ('kf', (SELECT count(*)::int FROM species_catalog WHERE is_active = true), 'seed-v1')
ON CONFLICT (id) DO NOTHING;
