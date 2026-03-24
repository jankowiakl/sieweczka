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
