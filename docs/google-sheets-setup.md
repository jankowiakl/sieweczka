# Konfiguracja integracji Google Sheets (Sieweczka)

1. Utwórz nowy Google Sheet.
2. Otwórz **Rozszerzenia → Apps Script**.
3. Wklej kod z pliku `docs/google-sheets-webapp.gs`.
4. (Opcjonalnie) ustaw `SECRET_TOKEN`.
5. Kliknij **Deploy → New deployment → Web app**.
6. **Execute as:** Me.
7. **Who has access:** Anyone with the link.
8. Skopiuj URL kończący się na `/exec`.
9. W aplikacji Sieweczka wklej URL do pola **URL Google Apps Script**.
10. Kliknij **Wyślij nowe do Google Sheets**.
11. W Google My Maps zaimportuj arkusz Google (zakładka `Rekordy`).
12. Przy kolejnych aktualizacjach użyj reimportu/scalania po kolumnie `id`.

> Uwaga: Google My Maps zwykle nie aktualizuje się automatycznie natychmiast po zmianie arkusza; w razie potrzeby użyj opcji reimportu/scalania warstwy po kolumnie `id`.
