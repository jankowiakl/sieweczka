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

W PWA zaloguj się emailem i hasłem. Zwykły użytkownik widzi na ekranie logowania tylko pola email/hasło i przycisk „Zaloguj” — nie wpisuje API URL ani tokenu. Aplikacja zapisuje token i dane użytkownika lokalnie pod kluczem `sieweczka-auth-v1`.

Po wcześniejszym zalogowaniu aplikacja działa offline: można dodawać rekordy, zdjęcia lokalne i gniazda robocze. Po odzyskaniu internetu synchronizacja użyje tokenu użytkownika. Jeśli telefon nigdy nie był zalogowany, pokaże ekran logowania.

Pole starego tokenu w sekcji synchronizacji zostaje jako tryb awaryjny/admin dla dotychczasowego `SYNC_TOKEN`. Normalna synchronizacja powinna używać tokenu zalogowanego użytkownika.

## Domyślny serwer API

Zwykli użytkownicy nie wpisują tokenu synchronizacji ani adresu API. Aplikacja ma domyślny publiczny adres API zapisany w `DEFAULT_API_URL` w `app.js`:

```js
DEFAULT_API_URL = "https://bielik.myqnapcloud.com:18443"
```

Autoryzacja użytkowników działa przez email i hasło, a aplikacja używa JWT otrzymanego z `/api/login`. `SYNC_TOKEN` zostaje tylko jako awaryjny mechanizm serwerowy i nie jest zaszyty w frontendzie.

Ustawienia API URL są ukryte w ustawieniach technicznych administratora w panelu „Użytkownik” i powinny być zmieniane tylko przez administratora lub podczas diagnostyki. Zwykły użytkownik nie widzi pola API URL ani tokenu; jeśli połączenie nie działa, powinien sprawdzić internet albo skontaktować się z administratorem.

## Zaproszenia użytkowników

Admin może wysłać zaproszenie z panelu administratora. Backend generuje tymczasowe hasło, zapisuje tylko jego bcrypt hash w PostgreSQL, ustawia `must_change_password=true` oraz `invite_sent_at=now()`.

Konfiguracja SMTP w `.env`:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Sieweczka <noreply@example.com>"
PUBLIC_APP_URL="https://jankowiakl.github.io/sieweczka/"
PUBLIC_API_URL="https://bielik.myqnapcloud.com:18443"
```

Jeśli SMTP jest skonfigurowane, email wychodzi z backendu. Jeśli SMTP nie jest skonfigurowane, API zwraca gotowy `mailtoUrl`, a aplikacja otwiera wiadomość do wysłania ręcznie.

Zaproszenie zawiera rolę użytkownika i krótki opis uprawnień:
- Administrator — zarządzanie użytkownikami, edycja danych, przywracanie ukrytych wpisów i czynności administracyjne;
- Koordynator — widzi i edytuje dane zespołu oraz wykonuje eksporty, ale nie zarządza użytkownikami;
- Obserwator — dodaje własne rekordy, zdjęcia i gniazda robocze oraz synchronizuje dane.

Użytkownik zaproszony hasłem tymczasowym po zalogowaniu zobaczy ekran zmiany hasła przed menu głównym.

## Panel administratora

Panel administratora zawsze pobiera użytkowników bezpośrednio z serwera przez:

```text
GET /api/users?_ts=<Date.now()>
```

Przycisk „Odśwież użytkowników” robi takie samo świeże pobranie. Panel pozwala tworzyć użytkowników, zmieniać role, aktywować/dezaktywować konta, resetować hasła i wysyłać zaproszenia.

Admin nie może odebrać sam sobie roli admin ani zdezaktywować własnego konta. Nie można też zdegradować ani zdezaktywować ostatniego aktywnego administratora.

## Pierwsza strona aplikacji

Pierwsza strona pokazuje proste kafelki terenowe:
- Nowy rekord;
- Mapa — opis „Zobacz rekordy”;
- Gniazda robocze;
- Lista rekordów.

Drugi poziom zawiera synchronizację i powrót do szkicu, jeśli istnieje. Eksport, panel użytkownika, pomoc, odświeżenie wersji aplikacji oraz opcje administratora są w górnym menu aplikacji. Ustawienia techniczne są schowane w panelu „Użytkownik” i widoczne tylko dla administratora.

## Instalacja PWA

Aplikację można dodać do ekranu głównego telefonu. Opcja „Zainstaluj aplikację” jest dostępna w górnym menu aplikacji oraz w panelu „Użytkownik”.

Jeśli przeglądarka udostępnia systemowe okno instalacji PWA, przycisk uruchomi ten prompt. Jeśli prompt nie jest dostępny, użyj instrukcji przeglądarki:
- Chrome/Android: Menu ⋮ → Zainstaluj aplikację albo Dodaj do ekranu głównego;
- Brave/Android: Menu ⋮ → Dodaj do ekranu głównego albo Zainstaluj aplikację;
- iPhone/Safari: Udostępnij → Do ekranu początkowego.

Jeśli aplikacja działa już w trybie standalone, panel pokaże informację „Aplikacja działa jako zainstalowana.” Manifest PWA wskazuje ikony PNG 192/512 oraz ikony maskable.

## Ustawienia wyglądu

Panel „Użytkownik” zawiera ustawienia lokalne zapisane w `sieweczka-ui-settings-v1`:
- rozmiar tekstu;
- skala interfejsu: Kompaktowa, Normalna, Duża;
- rozmiar przycisków: Małe, Normalne, Duże;
- rozmiar ikon: Małe, Normalne, Duże;
- tryb terenowy.

Te ustawienia nie są wysyłane na serwer i nie zmieniają danych terenowych. Jeśli menu albo przyciski są zbyt duże na telefonie, ustaw skalę interfejsu na „Kompaktowa” i rozmiar przycisków na „Małe”; jeśli problem dotyczy symboli, ustaw też rozmiar ikon na „Małe”.

### Wygląd na różnych telefonach

Android/iPhone oraz Brave, Safari, Chrome i tryb PWA mogą inaczej interpretować automatyczne skalowanie tekstu i elementów dotykowych. Widok główny, menu aplikacji, kafelki, przyciski i ikony korzystają z ograniczeń `clamp()`, aby nie rosły niekontrolowanie na iOS, ale nadal pozostały wygodne w terenie.

Jeśli menu albo przyciski są zbyt duże, ustaw skalę interfejsu na „Kompaktowa” i rozmiar przycisków na „Małe”. W panelu „Użytkownik” można również zmienić rozmiar tekstu i ikon oraz otworzyć zwijaną sekcję „Diagnostyka interfejsu” z szerokością/wysokością okna, `devicePixelRatio`, user agentem, trybem PWA, wersją aplikacji i aktualnymi ustawieniami UI.

## Eksport zdjęć z serwera

Eksport jest dostępny z górnego menu aplikacji, a nie jako przycisk na pierwszym ekranie. Dla ról z uprawnieniami eksportu menu pokazuje pozycję „Eksport”.

Eksport ma dwa tryby:
- „Eksport bez zdjęć” - szybki ZIP z `sieweczka-records.csv` i `records.json`, bez pobierania plików zdjęć;
- „Eksport ze zdjęciami” - ZIP z danymi, folderem `photos/` oraz `photos_manifest.csv`.

Przed eksportem ze zdjęciami aplikacja ostrzega, że może zostać pobrana duża ilość danych. Zdjęcia lokalne są używane z IndexedDB. Zdjęcia wykonane na innym telefonie są pobierane z API przez `fetch` z nagłówkiem `Authorization` tylko na czas tworzenia pliku ZIP.

Zdjęcia pobrane do eksportu nie są zapisywane trwale w IndexedDB ani w `localStorage`. Po odświeżeniu aplikacji zdjęcie serwerowe może zostać pobrane ponownie, jeśli użytkownik znów otworzy podgląd albo wykona eksport ze zdjęciami.

Jeśli pojedyncze zdjęcie nie pobierze się z serwera, eksport jest kontynuowany, a błąd trafia do `photos_manifest.csv`. Offline można wyeksportować dane bez zdjęć albo tylko zdjęcia dostępne lokalnie.

## Kategorie mezohabitatu

Aktualne klasy mezohabitatu w buforze 15 m:
- Piasek;
- Żwir;
- Kamienie;
- Roślinność;
- Woda / podmokłość;
- Muszle.

Zgodność ze starymi danymi:
- dawne „Żwir / kamienie” jest pokazywane i eksportowane jako „Kamienie”;
- dawne „Inne” w mezohabitacie jest pokazywane i eksportowane jako „Muszle”;
- nowe osobne pole „Żwir” jest zapisywane w payload JSON jako dodatkowa wartość;
- baza SQL nie wymaga migracji, bo dane mezohabitatu pozostają w JSON payload.

Eksport tabelaryczny używa czytelnych kolumn:
- `Mezohabitat — piasek`;
- `Mezohabitat — żwir`;
- `Mezohabitat — kamienie`;
- `Mezohabitat — roślinność`;
- `Mezohabitat — woda/podmokłość`;
- `Mezohabitat — muszle`.

## Kolejność kroków arkusza

Arkusz terenowy prowadzi użytkownika w kolejności pracy w terenie:

1. Identyfikacja gniazda / dane podstawowe.
2. GPS i zdjęcia gniazda.
3. Mikrohabitat gniazda.
4. Mezohabitat.
5. Punkt losowy 10 m.
6. Mikrohabitat punktu losowego.
7. Kontrola jakości i uwagi.
8. Podsumowanie i zapis.

Mezohabitat jest bezpośrednio po mikrohabitacie gniazda, a przed punktem losowym 10 m. Pasek kroków w arkuszu można przewijać palcem w poziomie; aktywny krok przewija się automatycznie do widoku. Kliknięcie kroku na pasku przenosi do wybranej części formularza zgodnie z bieżącą logiką formularza.

## Grid mapy

Grid mapy jest ładowany z pliku:

```text
data/grid_vanvan_wgs84.geojson
```

Źródłowy grid jest w `data/GRID_vanvan.gpkg` i ma CRS EPSG:2180 (ETRF2000-PL / CS92). Leaflet nie może rysować tych współrzędnych bezpośrednio jako GeoJSON, bo oczekuje EPSG:4326 / WGS84 z kolejnością `[lon, lat]`.

Aplikacja używa gotowego pliku WGS84:

```text
data/grid_vanvan_wgs84.geojson
```

Można go wygenerować z GeoPackage komendą:

```sh
ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/grid_vanvan_wgs84.geojson data/GRID_vanvan.gpkg
```

Plik musi być dostępny po wdrożeniu PWA i jest dodany do cache aplikacji w `sw.js`. Service Worker nie cache'uje endpointów `/api/*`, ale może cache'ować statyczny plik gridu.

GeoJSON gridu musi być w EPSG:4326, z kolejnością współrzędnych `[lon, lat]`. Leaflet rysuje taki GeoJSON poprawnie na tle Esri World Imagery. Jeśli grid jest przesunięty, nie należy przesuwać go „na oko”; trzeba ponownie wyeksportować plik jako GeoJSON EPSG:4326 i sprawdzić kolejność współrzędnych.

Aplikacja pokazuje diagnostykę gridu w statusie mapy. Jeśli plik jest pusty, niedostępny albo współrzędne nie wyglądają na WGS84, w konsoli i UI pojawi się komunikat zamiast cichej awarii.

## Obserwator

Przy tworzeniu nowego rekordu pole „Obserwator” jest domyślnie uzupełniane nazwą aktualnie zalogowanego użytkownika. Jeśli użytkownik nie ma nazwy, aplikacja użyje jego emaila. Pole pozostaje zwykłym polem tekstowym i można je ręcznie zmienić, np. gdy rekord wpisuje się w imieniu innej osoby.

Edycja istniejącego rekordu nie zmienia obserwatora automatycznie.

## Szkice

Przy wyjściu z arkusza do menu aplikacja ostrzega:

```text
Wychodzisz z arkusza. Niedokończony wpis zostanie zapisany w szkicach.
```

Po potwierdzeniu dane formularza są zapisane lokalnie jako szkic. Jeśli istnieje szkic, na ekranie głównym pojawia się informacja „Masz niedokończony wpis” oraz przycisk „Wróć do szkicu”.

Przy pasku kroków formularza są szybkie przyciski „Początek” i „Koniec”. „Początek” przechodzi do pierwszego kroku bez kasowania wpisanych danych, a „Koniec” przechodzi do ostatniego kroku/podsumowania zgodnie z tą samą logiką nawigacji kroków, która działa dla przewijanego paska.

## Wyjście z arkusza

Przycisk „Wróć do menu” w arkuszu rekordu służy tylko do opuszczenia formularza i nie wylogowuje użytkownika. Nie zmienia `sieweczka-auth-v1` ani tokenu logowania.

Jeśli formularz jest pusty, aplikacja wraca do menu bez ostrzeżenia. Jeśli wpis jest rozpoczęty albo trwa edycja, aplikacja pokazuje komunikat i pozwala wybrać:
- „Zostań w arkuszu”;
- „Zapisz szkic i wyjdź”.

Niedokończony wpis zostaje zapisany pod kluczem szkicu. Dane terenowe, lokalne rekordy i zdjęcia pozostają na urządzeniu. Zdjęcia wybrane do szkicu są zapisywane lokalnie jako referencje `idb:...`, tak jak zdjęcia zrobione tym telefonem.

## Mapy i kierunek

Na mapie rekordów oraz mapie gniazd roboczych przycisk kierunku działa jako przełącznik. Pierwsze kliknięcie włącza heading/strzałkę kierunku, aktualizuje stan przycisku i prosi o zgodę przeglądarki, jeśli urządzenie jej wymaga. Drugie kliknięcie wyłącza tylko kierunek i usuwa strzałkę, ale nie wyłącza lokalizacji GPS ani centrowania mapy.

## Menu aplikacji

Górny przycisk „Menu” otwiera menu aplikacji z mniej codziennymi opcjami: użytkownik, synchronizacja, eksport, pomoc, ustawienia, odświeżenie wersji aplikacji i wylogowanie. Opcja „Administrator” jest widoczna tylko dla roli `admin`, a eksport dla admina i koordynatora.

To menu nie jest wylogowaniem. Wylogowanie pozostaje osobnym przyciskiem w menu i panelu użytkownika.

## Tryb terenowy

Tryb terenowy jest dostępny w panelu „Użytkownik” jako przełącznik. Nie jest już stale pokazywany w górnym pasku. Stan trybu terenowego jest zapisywany lokalnie w ustawieniach UI i działa od razu po zmianie.

## Rozmiar tekstu

W panelu „Użytkownik” można zmienić „Rozmiar tekstu”: Mały, Normalny, Duży albo Bardzo duży. Wybór jest zapisywany lokalnie w `sieweczka-ui-settings-v1` i działa od razu bez restartu aplikacji. Ustawienie nie jest synchronizowane z serwerem.

## Automatyczne ID gniazda

Automatyczne ID gniazda jest generowane na podstawie gatunku, daty obserwacji i kolejnego numeru dla danego gatunku w danym dniu:

```text
<speciesCode>-<YYYYMMDD>-<NNN>
```

Przykład:

```text
SOb-20260506-001
```

Pierwszy rekord danego gatunku danego dnia dostaje końcówkę `001`, drugi `002` itd. Inny gatunek tego samego dnia zaczyna od `001`, a ten sam gatunek następnego dnia też zaczyna od `001`.

Pole ID nadal można zmienić ręcznie. Po ręcznej zmianie aplikacja nie nadpisuje ID automatycznie. Przycisk „Wygeneruj ID” wymusza ponowne przeliczenie na podstawie aktualnej daty i gatunku.

## Aktualizacja PWA bez kasowania danych

Po większej zmianie kodu telefon może przez chwilę trzymać starą wersję plików w Service Worker/cache. Nie używaj opcji:
- „Wyczyść dane witryny”;
- „Usuń dane aplikacji”;
- „Resetuj aplikację”;

jeśli na urządzeniu są niesynchronizowane dane.

W panelu „Użytkownik” użyj przycisku „Odśwież wersję aplikacji”. Ten przycisk czyści tylko cache plików programu o nazwach zaczynających się od `sieweczka-` i nie usuwa:
- rekordów lokalnych;
- gniazd roboczych;
- zdjęć lokalnych w IndexedDB;
- ustawień synchronizacji;
- danych logowania.

Po większej zmianie zwiększ:
- `APP_VERSION` w `app.js`;
- `CACHE_NAME` w `sw.js`.

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

Podstawowy podgląd rekordu nie pokazuje dolnej destrukcyjnej sekcji „Więcej”. Ukrywanie/soft delete pozostaje dostępne z listy zapisanych rekordów albo z narzędzi administracyjnych, a nie jako przypadkowa akcja w podglądzie.

Trwałe czyszczenie danych powinno być osobnym narzędziem administracyjnym w przyszłości. Nie udostępniaj zwykłym użytkownikom endpointu, który fizycznie kasuje rekordy lub pliki zdjęć.

## Przywracanie ukrytych wpisów

Usunięcie w aplikacji to soft delete: rekord zostaje w PostgreSQL i w payload, ale ma ustawione pola `deleted_at` / `deletedAt`, `deleted_by` / `deletedBy` oraz opcjonalny powód.

Administrator może wejść w:

```text
Panel administratora → Ukryte wpisy
```

Tam można pobrać listę ukrytych rekordów i przywrócić wybrany rekord. Przywrócenie czyści pola soft delete, aktualizuje `updatedAt`, `updated_by` i `server_updated_at`, a API zapisuje wpis `record_restored` w `audit_log`.

Po kolejnej synchronizacji rekord wróci na innych urządzeniach do normalnej listy i mapy. Ta funkcja nie wykonuje trwałego usuwania danych ani nie usuwa plików zdjęć z `photo-data/`.

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
- `POST /api/me/change-password`
- `GET /api/users`
- `GET /api/admin/deleted-records` (admin)
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/reset-password`
- `POST /api/users/:id/send-invite`
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
- `users.invite_sent_at`, `users.must_change_password`;
- `records.created_by`, `records.updated_by`, `records.deleted_at`, `records.deleted_by`, `records.delete_reason`;
- `working_nests.created_by`, `working_nests.updated_by`, `working_nests.deleted_at`, `working_nests.deleted_by`, `working_nests.delete_reason`;
- `photos.uploaded_by`, `photos.deleted_at`, `photos.deleted_by`, `photos.delete_reason`.

Po aktualizacji wykonaj:

```sh
docker compose up -d --build
```
