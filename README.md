# Sieweczka Field App

Mobilna aplikacja terenowa (offline w przeglądarce telefonu) do szybkiego zbierania danych siedliskowych przy gniazdach sieweczek.

## Co zostało zmienione

- usunięto cały moduł związany z planowaniem lotu drona,
- formularz został przebudowany dokładnie pod protokół terenowy:
  - **Identyfikacja** (ID, gatunek, data, godzina, sektor, GPS, liczba jaj, status, renest),
  - **Mikrohabitat gniazda**,
  - **Mikrohabitat punktu losowego 10 m**,
  - **Mezohabitat (bufor 15 m)**,
- dodano układ mobilny (duże pola, łatwe klikanie, przejrzyste sekcje),
- eksport JSON/CSV obejmuje wszystkie zmienne protokołu.

## Uruchomienie

To statyczna aplikacja HTML/CSS/JS.

### Opcja 1: otwarcie bez serwera

Otwórz plik `index.html` w przeglądarce.

### Opcja 2: lokalny serwer

```bash
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

## Praca w terenie na telefonie

- Dane zapisują się lokalnie (`localStorage`) — działają także bez sieci.
- `Pobierz GPS` uzupełnia współrzędne bez przepisywania ręcznego.
- Wpis możesz szybko wyeksportować do CSV lub JSON po zakończeniu dnia terenowego.
