# Sieweczka Field App

Mobilna aplikacja terenowa (offline w przeglądarce telefonu) do szybkiego zbierania danych siedliskowych przy gniazdach sieweczek.

## Najważniejsze funkcje

- formularz protokołu terenowego pod badania sieweczek,
- zapis lokalny (`localStorage`) i eksport CSV/JSON,
- menu opcji pod ikoną `☰` (instalacja i eksport danych),
- automatyczne chowanie górnej belki przy przewijaniu w dół,
- gotowość do instalacji PWA (manifest + service worker + instalacja z poziomu aplikacji),
- notatki per moduł (Identyfikacja / Mikro gniazdo / Mikro punkt losowy / Mezohabitat),
- możliwość usuwania pojedynczych rekordów z listy,
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



## Eksport zdjęć

W menu dostępne są:
- **Eksport Excel (pełne kolumny + linki zdjęć)** – plik `.xls` ze wszystkimi kolumnami danych i nazwami plików zdjęć,
- **Pobierz zdjęcia + arkusz linków** – pobiera CSV mapujący rekord→plik oraz same pliki zdjęć,
- **Eksport pakietu (CSV+zdjęcia JSON)** – dodatkowy plik JSON z przypisaniem zdjęć (data URL) do każdego rekordu (`uid`, `nestId`).


## Jak inne aplikacje rozwiązują eksport danych + zdjęć

Najczęstszy i najprostszy wzorzec (np. AppSheet/Ona/Kobo):
1. **CSV/Excel z metadanymi** (w tym `photo_file_name`),
2. **osobny folder/archiwum zdjęć** z dokładnie tymi samymi nazwami plików,
3. opcjonalnie trzeci plik mapujący `record_id -> photo_file_name`.

W tej aplikacji najbliższy temu workflow to:
- **Eksport Excel (pełne kolumny + linki zdjęć)**,
- **Pobierz zdjęcia + arkusz linków**.

To podejście jest najbardziej kompatybilne z analizą w R/Excel/QGIS i łatwe do przekazania między osobami.
