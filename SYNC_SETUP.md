# Synchronizacja Sieweczka (QNAP / Container Station)

1. Skopiuj `.env.example` do `.env` i ustaw `SYNC_TOKEN`, `DATABASE_URL`, `CORS_ORIGIN`.
2. Uruchom: `docker compose up -d --build`.
3. W PWA w sekcji **Synchronizacja** ustaw URL API (np. `https://twoj-host/api`) i token.
4. PostgreSQL **nie powinien** mieć publicznie wystawionego portu 5432. Wystaw tylko API przez reverse proxy/HTTPS.
5. CORS kontrolujesz przez `CORS_ORIGIN` (jedna lub wiele domen rozdzielonych przecinkiem).

## Endpointy
- `GET /health`
- `GET /api/records?updated_after=...`
- `POST /api/records/bulk`
- `POST /api/sync` (`clientId`, `lastSyncAt`, `records`, `workingNests`, `photos`)
- `GET /api/photos?updated_after=...`
- `GET /api/photos/:id/content`
- `PUT /api/photos/:id/content`

## Etap 2: synchronizacja zdjęć

API ma teraz tabelę `photos`, która przechowuje:
- metadane zdjęcia (`id`, `record_uid`, `kind`, `position`, `filename`, `mime_type`, `size_bytes`, `checksum`, `payload`),
- binarną zawartość zdjęcia w kolumnie `data BYTEA`,
- czas ostatniej zmiany po stronie serwera (`server_updated_at`).

Przepływ synchronizacji:
1. Klient wysyła zwykły `POST /api/sync` z rekordami, gniazdami roboczymi oraz listą metadanych zdjęć.
2. API zapisuje metadane i zwraca `missingPhotoIds` — identyfikatory zdjęć, których treści binarnej jeszcze nie ma na serwerze.
3. Klient wysyła brakujące pliki przez `PUT /api/photos/:id/content` z nagłówkiem `Content-Type` odpowiadającym typowi pliku.
4. Inne urządzenie pobiera listę metadanych przez `POST /api/sync` albo `GET /api/photos`, a brakujące lokalnie pliki pobiera z `GET /api/photos/:id/content` i zapisuje w IndexedDB.

Domyślny limit jednego uploadu to `25mb`. Można go zmienić zmienną środowiskową `PHOTO_UPLOAD_LIMIT`, np. `PHOTO_UPLOAD_LIMIT=50mb`.

### Migracja istniejącej bazy
Jeśli API działało wcześniej bez tabeli `photos`, wykonaj ręcznie SQL z `api/src/schema.sql` (sekcja `CREATE TABLE IF NOT EXISTS photos ...`) na docelowej bazie PostgreSQL albo pozwól, aby świeży kontener PostgreSQL zainicjalizował schemat przy pierwszym starcie.
