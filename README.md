# Sieweczka Field App

Mobilna aplikacja terenowa (offline w przeglądarce telefonu) do szybkiego zbierania danych siedliskowych przy gniazdach sieweczek.

## Najważniejsze funkcje

- formularz protokołu terenowego pod badania sieweczek,
- zapis lokalny (`localStorage`) i eksport CSV/JSON,
- menu opcji pod ikoną `☰` (instalacja i eksport danych),
- automatyczne chowanie górnej belki przy przewijaniu w dół,
- gotowość do instalacji PWA (manifest + service worker + instalacja z poziomu aplikacji),
- pełny zestaw zmiennych mikro/mezo:
  - 8 kategorii % pokrycia z foto 1 m² dla gniazda i punktu losowego,
  - odległości/wysokości roślin i obiektów osłony,
  - nachylenie,
  - dystanse strukturalne (woda, krawędź roślinności, struktura pionowa, płaty drobnego i grubszego żwiru, najbliższe gniazda obu gatunków).

## Instalacja aplikacji z github.io

### Android (Chrome)
1. Wejdź na stronę `https://...github.io/...`.
2. Otwórz menu `☰` w aplikacji i kliknij **Zainstaluj aplikację**.
3. Jeśli prompt się nie pokaże, użyj menu Chrome `⋮` → **Zainstaluj aplikację**.

### iOS (Safari)
1. Wejdź na stronę `https://...github.io/...`.
2. Udostępnij → **Dodaj do ekranu początkowego**.

## Lokalny podgląd

```bash
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

## PWABuilder readiness (github.io)

Repo jest przygotowane pod PWABuilder:
- `manifest.webmanifest` ma ustawione `id`, `start_url` i `scope` na `/sieweczka/` (GitHub Pages project site),
- service worker cache’uje app shell i ma fallback na nawigację offline,
- aplikacja ma przycisk "Losuj azymut" dla punktu losowego.


> Uwaga: manifest używa ikon PNG osadzonych jako data URI, więc PR nie zawiera plików binarnych.

## Synchronizacja wielu użytkowników przez Google Drive (Apps Script)

Aplikacja wspiera synchronizację przez **Google Apps Script** zapisujący JSON na Google Drive.

### 1) Utwórz Apps Script

Wklej kod (Code.gs):

```javascript
function doPost(e) {
  const body = JSON.parse(e.postData.contents || "{}");
  const action = body.action || "pull";
  const teamKey = body.teamKey || "default";
  const records = Array.isArray(body.records) ? body.records : [];

  const fileName = `sieweczka-sync-${teamKey}.json`;
  const files = DriveApp.getFilesByName(fileName);
  let file;
  if (files.hasNext()) {
    file = files.next();
  } else {
    file = DriveApp.createFile(fileName, "[]", MimeType.PLAIN_TEXT);
  }

  const current = JSON.parse(file.getBlob().getDataAsString() || "[]");

  if (action === "push") {
    const map = new Map();
    current.forEach((r) => map.set(r.uid || r.createdAt, r));
    records.forEach((r) => map.set(r.uid || r.createdAt, r));
    const merged = Array.from(map.values());
    file.setContent(JSON.stringify(merged));
    return ContentService.createTextOutput(JSON.stringify({ ok: true, records: merged })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, records: current })).setMimeType(ContentService.MimeType.JSON);
}
```

### 2) Deploy

- Deploy → New deployment → Web app
- Execute as: **Me**
- Access: **Anyone with the link**
- Skopiuj URL Web App

### 3) W aplikacji

- Otwórz menu ☰
- Wklej URL do pola **Google Apps Script URL**
- Ustaw **Klucz zespołu** (ten sam dla wszystkich użytkowników)
- Kliknij **Zapisz konfigurację**
- Używaj:
  - **Wyślij synchronizację** (push)
  - **Pobierz synchronizację** (pull)
