# Synchronizacja Sieweczka (QNAP / Container Station)

Ta gałąź dodaje prostą synchronizację offline-first: aplikacja PWA nadal zapisuje dane lokalnie, a po połączeniu z internetem wysyła rekordy do API, które zapisuje je w PostgreSQL.

## 1. Konfiguracja `.env`

Skopiuj przykład:

```bash
cp .env.example .env
```

Następnie edytuj `.env` i ustaw własne wartości:

```env
POSTGRES_DB=sieweczka
POSTGRES_USER=sieweczka
POSTGRES_PASSWORD=wpisz_tutaj_silne_haslo
DATABASE_URL=postgresql://sieweczka:wpisz_tutaj_silne_haslo@postgres:5432/sieweczka
SYNC_TOKEN=wpisz_tutaj_dlugi_losowy_token
CORS_ORIGIN=http://localhost:8080,https://twoja-domena-aplikacji.example.com
PORT=3000
```

`POSTGRES_PASSWORD` i hasło w `DATABASE_URL` muszą być identyczne. Nie commituj prawdziwego pliku `.env` do repozytorium.

## 2. Uruchomienie lokalne

```bash
docker compose up -d --build
```

Sprawdzenie API bez tokenu:

```bash
curl http://localhost:3000/health
```

Sprawdzenie API z tokenem:

```bash
curl -H "Authorization: Bearer TWOJ_SYNC_TOKEN" http://localhost:3000/api/auth-check
```

## 3. Ustawienia w PWA

W sekcji **Synchronizacja** wpisz bazowy URL API i token.

Przykład lokalny:

```text
http://localhost:3000
```

Przykład przez reverse proxy / HTTPS:

```text
https://sync.twoja-domena.pl
```

Nie dopisuj końcowego `/api`. Aplikacja sama wywołuje `/health`, `/api/auth-check` i `/api/sync`.

## 4. Endpointy

- `GET /health` — prosty healthcheck bez tokenu.
- `GET /api/auth-check` — test połączenia z wymaganym tokenem.
- `GET /api/records?updated_after=...`
- `POST /api/records/bulk`
- `POST /api/sync` (`clientId`, `lastSyncAt`, `records`)

## 5. QNAP / bezpieczeństwo

PostgreSQL nie powinien mieć publicznie wystawionego portu 5432. Wystaw tylko API, najlepiej przez reverse proxy/HTTPS albo używaj synchronizacji wyłącznie w sieci lokalnej/VPN.

Na QNAP w Container Station uruchom aplikację z `compose.yaml`. Jeżeli używasz reverse proxy, kieruj publiczny HTTPS na wewnętrzne API: `http://127.0.0.1:3000` albo odpowiedni adres kontenera/usługi.

## 6. Etap 2: synchronizacja zdjęć

W tej wersji zdjęcia zostają lokalnie w IndexedDB i nie są wysyłane na serwer. W etapie 2 można dodać upload plików do zasobu NAS, mapowanie referencji zdjęć w rekordzie oraz kolejkę ponawiania uploadu.
