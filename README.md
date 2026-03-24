# Sieweczka Field App

Mobilna aplikacja terenowa (offline w przeglądarce telefonu) do szybkiego zbierania danych siedliskowych przy gniazdach sieweczek.

## Co zostało dodane dla instalacji jako aplikacja

- `manifest.webmanifest` (konfiguracja PWA),
- `sw.js` (service worker do cache/offline),
- ikona PWA w formacie tekstowym SVG (`icons/icon.svg`) — bez plików binarnych,
- rejestracja service workera w `app.js`,
- instrukcja instalacji z `github.io` na Android i iOS.

## Uruchomienie

To statyczna aplikacja HTML/CSS/JS.

### Opcja 1: otwarcie bez serwera

Otwórz plik `index.html` w przeglądarce.

### Opcja 2: lokalny serwer

```bash
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

## Instalacja jako aplikacja po wdrożeniu na github.io

Po opublikowaniu na HTTPS (GitHub Pages):

### Android (Chrome)
1. Otwórz aplikację.
2. Menu `⋮` → **Zainstaluj aplikację** albo **Dodaj do ekranu głównego**.

### iOS (Safari)
1. Otwórz aplikację.
2. Udostępnij → **Dodaj do ekranu początkowego**.

## Praca w terenie na telefonie

- Dane zapisują się lokalnie (`localStorage`) — działają także bez sieci.
- `Pobierz GPS` uzupełnia współrzędne bez przepisywania ręcznego.
- Wpis możesz szybko wyeksportować do CSV lub JSON po zakończeniu dnia terenowego.
