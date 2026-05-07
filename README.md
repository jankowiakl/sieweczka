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



## Eksport danych + zdjęć (prosty standard terenowy)

W aplikacji jest jeden główny eksport: **Eksport CSV + zdjęcia**.

Co dostajesz:
1. plik CSV z pełnym zestawem kolumn (1:1 jak w arkuszu/Excel), w tym `nest_photo_refs`, `random_photo_refs`, `all_photo_refs`, oraz gotowe formuły `nest_photo_link` i `random_photo_link` (`HIPERŁĄCZE`) do użycia w Excelu,
2. jeden plik ZIP zawierający CSV i wszystkie zdjęcia JPG.



## Wygląd na różnych telefonach

Android, iPhone, Safari, Chrome, Brave oraz tryb PWA mogą inaczej skalować tekst, ikony, odstępy i przyciski. Aplikacja ogranicza automatyczne powiększanie tekstu na iOS, ale nadal pozwala użytkownikowi korzystać z zoomu przeglądarki.

## Dopasowanie wyglądu

W panelu **Użytkownik** można dostosować lokalny wygląd aplikacji bez zmiany danych terenowych. Dostępne są niezależne ustawienia tekstu, skali interfejsu, przycisków i ikon:

- **Skala interfejsu**: Minimalna, Bardzo kompaktowa, Kompaktowa, Normalna, Wygodna albo Duża. Skala interfejsu zmienia przede wszystkim odstępy, wysokość kart, panele, chipy kroków, miniatury i gęstość formularzy.
- **Rozmiar przycisków**: Minimalne, Bardzo małe, Małe, Normalne, Duże albo Bardzo duże.
- **Rozmiar ikon**: Minimalne, Bardzo małe, Małe, Normalne albo Duże.
- **Rozmiar tekstu**: Minimalny, Bardzo mały, Mały, Normalny, Duży albo Bardzo duży. Zmiana rozmiaru tekstu to nie to samo co skala interfejsu: tekst zmienia litery, a skala interfejsu zmienia układ, karty i odstępy.
- **Szerokość układu**: Pełna, Normalna, Zwężona, Bardzo zwężona albo Minimalna.
- **Układ kafelków**: Automatyczny, Dwie kolumny, Jedna kolumna albo Kompaktowa siatka.

Dostępne presety:

- **Dopasuj do małego ekranu** — zagęszcza UI dla wąskich telefonów.
- **Najmniejszy widok** — ustawia minimalny interfejs, przyciski, ikony i tekst dla sytuacji, gdy trzeba zmieścić jak najwięcej treści.
- **iPhone / wąski ekran** — ustawia minimalną szerokość układu i jedną kolumnę kafelków, gdy aplikację da się przesuwać poziomo.
- **Widok standardowy** — przywraca normalny interfejs, przyciski, ikony i tekst.

Na iPhone o szerokości około 393px warto użyć presetu **iPhone / wąski ekran**, **Najmniejszy widok** albo **Dopasuj do małego ekranu**. Aplikacja automatycznie rozpoznaje wąski widok (`viewport-narrow`) do 430px oraz ciaśniejszy widok (`viewport-tight`) do 395px, aby zmniejszyć menu, karty, formularze, panele pomocy i modale bez czyszczenia danych lokalnych.

W tej samej sekcji jest zwijana **Diagnostyka interfejsu**, która pokazuje wymiary ekranu, `devicePixelRatio`, tryb PWA, wersję aplikacji, aktywny preset, klasy HTML, breakpoint układu i wybrane zmienne CSS, szerokości `scrollWidth` oraz wykryte elementy powodujące poziomy overflow.

## Instrukcja PDF

Aplikacja pokazuje w menu przycisk pobrania instrukcji PDF z pliku:
`instrukcja_terenowa_sieweczka.pdf`

Umieść ten plik w katalogu głównym repo (obok `index.html`), aby link działał na GitHub Pages.

### Poziome przewijanie na iPhone

Na iPhonie aplikacja może mieć węższy viewport CSS niż na części telefonów z Androidem, dlatego pojedynczy długi przycisk, kafelek, pasek kroków albo panel z tekstem może rozpychać stronę i powodować przewijanie całej aplikacji w lewo/prawo.

Jeśli ekran wydaje się za szeroki albo można przesuwać aplikację poziomo:

1. Otwórz **Użytkownik** i użyj presetu **iPhone / wąski ekran**.
2. W razie potrzeby zmień **Szerokość układu** na **Minimalna** albo **Bardzo zwężona**.
3. Zmień **Układ kafelków** na **Jedna kolumna**, jeśli dwie kolumny są za ciasne dla długich etykiet.
4. W sekcji **Diagnostyka interfejsu** kliknij **Sprawdź poziomy overflow**. Diagnostyka pokazuje szerokość okna, `scrollWidth`, różnicę względem viewportu i listę elementów, które wystają poza ekran.

Pasek kroków formularza może przewijać się poziomo wewnątrz własnego obszaru, ale nie powinien zwiększać szerokości całej strony.
