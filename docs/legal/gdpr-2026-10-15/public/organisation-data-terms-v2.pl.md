# Warunki przetwarzania danych przez organizacje — LabourMarket.ai

*Dla firm, agencji, szkół i innych organizacji, które rejestrują, przesyłają dane o osobach na platformie lub nimi zarządzają. Obejmują warunki powierzenia przetwarzania danych na podstawie art. 28 RODO.*

> **Status:** DRAFT v2 — 2026-10-15 (projekt)
> **Wymaga weryfikacji prawnika / Requires lawyer review.** Projekt do weryfikacji przez prawnika. Nie jest ostateczny, nie ma jeszcze mocy prawnej, nie został poświadczony.
> **Tłumaczenie z angielskiego projektu; poprawność prawna tego tłumaczenia wymaga odrębnej weryfikacji przez wykwalifikowanego prawnika/tłumacza.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Wykorzystane źródła faktów:**
> - Audyt z 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §2 (tryby REASSIGN / RETAIN dla rekordów organizacji), §3.2 (tabele wyłącznie do dopisywania i z łańcuchem skrótów (hash)), §3.3 (stanowisko robocze: organizacja dostarczająca jest administratorem swoich rekordów, platforma — podmiotem przetwarzającym tę kopię i administratorem dodawanego przez nią dopasowywania i powiązań; dowody `organization_person_id` NO ACTION; wiersze przejściowe pozostają)
> - `03-rights-consent-legal-pages.md` §3, §4, §7 (brak wyznaczenia administratora, brak DPA, brak oświadczenia przy imporcie; dostęp do odczytu dla organizacji importującej i organizacji będących stronami; korekty wyłącznie przez dopisanie, jedna na rekord; kwestionowanie przez osobę po powiązaniu; podwójna rola Nonstop Group)
> - `02-processors-transfers-cookies-ai.md` §1 wiersz 14 i D4 (asystenci MCP podłączeni przez pracodawców otrzymują dane pracowników); §4 (automatyczne dopasowywanie, ranking, `apply_learning_auto_confirmation`)
> - `docs/legal/legal-basis-matrix-v1.md` (widoczność oparta na relacjach); `entity-role-and-data-access-matrix-v1.md`; `subprocessor-register-v2.md`
>
> **Otwarte decyzje:**
> 1. [OPEN DECISION / LAWYER: rola w odniesieniu do każdej czynności — tabela §2. Fakty tego nie przesądzają]
> 2. [OWNER DECISION: dodać krok oświadczenia przy imporcie (podstawa prawna + potwierdzone przekazanie informacji z art. 14), zanim organizacja będzie mogła importować dane osób. Obecnie taki krok nie istnieje]
> 3. [OWNER DECISION: ścieżka usuwania i zaczerniania dla rekordów dowodowych prowadzonych wyłącznie w trybie dopisywania i z łańcuchem skrótów; kolejność usuwania (dowody przed osobą z listy personelu)]
> 4. [OWNER DECISION: termin powiadomienia o zmianie dalszego podmiotu przetwarzającego (§7.6)]
> 5. [OWNER DECISION: termin zawiadomienia organizacji o naruszeniu (§7.8)]
> 6. [OWNER DECISION: format eksportu i termin usunięcia po zakończeniu umowy (§7.10)]
> 7. [OWNER DECISION: termin, w którym organizacje muszą odpowiedzieć na zakwestionowanie lub przekazane żądanie]
> 8. [LAWYER: odpowiedzialność i zwolnienie z odpowiedzialności (§9)]
> 9. [OWNER/LAWYER: czy organizacje mogą podłączać zewnętrznych asystentów AI z dostępem do danych o nieobecnościach pracowników i treści dzienników, czy też narzędzia te są ograniczone (audyt D4)]
> 10. [OWNER/LAWYER: sposób akceptacji niniejszych warunków (akceptacja kliknięciem przy tworzeniu organizacji lub imporcie albo podpisana DPA) — obecnie nic nie jest rejestrowane]
> 11. [OWNER/LAWYER: podstawa z art. 9 ust. 2 lit. b i minimalizacja w odniesieniu do treści przyczyn nieobecności przechowywanych przez pracodawców]

---

## 1. Dla kogo są niniejsze warunki

- Niniejsze warunki mają zastosowanie do każdej organizacji (firmy, agencji zatrudnienia, szkoły lub innego podmiotu), która korzysta z platformy LabourMarket.ai w celu:
  - rejestrowania, importowania lub przesyłania danych o osobach: personelu, byłym personelu, pracownikach, kandydatach, uczących się, osobach kontaktowych klientów;
  - zarządzania pracą osób za pomocą projektów, list personelu, rezerwacji, kart czasu pracy, nieobecności, przeglądów dzienników i potwierdzeń.
- Platformę prowadzi **UAB „Nonstop Group“** (kod przedsiębiorstwa 302676973, Litwa), zwana tu „my”. Organizacja jest określana jako „Ty”.
- Niniejsze warunki uzupełniają Regulamin świadczenia usług i Politykę prywatności. W razie sprzeczności w zakresie danych osobowych pierwszeństwo w odniesieniu do działalności organizacji mają niniejsze warunki.

## 2. Kto za co odpowiada

Tabela przedstawia nasze stanowisko robocze. **Tam, gdzie wskazano OPEN DECISION, rola nie została jeszcze ustalona.** [LAWYER: potwierdzić każdy wiersz. Rozważyć współadministrowanie na podstawie art. 26 tam, gdzie cele ustalają obie strony.]

| Czynność | Twoja rola | Nasza rola | Status |
|---|---|---|---|
| Twoje własne rekordy dotyczące osób: listy personelu, zaimportowana historia pracy, rekordy dowodowe, rekordy projektów i pracy, przesyłane przez Ciebie dokumenty | **Administrator** | **Podmiot przetwarzający** (hostujemy je i przetwarzamy na Twoje polecenie, §7) | OPEN DECISION — stanowisko robocze w audycie 01 §3.3 |
| Ewidencja czasu pracy, karty czasu pracy, rekordy nieobecności i plany pracy Twojego personelu | **Administrator** (obowiązki pracodawcy) | **Podmiot przetwarzający** | OPEN DECISION |
| Przegląd i potwierdzanie wpisów w dzienniku pracownika; reguły potwierdzania, które automatycznie potwierdzają umiejętności | **Administrator** Twojego potwierdzenia | **Administrator** własnego dziennika pracownika | OPEN DECISION — rekord dotyczy dwóch osób |
| Powiązanie osoby z listy personelu z kontem na platformie; wyprowadzanie sygnałów dotyczących umiejętności z Twoich rekordów | — | **Administrator** (nasz własny cel) | OPEN DECISION: lub współadministrowanie (art. 26) |
| Dopasowywanie i ranking pracowników do opublikowanych przez Ciebie potrzeb | **Administrator** Twoich decyzji o wyborze | **Administrator** usługi dopasowywania | OPEN DECISION: lub współadministrowanie (art. 26) |
| Dane, które pracownik ujawnia Ci za zgodą (dane kontaktowe, CV) | **Niezależny administrator** po ich otrzymaniu | **Administrator** do momentu przekazania | stanowisko robocze w `legal-basis-matrix-v1.md` |
| Podłączenie Twojego własnego asystenta AI (ChatGPT, Claude) do platformy | **Administrator**: to Ty decydujesz o przesyłaniu danych temu dostawcy | zapewniamy dostęp w granicach uprawnień Twoich użytkowników | OPEN DECISION — audyt D4 |
| Rozliczenia za Twój plan | klient | **Administrator** | ustalone |

W ramach UAB „Nonstop Group“ działalność rekrutacyjna jest oddzielona od prowadzenia platformy. Otrzymuje ona dane z platformy wyłącznie wtedy, gdy poprosi o to pracownik (Polityka prywatności, cel 7).

## 3. Twoje obowiązki jako administratora

Rejestrując lub przesyłając dane o osobach, musisz spełniać poniższe wymogi.

1. **Posiadać podstawę prawną** (art. 6 RODO) dla każdego rekordu. Jeżeli w grę wchodzą dane szczególnej kategorii (na przykład informacje o zdrowiu w przyczynie nieobecności), potrzebujesz również przesłanki z art. 9, takiej jak prawo pracy na podstawie art. 9 ust. 2 lit. b. [LAWYER]
2. **Informować osoby** (art. 13 i 14). Poinformuj je, że ich dane znajdują się na platformie, dlaczego, oraz jak mogą wykonywać swoje prawa — najpóźniej w ciągu miesiąca (art. 14 ust. 3).
   - W zakresie dotyczącym platformy możesz odesłać je do naszej **„Informacji dla osób nieposiadających konta”**.
   - Informacja ta nie zastępuje Twojej własnej informacji. [OWNER DECISION: czy udostępniamy gotowy wzór]
3. **Przestrzegać minimalizacji** (art. 5 ust. 1 lit. c):
   - Rejestruj wyłącznie to, czego wymaga cel.
   - Nie przesyłaj dokumentów tożsamości, informacji o zdrowiu, krajowych numerów identyfikacyjnych ani danych bankowych, chyba że wymaga tego funkcja i masz podstawę prawną.
   - Przyczyny nieobecności formułuj krótko i rzeczowo.
4. **Dbać o prawidłowość** (art. 5 ust. 1 lit. d). Odpowiadasz za prawidłowość tego, co rejestrujesz i importujesz. Niezwłocznie poprawiaj błędy (§5).
5. **Wyłącznie upoważnieni użytkownicy.** W Twoim imieniu mogą działać wyłącznie osoby, które upoważniłeś(-aś). Odpowiadasz za to, co robią one w Twoim imieniu, w tym za importy i potwierdzenia.
6. **Strony wskazane w rekordach.** Jeżeli wskazujesz inną organizację jako stronę rekordu (na przykład klienta projektu), jej kierownicy mogą odczytać ten rekord. Wskazuj stronę tylko wtedy, gdy masz prawo udostępnić jej rekord.
7. **Małoletni.** Nie rejestruj danych dotyczących dzieci, chyba że masz podstawę prawną i zapewniony jest wymagany udział rodziców. [OWNER DECISION: zasady dla szkół dodających uczniów będących małoletnimi]
8. **Asystenci AI.** Jeżeli podłączasz zewnętrznego asystenta AI, to Ty decydujesz o przesyłaniu danych temu dostawcy. Musisz mieć podstawę prawną i umowę z tym dostawcą. Nie używaj go do przetwarzania przyczyn nieobecności ani innych wrażliwych treści, chyba że masz do tego prawo. [OWNER/LAWYER: ograniczyć narzędzia]
9. **Żadnych niezwiązanych celów.** Nie wykorzystuj danych z platformy do niezwiązanych celów i nie eksportuj ich masowo do innych systemów bez podstawy prawnej.

## 4. Kto może zobaczyć Twoje rekordy na platformie

- Kierownicy Twojej organizacji.
- Kierownicy organizacji, które wskazujesz w rekordzie jako stronę.
- Nasz upoważniony personel operatorski — wyłącznie w zakresie niezbędnym do prowadzenia, wspierania i zabezpieczania usługi.

Twoje rekordy **nie** są pokazywane innym pracodawcom wyszukującym kandydatów. Osoba, której dotyczy Twój rekord, widzi go dopiero po powiązaniu swojego konta za pośrednictwem wysłanego przez Ciebie zaproszenia.

## 5. Prawidłowość, korekty i kwestionowanie

- Rekordy są prowadzone **wyłącznie w trybie dopisywania**: nie można ich edytować w miejscu. Aby poprawić rekord, dodaj korektę. Każdy rekord może mieć jedną korektę. Pozwala to zachować rzetelną historię.
- Osoba, której konto jest powiązane z Twoim rekordem, może go **zakwestionować**, a także wycofać zakwestionowanie.
- Po otrzymaniu zakwestionowania rozpatrz je i odpowiedz tej osobie. [OWNER DECISION: termin]
- Możemy oznaczyć rekord jako zakwestionowany. Nie rozstrzygamy, kto ma rację, chyba że wymaga tego prawo.
- [OWNER DECISION: usuwanie lub zaczernianie rekordów prowadzonych wyłącznie w trybie dopisywania. Obecnie osoby z listy personelu nie można usunąć, dopóki istnieją rekordy dowodowe, a rekordów dowodowych nie można usunąć z poziomu produktu.]

## 6. Żądania osób, których dane dotyczą

- Jeżeli osoba zwraca się **do Ciebie** w sprawie danych na platformie, to Ty jej odpowiadasz. Pomagamy Ci w sposób opisany w §7.7.
- Jeżeli osoba zwraca się **do nas** w sprawie Twoich rekordów, informujemy ją, że administratorem jesteś Ty, i przekazujemy Ci żądanie, chyba że prawo stanowi inaczej. Następnie odpowiadasz w terminie przewidzianym w RODO (art. 12 ust. 3: jeden miesiąc, z możliwością przedłużenia).
- W odniesieniu do własnych danych platformy (powiązania, wyprowadzone sygnały, dopasowywanie) odpowiadamy osobie sami.

## 7. Warunki powierzenia przetwarzania danych (art. 28 RODO)

Niniejsza sekcja ma zastosowanie, gdy działamy jako **Twój podmiot przetwarzający** (zob. §2).

1. **Przedmiot i czas trwania.** Hostowanie i przetwarzanie Twoich rekordów na platformie przez cały okres korzystania przez Ciebie z platformy i do czasu usunięcia zgodnie z §7.10.
2. **Charakter i cel.** Przechowywanie, wyświetlanie Twoim upoważnionym użytkownikom i wskazanym przez Ciebie stronom, wyszukiwanie, eksport, przetwarzanie importów oraz funkcje, z których korzystasz.
3. **Rodzaje danych.** Imiona i nazwiska oraz identyfikatory; opisy pracy, daty, miejsca i adresy; ewidencja czasu pracy, karty czasu pracy i rekordy nieobecności; poświadczenia i potwierdzenia; przesyłane przez Ciebie dokumenty i zdjęcia; notatki.
4. **Osoby, których dane dotyczą.** Twój personel, byli pracownicy, pracownicy, kandydaci, uczący się oraz osoby kontaktowe Twoich klientów.
5. **Polecenia.** Przetwarzamy dane wyłącznie na Twoje udokumentowane polecenie. Korzystanie przez Ciebie z funkcji i ustawień platformy stanowi Twoje polecenie. Nie przetwarzamy danych do własnych celów, z wyjątkiem czynności administratora wskazanych w §2 lub gdy wymaga tego prawo Unii lub prawo państwa członkowskiego; jeżeli wymaga tego prawo, najpierw Cię o tym informujemy, chyba że prawo tego zabrania (art. 28 ust. 3 lit. a).
6. **Dalsze podmioty przetwarzające.** Udzielasz ogólnej zgody na dalsze podmioty przetwarzające, które mają styczność z Twoimi rekordami:
   - Supabase (baza danych i przechowywanie plików, UE);
   - Vercel (hosting i funkcje serwerowe);
   - GitHub (zadania automatyczne z technicznym dostępem do danych produkcyjnych).

   Pełna lista dostawców znajduje się w Polityce prywatności, §6. [LAWYER/OWNER: potwierdzić, czy Hostinger (korespondencja dotycząca żądań) powinien znaleźć się na tej liście]

   Informujemy Cię [OWNER DECISION: np. 30 dni] przed dodaniem lub zastąpieniem dalszego podmiotu przetwarzającego. Możesz wnieść sprzeciw z uzasadnionych przyczyn dotyczących ochrony danych. Nakładamy na każdy dalszy podmiot przetwarzający obowiązki w zakresie ochrony danych równoważne niniejszym (art. 28 ust. 2 i 4). [LAWYER/OWNER: umowy DPA z poszczególnymi dalszymi podmiotami przetwarzającymi nie są jeszcze udokumentowane]
7. **Pomoc.** Uwzględniając możliwości naszych systemów, pomagamy Ci:
   - odpowiadać na żądania osób (art. 15–22);
   - wywiązywać się z Twoich obowiązków w zakresie bezpieczeństwa, zgłaszania naruszeń, oceny skutków dla ochrony danych (DPIA) i uprzednich konsultacji (art. 32–36).
8. **Naruszenia ochrony danych osobowych.** Informujemy Cię o naruszeniu dotyczącym Twoich rekordów bez zbędnej zwłoki po jego stwierdzeniu [OWNER DECISION: np. w ciągu 48 godzin]. Przekazujemy posiadane przez nas informacje, których potrzebujesz na podstawie art. 33 ust. 3.
9. **Poufność i bezpieczeństwo.** Osoby mające dostęp do danych są zobowiązane do zachowania poufności. Nasze środki bezpieczeństwa (art. 32):
   - zasady dostępu egzekwowane w samej bazie danych i objęte testami automatycznymi;
   - prywatny magazyn plików z linkami o krótkim okresie ważności;
   - rekordy audytu i zgód prowadzone wyłącznie w trybie dopisywania;
   - dostęp administratorów systemu ograniczony do niewielkiej liczby osób.

   [OWNER/LAWYER: formalny opis środków technicznych i organizacyjnych jest w przygotowaniu]
10. **Zakończenie umowy.** Gdy przestajesz korzystać z platformy, możesz wyeksportować swoje rekordy. Następnie je usuwamy, chyba że prawo Unii lub prawo państwa członkowskiego nakazuje ich przechowywanie. [OWNER DECISION: format eksportu i termin usunięcia. Uwzględnić ograniczenie techniczne opisane w §5]
11. **Przekazywanie.** Dane są hostowane w UE. Jeżeli dalszy podmiot przetwarzający przetwarza dane poza EOG, musi mieć zastosowanie mechanizm przekazywania zgodny z art. 44–49. [LAWYER/OWNER: potwierdzić dla każdego dostawcy — żaden nie jest jeszcze udokumentowany]
12. **Informacje i audyty.** Udostępniamy Ci informacje niezbędne do wykazania przestrzegania niniejszej sekcji. Umożliwiamy przeprowadzanie przez Ciebie lub Twojego audytora rozsądnych audytów i przyczyniamy się do nich, z zachowaniem rozsądnego terminu uprzedzenia i poufności (art. 28 ust. 3 lit. h).
13. **Rejestr.** Prowadzimy rejestr kategorii czynności przetwarzania jako podmiot przetwarzający (art. 30 ust. 2).

## 8. Kiedy jesteśmy administratorem

W odniesieniu do czynności oznaczonych w §2 jako nasze jesteśmy administratorem zgodnie z naszą Polityką prywatności. Jeżeli czynności te opierają się na Twoich rekordach (na przykład powiązania lub dopasowywanie), potwierdzasz, że możesz udostępniać nam te rekordy w tych celach. [LAWYER]

## 9. Odpowiedzialność

[LAWYER: podział odpowiedzialności między organizacją a UAB „Nonstop Group“ na podstawie art. 82 RODO; zwolnienie z odpowiedzialności w przypadku niezgodnego z prawem przesyłania danych; limity spójne z Regulaminem świadczenia usług]

## 10. Zmiany, akceptacja i prawo właściwe

- [OWNER/LAWYER: sposób akceptacji i rejestrowania niniejszych warunków]
- Przed zastosowaniem istotnych zmian informujemy Cię o nich. [OWNER DECISION: termin powiadomienia]
- Zastosowanie ma prawo litewskie, a o właściwości w sprawach sporów decyduje Regulamin świadczenia usług.
- Wersja **v2 (projekt), 2026-10-15**.

## 11. Kontakt

info@labourmarket.ai — UAB „Nonstop Group“, Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litwa. Nie wyznaczono inspektora ochrony danych.
