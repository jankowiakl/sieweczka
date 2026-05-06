# Synchronizacja Sieweczka (QNAP / Container Station)

Synchronizacja obejmuje teraz:
- rekordy terenowe (`records`);
- gniazda robocze (`working_nests`);
- zdjęcia jako pliki na QNAP z metadanymi w PostgreSQL (`photos`).

Zdjęcia nie są zapisywane w PostgreSQL jako base64 ani jako dane binarne. Baza przechowuje tylko metadane, a pliki trafiają do katalogu `photo-data/`, montowanego w kontenerze jako `/data/photos`.

Zdjęcia z serwera są pobierane na żądanie i nie są automatycznie zapisywane offline na urządzeniu.

## Uruchomienie

1. Skopiuj `.env.example` do `.env` i ustaw `SYNC_TOKEN`, `DATABASE_URL`, `CORS_ORIGIN`, opcjonalnie `PHOTO_DIR` i `MAX_PHOTO_MB`.
2. Uruchom lub zaktualizuj kontenery:

   ```sh
   docker compose up -d --build
   ```

3. W PWA w sekcji **Synchronizacja** ustaw URL API (np. `https://twoj-host`) i token.
4. PostgreSQL **nie powinien** mieć publicznie wystawionego portu 5432. Wystaw tylko API przez reverse proxy/HTTPS.
5. CORS kontrolujesz przez `CORS_ORIGIN` (jedna lub wiele domen rozdzielonych przecinkiem).

## Katalog zdjęć

`compose.yaml` montuje:

```yaml
./photo-data:/data/photos
```

Nie usuwaj katalogu `photo-data/`, jeśli chcesz zachować zdjęcia. Usunięcie tego katalogu skasuje pliki zdjęć, nawet jeśli metadane nadal będą widoczne w tabeli `photos`.

## Endpointy

- `GET /health`
- `GET /api/records?updated_after=...`
- `POST /api/records/bulk`
- `POST /api/sync` (`clientId`, `lastSyncAt`, `records`, `workingNests`)
- `POST /api/photos` (`multipart/form-data`, pole `file`, token Bearer)
- `GET /api/photos/:id`
- `GET /api/records/:uid/photos`
- `GET /api/working-nests/:id/photos`

## Migracja istniejącej bazy

Jeśli API działało wcześniej bez tabeli `working_nests`, wykonaj ręcznie SQL z `api/src/schema.sql` dla tej tabeli.

Jeśli tabela `photos` nie powstała automatycznie, wykonaj ręcznie:

```sql
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
```
