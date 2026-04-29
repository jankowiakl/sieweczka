# Sieweczka Field App — czysta wersja do podmiany

Ten katalog zawiera kompletną, przepisaną od zera wersję aplikacji PWA:

- `index.html`
- `styles.css`
- `app.js`
- `sw.js`
- `manifest.webmanifest`
- `icons/icon.svg`

## Co poprawiono

- Stabilny zapis rekordu bez hotfixów.
- Stabilna edycja istniejących rekordów bez duplikowania.
- Formularz krokowy: 8 kroków.
- Wszystkie główne zmienne z arkusza terenowego:
  - identyfikacja,
  - mikrohabitat gniazda,
  - punkt losowy,
  - mikrohabitat punktu losowego,
  - mezohabitat,
  - kontrola jakości.
- Jednolite procenty we wszystkich grupach: `−5`, pole liczbowe, `+5`.
- Zakres tolerancji sum procentów: 95–105% jako ostrzeżenie jakościowe.
- Eksport CSV, JSON oraz ZIP + zdjęcia, jeśli dostępna jest biblioteka JSZip.
- Zdjęcia przechowywane w IndexedDB.
- Migracja rekordów ze starego klucza localStorage `sieweczka-field-data-v2` do nowego `sieweczka-field-data-v3`.

## Jak wdrożyć

1. Zrób kopię obecnego repozytorium.
2. Usuń lub zastąp stare pliki:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `sw.js`
   - `manifest.webmanifest`
   - katalog `icons/`
3. Wgraj pliki z tego katalogu.
4. Zrób commit i push.
5. Po otwarciu aplikacji w telefonie odśwież stronę kilka razy albo usuń starą zainstalowaną PWA i dodaj ponownie.

## Ważne

Aplikacja ładuje JSZip z CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
```

Jeśli potrzebujesz pełnego ZIP offline, pobierz `jszip.min.js` lokalnie, dodaj go do repo i zmień ścieżkę w `index.html`.

