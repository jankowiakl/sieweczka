# Synchronizacja Sieweczka (QNAP / Container Station)

Synchronizacja obejmuje:
- rekordy terenowe (`records`);
- gniazda robocze (`working_nests`);
- zdjęcia jako pliki na QNAP z metadanymi w PostgreSQL (`photos`);
- użytkowników i role obsługiwane przez API.

Zdjęcia nie są zapisywane w PostgreSQL jako base64 ani jako dane binarne. Baza przechowuje tylko metadane, a pliki trafiają do katalogu `photo-data/`, montowanego w kontenerze jako `/data/photos`.

Zdjęcia z serwera są pobierane na żądanie i nie są automatycznie zapisywane offline na urządzeniu.

## Uruchomienie

1. Skopiuj `.env.example` do `.env` i ustaw `SYNC_TOKEN`, `DATABASE_URL`, `CORS_ORIGIN`, `JWT_SECRET`, opcjonalnie `PHOTO_DIR`, `MAX_PHOTO_MB` i `JWT_EXPIRES_IN`.
2. `JWT_SECRET` ustaw jako długi losowy sekret. Nie zapisuj realnych sekretów w repozytorium.
3. Uruchom lub zaktualizuj kontenery:

   ```sh
   docker compose up -d --build
   ```

4. PostgreSQL **nie powinien** mieć publicznie wystawionego portu 5432. Wystaw tylko API przez reverse proxy/HTTPS.
5. CORS kontrolujesz przez `CORS_ORIGIN` (jedna lub wiele domen rozdzielonych przecinkiem).

## Pierwszy administrator

Po migracji i uruchomieniu API utwórz pierwszego admina. Endpoint działa tylko, gdy tabela `users` jest pusta:

```sh
curl -X POST https://twoj-host/api/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","name":"Administrator","password":"bardzo-mocne-haslo"}'
```

Kolejnych użytkowników tworzy admin w panelu aplikacji albo przez endpointy `/api/users`.

## Logowanie i tryb offline

W PWA wpisz API URL na ekranie logowania, zaloguj się emailem i hasłem. Aplikacja zapisuje token i dane użytkownika lokalnie pod kluczem `sieweczka-auth-v1`.

Po wcześniejszym zalogowaniu aplikacja działa offline: można dodawać rekordy, zdjęcia lokalne i gniazda robocze. Po odzyskaniu internetu synchronizacja użyje tokenu użytkownika. Jeśli telefon nigdy nie był zalogowany, pokaże ekran logowania.

Pole starego tokenu w sekcji synchronizacji zostaje jako tryb awaryjny/admin dla dotychczasowego `SYNC_TOKEN`. Normalna synchronizacja powinna używać tokenu zalogowanego użytkownika.

## Role

- `admin`: zarządza użytkownikami, rolami, resetuje hasła, aktywuje/dezaktywuje konta, widzi i edytuje wszystkie dane.
- `coordinator`: widzi i edytuje wszystkie rekordy oraz gniazda robocze, może eksportować dane, nie zarządza użytkownikami.
- `observer`: dodaje rekordy, zdjęcia i gniazda robocze, synchronizuje dane, edytuje własne rekordy, nie zarządza użytkownikami.

Nieaktywny użytkownik nie może logować się ani synchronizować.

## Usuwanie danych

Przycisk „Usuń” w aplikacji terenowej nie usuwa danych fizycznie. Dane są tylko oznaczane jako usunięte:
- `deleted_at`;
- `deleted_by`;
- `delete_reason`.

Rekordy i gniazda robocze oznaczone jako usunięte są domyślnie niewidoczne na listach i mapach, ale pozostają w PostgreSQL oraz w payloadzie. Zdjęcia oznaczone jako usunięte nie są domyślnie widoczne, a pliki zostają w `photo-data/`.

Trwałe czyszczenie danych powinno być osobnym narzędziem administracyjnym w przyszłości. Nie udostępniaj zwykłym użytkownikom endpointu, który fizycznie kasuje rekordy lub pliki zdjęć.

## Katalog zdjęć

`compose.yaml` montuje:

```yaml
./photo-data:/data/photos
```

Nie usuwaj katalogu `photo-data/`, jeśli chcesz zachować zdjęcia. Usunięcie tego katalogu skasuje pliki zdjęć, nawet jeśli metadane nadal będą widoczne w tabeli `photos`.

## Endpointy

- `GET /health`
- `POST /api/bootstrap-admin`
- `POST /api/login`
- `GET /api/me`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/reset-password`
- `POST /api/users/:id/deactivate`
- `POST /api/users/:id/activate`
- `GET /api/records?updated_after=...`
- `POST /api/records/bulk`
- `POST /api/sync` (`clientId`, `lastSyncAt`, `records`, `workingNests`)
- `POST /api/photos` (`multipart/form-data`, pole `file`, token Bearer)
- `GET /api/photos/:id`
- `GET /api/records/:uid/photos`
- `GET /api/working-nests/:id/photos`
- `POST /api/records/:uid/delete`
- `POST /api/working-nests/:id/delete`
- `POST /api/photos/:id/delete`
- `POST /api/records/:uid/restore` (admin)
- `POST /api/working-nests/:id/restore` (admin)
- `POST /api/photos/:id/restore` (admin)

## Migracja istniejącej bazy

`api/src/schema.sql` używa `CREATE TABLE IF NOT EXISTS` oraz `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, więc można ręcznie wykonać cały plik na istniejącej bazie.

Jeśli aktualizujesz starą instalację, upewnij się, że powstały tabele:
- `users`;
- `audit_log`;
- `photos`.

Upewnij się też, że istnieją kolumny:
- `records.created_by`, `records.updated_by`, `records.deleted_at`, `records.deleted_by`, `records.delete_reason`;
- `working_nests.created_by`, `working_nests.updated_by`, `working_nests.deleted_at`, `working_nests.deleted_by`, `working_nests.delete_reason`;
- `photos.uploaded_by`, `photos.deleted_at`, `photos.deleted_by`, `photos.delete_reason`.

Po aktualizacji wykonaj:

```sh
docker compose up -d --build
```
