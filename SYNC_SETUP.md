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
- `POST /api/sync` (`clientId`, `lastSyncAt`, `records`, `workingNests`)

## Etap 2: synchronizacja zdjęć
Synchronizacja obejmuje rekordy terenowe i gniazda robocze.

W tej wersji zdjęcia zostają lokalnie w IndexedDB i nie są wysyłane na serwer. W etapie 2 dodaj upload plików (np. S3/NAS share), mapowanie referencji zdjęć w rekordzie oraz retry kolejkowania uploadu.


### Migracja istniejącej bazy
Jeśli API działało wcześniej bez tabeli `working_nests`, wykonaj ręcznie SQL z `api/src/schema.sql` (sekcja `CREATE TABLE IF NOT EXISTS working_nests ...`) na docelowej bazie PostgreSQL.
