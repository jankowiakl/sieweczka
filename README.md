# Sieweczka Field App

Lekka aplikacja terenowa (offline-first w przeglądarce) do:

- zapisu gniazd i punktów kontrolnych,
- szybkiego dodawania zdjęć z telefonu,
- notatek siedliskowych,
- eksportu danych (JSON/CSV),
- wygenerowania prostego planu waypointów do lotu drona po wyznaczeniu gniazd i punktów.

## Uruchomienie

To statyczna aplikacja HTML/CSS/JS.

### Opcja 1: otwarcie bez serwera

Otwórz plik `index.html` w przeglądarce.

### Opcja 2: lokalny serwer

```bash
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

## Co zbiera aplikacja

Dla każdego punktu:

- typ: `gniazdo` / `punkt kontrolny`,
- gatunek,
- identyfikator,
- współrzędne GPS (ręcznie lub z przycisku `Pobierz GPS`),
- notatki siedliskowe,
- do 5 zdjęć.

Dane są zapisywane lokalnie w `localStorage` przeglądarki.

## Plan lotu drona

Przycisk **Generuj plan lotu (CSV)** tworzy 4 waypointy wokół każdego punktu (N/E/S/W) na zadanym buforze (domyślnie 15 m) i wysokości (domyślnie 45 m AGL).

To szybki, roboczy plan do dalszego dopracowania w oprogramowaniu UAV.
