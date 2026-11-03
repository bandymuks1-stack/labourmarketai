# Polityka prywatności — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15 (projekt)
> **Wymaga weryfikacji prawnika / Requires lawyer review.** Jest to projekt do weryfikacji przez prawnika. Nie jest ostateczny, nie ma jeszcze mocy prawnej i nie został przez nikogo poświadczony.
> **Tłumaczenie z angielskiego projektu; poprawność prawna tego tłumaczenia wymaga odrębnej weryfikacji przez wykwalifikowanego prawnika/tłumacza.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Wykorzystane źródła faktów (i tylko one):**
> - Audyt z 2026-10-15: `gdpr-2026-10-15/audit/01-personal-data-inventory-and-erasure-classes.md`, `02-processors-transfers-cookies-ai.md`, `03-rights-consent-legal-pages.md`
> - `docs/legal/`: `corporate-identity-source-of-truth-v1.md`, `legal-basis-matrix-v1.md`, `data-retention-matrix-v1.md`, `retention-decision-package-v1.md`, `processing-activities-register-v1.md`, `subprocessor-register-v2.md`, `entity-role-and-data-access-matrix-v1.md`, `dpo-requirement-assessment-v1.md`, `consent-copy-register-v1.md`, `deletion-process-design-v1.md`, `privacy-risk-and-dpia-screening-v1.md`
> - Obecnie opublikowany tekst: `apps/web/messages/en.json` → `legal.*`; `apps/web/lib/privacy/consent-definitions.ts`; `apps/web/lib/billing/plans.ts`
>
> **Otwarte decyzje (muszą zostać zamknięte przed publikacją):**
> 1. [OWNER DECISION: okresy przechowywania dla każdej klasy danych — decyzje 1, 2, 3, 3b pakietu A nie zostały zatwierdzone; każdy okres w §9 jest propozycją]
> 2. [OWNER DECISION: baner zgody dla magazynu analitycznego ALBO uczynienie telemetrii niezbędną / wyłącznie zagregowaną. Obecnie dane analityczne są zapisywane bez zgody]
> 3. [OWNER DECISION: minimalny wiek (16 lub 18 lat) oraz zasada dla uczących się / studentów]
> 4. [OWNER DECISION: kanał składania żądań dla osób bez konta]
> 5. [OWNER DECISION: Gemini — potwierdzić płatny plan przed ponownym włączeniem zadań z danymi osobowymi; do tego czasu niniejsza polityka stwierdza, że są one wyłączone]
> 6. [LAWYER/OWNER: potwierdzić mechanizm przekazywania (SCC / ramy ochrony danych UE–USA / decyzja stwierdzająca odpowiedni stopień ochrony) dla każdego dostawcy — w repozytorium żaden nie jest udokumentowany]
> 7. [LAWYER/OWNER: potwierdzić, że umowy powierzenia przetwarzania danych (DPA) zostały zaakceptowane z Supabase, Vercel, Stripe, Resend, Hostinger, GitHub]
> 8. [LAWYER: podstawa prawna dla każdego celu (tabela §4) — wyłącznie robocze przyporządkowanie]
> 9. [LAWYER: rola organizacji przesyłających dane osób — zob. `organisation-data-terms-v2`, gdzie wskazano to jako OPEN DECISION, w tym współadministrowanie na podstawie art. 26]
> 10. [OWNER/LAWYER: DPIA dla automatycznego dopasowywania i rankingu kandydatów — próg został już przekroczony, brak DPIA w dokumentacji]
> 11. [OWNER: potwierdzić, czy w środowisku produkcyjnym włączone są punkt przekazania do Nonstop Group (`NONSTOP_HANDOFF_ENDPOINT`), powiadomienia właściciela przez Telegram oraz mostek powiadomień Agentai OS]
> 12. [OWNER: wskazać dostawcę „infrastruktury partnerskiej” dla partnerskiej sieci możliwości]
>
> **[INTERNAL — remove before publication / WEWNĘTRZNE — usunąć przed publikacją]**
> - [OWNER/LAWYER: oczekuje na ocenę wcześniejszego przetwarzania w planie bezpłatnym] Od 2026-08-28 do #2399 treść wiadomości i zdania wpisywane na czacie były wysyłane do Gemini bez dowodu korzystania z płatnego planu. Niniejsza polityka NIE opisuje tego okresu jako faktu. Wymagana jest decyzja w sprawie oceny naruszenia / art. 33–34.
> - RESOLVED (ROZWIĄZANE) 2026-10-15: 2 rekordy `extract_cv` i 13 rekordów `translate_vacancy` nigdy nie dotarły do Gemini (odmowa bramki ruchu wychodzącego, brak tokenów). `data_categories_sent` rejestruje zamierzone, a nie faktycznie wysłane kategorie. §8 w obecnym brzmieniu jest zgodny z bieżącym działaniem. Wcześniejsze przetwarzanie (145 tłumaczeń wiadomości 2026-09-28→10-09, 79 wywołań rozumienia czatu 2026-09-05→10-14) jest przedmiotem wewnętrznej oceny (INC-2026-001), a nie tekstem do publikacji.
> - Usunąć z działających stron stwierdzenia „płatności nie są aktywne”, „nie tworzy profili behawioralnych”, „brak analityki” oraz „Gemini tłumaczy ogłoszenia o pracę”. Punkty audytu D1, D5, D10 i L7 wykazują, że są one nieprawdziwe.
> - Imię i nazwisko dyrektora nie może pojawić się w tekście publicznym, dopóki nie zostanie zweryfikowane (`corporate-identity-source-of-truth-v1.md` §4 nr 2).

---

## 1. Kim jesteśmy i jak się z nami skontaktować

Administratorem platformy LabourMarket.ai jest:

**UAB „Nonstop Group“**
Kod przedsiębiorstwa 302676973, numer VAT LT100010790613
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litwa

- Kontakt w sprawach prywatności: **info@labourmarket.ai**. Jest to skrzynka pocztowa. Nie jest to inspektor ochrony danych.
- **Nie wyznaczono inspektora ochrony danych (IOD).** Nasza ocena na podstawie art. 37 RODO wykazała, że obecnie nie jest on wymagany. [LAWYER: przeprowadzić ponowną ocenę — obecnie działa automatyczne dopasowywanie, co stanowi przesłankę ponownej oceny zgodnie z `dpo-requirement-assessment-v1.md` §5]
- „LabourMarket.ai” to nazwa platformy. Nie jest to spółka.
- **Labour Market AI Sp. z o.o.** (Warszawa, Polska) jest właścicielem oprogramowania i marki i udziela na nie licencji UAB „Nonstop Group“. Nie jest administratorem ani podmiotem przetwarzającym Twoje dane. Nie ma rutynowego dostępu do produkcyjnej bazy danych, profili, CV, kontaktów ani dokumentów.

## 2. Nasza rola i rola organizacji

Możliwe są trzy sytuacje. To one decydują o tym, kto odpowiada za Twoje dane.

| Sytuacja | Kto decyduje o danych | Nasza rola |
|---|---|---|
| Twoje własne konto, profil, Żywe CV, dziennik pracy, zgody, wiadomości, dopasowywanie i własne funkcje platformy | UAB „Nonstop Group“ | **Administrator** |
| Rekordy, które firma, agencja lub szkoła tworzy lub przesyła na temat osób (na przykład lista personelu, zaimportowana historia pracy, rekordy projektów, rekordy nieobecności lub czasu pracy) | Ta organizacja, na potrzeby własnych rekordów | Zazwyczaj **podmiot przetwarzający** dla organizacji (art. 28 RODO). Pozostajemy **administratorem** w zakresie tego, co platforma dodaje sama, np. powiązania rekordu z kontem lub dopasowywania. [LAWYER: potwierdzić dla każdej czynności — zob. `organisation-data-terms-v2`, gdzie wskazano to jako OPEN DECISION, w tym współadministrowanie na podstawie art. 26] |
| Dane, które postanawiasz przekazać gdzie indziej (Twój własny asystent AI, Twoje konto Google, pracodawca, który otrzymał Twoje dane za Twoją zgodą) | Odbiorca, na potrzeby własnego przetwarzania | Nie odpowiadamy za własne wykorzystanie danych przez odbiorcę |

Jeżeli administratorem jest organizacja, musi ona poinformować Cię o swoim przetwarzaniu. Nadal możesz skontaktować się z nami; przekażemy Twoje żądanie dalej lub wskażemy, z kim się skontaktować.

## 3. Czyich danych dotyczy niniejsza polityka

- **Osoby posiadające konto:** pracownicy, osoby poszukujące pracy, uczący się oraz osoby korzystające z platformy w imieniu firmy, agencji lub szkoły.
- **Osoby nieposiadające konta**, których dane trafiają na platformę:
  - osoby, których historię pracy zarejestrowała lub zaimportowała organizacja;
  - osoby kontaktowe wskazane w publicznych ogłoszeniach o pracę;
  - osoby kontaktowe w zapytaniach biznesowych (na przykład w zapytaniu o potrzebę firmy);
  - osoby zaproszone e-mailem, które jeszcze nie dołączyły.

  Dla osób bez konta przygotowano odrębną informację: **„Informacja dla osób nieposiadających konta”**.
- **Odwiedzający** publiczną stronę internetową (dane techniczne, zob. Politykę plików cookie i pamięci przeglądarki).

## 4. Do czego wykorzystujemy dane i na jakiej podstawie prawnej

Podstawy prawne to podstawy z art. 6 ust. 1 RODO: lit. a zgoda, lit. b umowa, lit. c obowiązek prawny, lit. f prawnie uzasadnione interesy. [LAWYER: potwierdzić każdy wiersz]

Kolumna „Okres przechowywania” wskazuje obecną zasadę; proponowane okresy zawiera §9. „Podmioty przetwarzające” oznaczają naszych usługodawców wymienionych w §6.

| Nr | Cel | Dane | Podstawa prawna | Źródło | Okres przechowywania | Odbiorcy |
|---|---|---|---|---|---|---|
| 1 | Utworzenie i prowadzenie Twojego konta; logowanie | adres e-mail, tożsamość logowania, język. Przy logowaniu przez Google: imię i nazwisko, adres e-mail, link do zdjęcia profilowego, identyfikator konta Google | art. 6 ust. 1 lit. b | Ty; Google | do usunięcia konta | podmioty przetwarzające (Supabase; Resend i Amazon SES dla wiadomości e-mail związanych z logowaniem) |
| 2 | Twój profil i Żywe CV | zawód, umiejętności, doświadczenie, wykształcenie, osiągnięcia, języki, dostępność, oczekiwane wynagrodzenie (jeśli zostało podane), awatar, linki do profili zewnętrznych, lista dokumentów | art. 6 ust. 1 lit. b | Ty | do usunięcia konta | podmioty przetwarzające; inni wyłącznie w ramach celów 4, 5, 6, 8 |
| 3 | Dziennik pracy i rekordy pracy | wpisy w dzienniku (tekst, zdjęcia, wskaźniki), godziny, karty czasu pracy, plany pracy, zadania, nieobecności | art. 6 ust. 1 lit. b. Jeżeli pracodawca prowadzi ewidencję czasu pracy lub nieobecności, pracodawca jest administratorem w ramach własnych obowiązków prawnych (art. 6 ust. 1 lit. c) | Ty; Twoja organizacja | do usunięcia konta; rekordy pracodawcy — zob. §9 | kierownicy organizacji, do której należy praca; podmioty przetwarzające |
| 4 | Umożliwienie firmom i agencjom znalezienia ograniczonego podsumowania zawodowego | wyświetlana nazwa, zawód, doświadczenie, umiejętności, przybliżony region, dostępność, języki, oczekiwane wynagrodzenie (tylko jeśli zostało podane) | **art. 6 ust. 1 lit. a — zgoda** („widoczność profilu”), opt-in | Ty | do wycofania zgody | zarejestrowane firmy i agencje |
| 5 | Przesłanie Twoich danych kontaktowych, CV lub wybranych pól **jednej** wskazanej firmie w związku z jedną potrzebą | wyłącznie zatwierdzone przez Ciebie pola | **art. 6 ust. 1 lit. a — zgoda** („przekazanie firmie”) | Ty | rekord przekazania: §9 | wyłącznie ta firma |
| 6 | Wyświetlanie Twojej dostępności w partnerskiej sieci możliwości, która szuka pracy również poza tą platformą | nieprzejrzysty identyfikator i wyłącznie atrybuty zawodowe: bez imienia i nazwiska, adresu e-mail, telefonu, adresu, pliku CV ani treści dziennika. Dane spseudonimizowane, a nie anonimowe | **art. 6 ust. 1 lit. a — zgoda** („sieć partnerska”) | Ty | odtwarzane przy każdej aktualizacji; usuwane przy pierwszej aktualizacji po wycofaniu zgody | infrastruktura partnerska działająca na nasze polecenie [OWNER: wskazać dostawcę] |
| 7 | Przekazanie Twojego zainteresowania ofertą pracy do usługi rekrutacyjnej Nonstop Group, gdy o to poprosisz | fakty z dozwolonej listy, których wymaga oferta | art. 6 ust. 1 lit. a — zgoda wyrażona na tym etapie [LAWYER: lub art. 6 ust. 1 lit. b] | Ty | [OWNER DECISION] | usługa rekrutacyjna UAB „Nonstop Group“ |
| 8 | Zaakceptowane przez Ciebie relacje zawodowe (lista personelu lub zespół, rezerwacje, zlecenia, projekty) | podsumowanie zawodowe; wpisy w dzienniku w ramach danego zlecenia | art. 6 ust. 1 lit. b; art. 6 ust. 1 lit. f w zakresie koordynacji przez organizację | Ty; organizacja | dopóki relacja trwa; rekordy — zob. §9 | osoby odpowiedzialne w tej organizacji |
| 9 | Dopasowywanie i rekomendacje (zob. §8) | dane zawodowe, dostępność, region, dowody w Twoim rekordzie | art. 6 ust. 1 lit. b dla rekomendacji kierowanych do Ciebie; art. 6 ust. 1 lit. f dla rankingu pokazywanego pracodawcom, **wyłącznie wśród osób, które włączyły widoczność** [LAWYER] | platforma | przeliczane na nowo; potwierdzenia dopasowań przechowują wyłącznie liczby i odniesienia | Ty; pracodawcy (tylko przy włączonej widoczności) |
| 10 | Dopasowywanie przez ludzi — nasz zespół operatorów | imiona i nazwiska oraz dane zawodowe w wewnętrznej puli. Nic nie wychodzi na zewnątrz bez Twojej zgody | art. 6 ust. 1 lit. f | platforma | dopóki istnieje konto | wyłącznie nasz zespół operatorów |
| 11 | Wiadomości między użytkownikami | treść wiadomości, załączniki, wyświetlana nazwa drugiej osoby | art. 6 ust. 1 lit. b | Ty; druga osoba | przechowywane (§9) | uczestnicy rozmowy; podmioty przetwarzające |
| 12 | Wykazanie zgód i przekazań danych (art. 7 ust. 1, art. 5 ust. 2) | zdarzenia zgody (cel, wersja i skrót (hash) tekstu, język, czas), rekordy ujawnień. **Bez adresu IP i danych przeglądarki** | art. 6 ust. 1 lit. c i lit. f | platforma | nie podlegają edycji (§9) | Ty; organy, jeśli jest to wymagane |
| 13 | Obsługa żądań dotyczących prywatności | żądanie i nasze notatki z jego obsługi | art. 6 ust. 1 lit. c | Ty | §9 | nasz zespół ds. prywatności; podmioty przetwarzające |
| 14 | Rekordy, które organizacja prowadzi na Twój temat (np. zaimportowana historia pracy) | imię i nazwisko w zapisie organizacji, jej identyfikator, opisy pracy, daty, miejsca, poświadczenia | własna podstawa organizacji (jest ona administratorem). Nasze powiązanie i dopasowywanie: art. 6 ust. 1 lit. f [LAWYER] | organizacja | decyduje organizacja | kierownicy tej organizacji oraz organizacji wskazanych w rekordzie jako strona |
| 15 | Publiczne ogłoszenia o pracę | nazwa pracodawcy, numer organizacji, treść ogłoszenia, w której może być wskazana osoba kontaktowa z adresem e-mail lub telefonem | art. 6 ust. 1 lit. f: prezentowanie dostępnej pracy [LAWYER: art. 14 ust. 5 lit. b] | szwedzkie i norweskie publiczne służby zatrudnienia | dopóki ogłoszenie jest aktywne; usunięte ogłoszenia są ukrywane (§9) | wszyscy zalogowani użytkownicy |
| 16 | Zapytania biznesowe i powiadomienia właściciela | nazwa firmy, osoba kontaktowa, szczegóły potrzeby | art. 6 ust. 1 lit. b — działania przed zawarciem umowy / art. 6 ust. 1 lit. f | zapytujący | [OWNER DECISION] | nasz zespół; kanał powiadomień właściciela, jeśli jest włączony |
| 17 | Płatne plany dla organizacji i fakturowanie | adres e-mail i imię i nazwisko osoby kontaktowej ds. rozliczeń, **adres rozliczeniowy, numer VAT lub numer identyfikacji podatkowej**, identyfikator organizacji i planu. Dane karty trafiają bezpośrednio do Stripe | art. 6 ust. 1 lit. b; art. 6 ust. 1 lit. c — rachunkowość i podatki | organizacja; Stripe | okres ustawowy (§9) | Stripe; organy podatkowe i księgowi, jeśli jest to wymagane |
| 18 | Analityka produktowa (zob. §8 oraz Politykę plików cookie i pamięci przeglądarki) | zdarzenia powiązane z identyfikatorem Twojego konta, losowy identyfikator sesji, strona, język, dane kampanii z pierwszej wizyty (`utm_*`, strona odsyłająca, strona docelowa), identyfikator organizacji | art. 6 ust. 1 lit. f w zakresie analizy; **zgoda** na przechowywanie identyfikatorów na Twoim urządzeniu (art. 5 ust. 3 dyrektywy o prywatności i łączności elektronicznej) [OWNER DECISION: baner lub rezygnacja] | Twoje urządzenie | przechowywane (§9) | nasz zespół; podmioty przetwarzające |
| 19 | Bezpieczeństwo, zapobieganie nadużyciom i dzienniki audytu | dane żądań, adres IP w logach hostingu, rekordy audytu kluczowych zmian | art. 6 ust. 1 lit. f | Twoje urządzenie; platforma | [OWNER: okres przechowywania logów hostingu] | podmioty przetwarzające |
| 20 | Funkcje wspomagane przez AI (zob. §8) | obecnie do dostawcy AI trafiają wyłącznie publiczne statystyki rynku | art. 6 ust. 1 lit. f | platforma | fragmenty wyników usuwane po 90 dniach | Google (Gemini API) |
| 21 | Podłączenie Twojego własnego asystenta AI (ChatGPT, Claude i inni) | to, co pozwalasz asystentowi odczytać, w granicach Twoich własnych uprawnień | art. 6 ust. 1 lit. b, na Twoje żądanie | Ty | do odłączenia | dostawca asystenta |
| 22 | Przybliżona lokalizacja logowania, jeśli zdecydujesz się ją udostępnić | lokalizacja z dokładnością do miasta | art. 6 ust. 1 lit. a [OWNER: zweryfikować funkcję i treść zgody] | Ty | do wycofania zgody | podmioty przetwarzające |
| 23 | Korespondencja z nami | Twój adres e-mail i wiadomość | art. 6 ust. 1 lit. f; art. 6 ust. 1 lit. c w przypadku żądania dotyczącego praw | Ty | [OWNER DECISION] | dostawca skrzynki pocztowej |

**Szczególne kategorie danych (art. 9 RODO).** Nie prosimy o dane dotyczące zdrowia, pochodzenia etnicznego, religii, poglądów politycznych, przynależności do związków zawodowych ani dane biometryczne. Pola tekstowe mogą jednak zawierać takie dane, jeśli ktoś je wpisze, na przykład w przyczynie nieobecności. Dostęp do przyczyn nieobecności jest ograniczony do Ciebie i kierownika rozpatrującego wpis. [LAWYER: podstawa z art. 9 ust. 2 lit. b dla rekordów nieobecności prowadzonych przez pracodawców; rozważyć ograniczenie treści przyczyny]

**Czy musisz podać dane?** Dane oznaczone jako art. 6 ust. 1 lit. b są niezbędne do świadczenia danej funkcji. Bez nich funkcja nie może działać. Każdy cel oparty na zgodzie jest dobrowolny. Odmowa nie zmienia niczego innego na Twoim koncie.

## 5. Skąd pochodzą dane

- **Od Ciebie:** to, co wpisujesz, przesyłasz lub mówisz w produkcie.
- **Od organizacji:** firma, agencja lub szkoła może rejestrować lub importować fakty dotyczące Twojej pracy (listy personelu, historia pracy, rekordy projektów i czasu pracy). Może też potwierdzać wpisy w Twoim dzienniku.
- **Od innych użytkowników:** wiadomości, potwierdzenia Twojej pracy, zaproszenia, w których jesteś wymieniony(-a).
- **Od Google**, jeśli logujesz się przez Google.
- **Od Stripe** — w zakresie płatności za plan organizacji.
- **Ze źródeł publicznych:** ogłoszenia o pracę publikowane przez Arbetsförmedlingen (Szwecja) i NAV (Norwegia). Nie przechowujemy ustrukturyzowanej listy kontaktów NAV. Treść ogłoszenia może jednak wskazywać osobę kontaktową.
- **Z Twojego urządzenia:** dane techniczne i analityczne (zob. Politykę plików cookie i pamięci przeglądarki).

## 6. Kto otrzymuje dane

**Wewnątrz platformy** dane są domyślnie zamknięte. Inni użytkownicy widzą wyłącznie to, na co pozwala konkretna zasada. Zasady te opisuje strona „Twoje dane i kto może je zobaczyć”.
- Firmy i agencje widzą Twoje ograniczone podsumowanie tylko wtedy, gdy włączysz widoczność (cel 4).
- Twoje dane kontaktowe, CV lub dokumenty widzą dopiero po odrębnym zatwierdzeniu dla danej firmy (cel 5).
- Kierownicy organizacji, z którą współpracujesz, widzą to, czego wymaga ta relacja (cel 8).
- Kierownicy organizacji, która zarejestrowała Twoją historię pracy, mogą ją odczytać. Mogą to także kierownicy organizacji wskazanej w tym rekordzie jako strona.
- Gdy pracodawca lub kierownik podłącza własnego asystenta AI, asystent ten może odczytywać to, co może odczytywać kierownik. Może to obejmować dane na Twój temat, na przykład wyniki wyszukiwania kandydatów, listę personelu lub wnioski o nieobecność. Za ten wybór odpowiada organizacja. [LAWYER: analiza administratora i odbiorcy — audyt D4]

**Nasi usługodawcy (podmioty przetwarzające).** Działają na nasze polecenie:

| Dostawca | Co robi | Lokalizacja |
|---|---|---|
| Supabase | baza danych, logowanie, przechowywanie plików | UE (Irlandia, eu-west-1); spółka dominująca w USA |
| Vercel | hosting, funkcje serwerowe (Dublin), logi żądań | funkcje w Dublinie; część obsługi żądań odbywa się w globalnej sieci brzegowej Vercel; spółka z USA |
| Resend, wysyłka przez Amazon SES (eu-west-1) | wiadomości e-mail przy rejestracji i logowaniu | spółka z USA; wysyłka w UE |
| Stripe Payments Europe | przetwarzanie płatności za plany organizacji. W zakresie własnych obowiązków dotyczących zapobiegania oszustwom i obowiązków prawnych Stripe działa jako niezależny administrator | Irlandia; grupa międzynarodowa |
| Hostinger | skrzynka pocztowa info@labourmarket.ai [OWNER: zweryfikować dostawcę i lokalizację] | [verify — zweryfikować] |
| GitHub | hosting kodu i zadania automatyczne. Zadania te mogą technicznie uzyskiwać dostęp do danych produkcyjnych i zapisywać publiczne dane o ofertach pracy | USA |
| Google (Gemini API) | przetwarzanie przez AI. Obecnie wysyłane są **wyłącznie publiczne statystyki rynku** | infrastruktura Google |
| Telegram lub mostek powiadomień Agentai OS | krótkie powiadomienia dla właściciela o zapytaniach biznesowych. Bez danych pracowników. **Tylko jeśli są włączone** [OWNER: potwierdzić] | poza EOG |

**Niezależni odbiorcy.** Sami decydują o sposobie wykorzystania danych:
- **Google**, gdy korzystasz z opcji „Kontynuuj z Google”.
- **OpenStreetMap Foundation.** Fragmenty mapy są pobierane z jej serwerów, więc Twoja przeglądarka przekazuje jej Twój adres IP i oglądany obszar mapy.
- **Producent Twojej przeglądarki** (na przykład Google lub Apple), jeśli korzystasz z dyktowania głosowego. Twoja przeglądarka wysyła nagranie do własnej usługi rozpoznawania mowy; my nie otrzymujemy nagrania.
- **Dostawca asystenta AI**, którego podłączasz Ty lub Twoja organizacja.
- **Firmy**, które otrzymały Twoje dane za Twoją zgodą.
- **Organy władzy**, gdy wymaga tego prawo.

**W ramach UAB „Nonstop Group“.** UAB „Nonstop Group“ prowadzi również działalność rekrutacyjną (agencję zatrudnienia). Otrzymuje ona Twoje dane na potrzeby tej działalności wyłącznie wtedy, gdy o to poprosisz (cel 7).

## 7. Przekazywanie danych poza Europejski Obszar Gospodarczy

Nasza główna baza danych znajduje się w UE. Niektórzy dostawcy są spółkami z USA lub przetwarzają dane poza EOG:
- sieć brzegowa Vercel;
- dostęp serwisowy spółek dominujących z USA;
- runnery hostowane przez GitHub;
- Google;
- Telegram, jeśli jest włączony.

OpenStreetMap Foundation ma siedzibę w Zjednoczonym Królestwie, wobec którego obowiązuje decyzja UE stwierdzająca odpowiedni stopień ochrony.

Jeżeli dane opuszczają EOG, musi mieć zastosowanie mechanizm przekazywania zgodny z art. 44–49 RODO: decyzja stwierdzająca odpowiedni stopień ochrony, ramy ochrony danych UE–USA (EU-US Data Privacy Framework) lub standardowe klauzule umowne. [LAWYER/OWNER: potwierdzić podstawę SCC / DPF / decyzję stwierdzającą odpowiedni stopień ochrony dla każdego dostawcy. W naszej dokumentacji żadna nie jest jeszcze udokumentowana. Nie publikować niepotwierdzonego mechanizmu.] Możesz poprosić nas o kopię zabezpieczeń.

## 8. Funkcje AI, dopasowywanie i profilowanie

**Automatyczne dopasowywanie i ranking mają miejsce. Nie podejmuje się wobec Ciebie decyzji opartej wyłącznie na zautomatyzowanym przetwarzaniu, która wywoływałaby skutki prawne lub w podobny sposób istotnie na Ciebie wpływała (art. 22 RODO).** Każdą istotną decyzję podejmuje człowiek: z kim się skontaktować, komu zaproponować pracę, kogo przyjąć, zweryfikować lub odrzucić.

Co działa automatycznie:

- **Dopasowywanie potrzeby do pracowników.** Gdy organizacja publikuje lub ponownie otwiera potrzebę, oparty na regułach mechanizm dopasowujący ustala ranking pracowników, którzy włączyli widoczność. Nie wysyła on żadnej wiadomości, zaproszenia ani powiadomienia. To organizacja decyduje, czy z kimkolwiek się skontaktować.
- **Ranking kandydatów.** Wyniki wyszukiwania dla pracodawców są uporządkowane według stopnia dopasowania. Pracodawca najpierw widzi krótką listę najlepszych wyników (obecnie 8). Ranking wpływa na to, kto zostanie zauważony jako pierwszy. Nigdy nikogo nie odrzuca.
- **Powiadomienia o ofertach pracy i „nowe dopasowane oferty”.** Porównujemy Twój profil z otwartymi ofertami pracy i je Ci rekomendujemy.
- **Wnioskowanie w Żywym CV.** Na podstawie Twoich dowodów sugerujemy bezpośrednie, pośrednie i potencjalne kompetencje. Sugestia pozostaje sugestią. Jest oznaczana odrębnie od tego, co zadeklarowałeś(-aś), oraz od tego, co ktoś potwierdził lub poświadczył certyfikatem.
- **Reguły potwierdzania organizacji.** Organizacja może ustawić regułę, która potwierdza umiejętność we własnym rekordzie organizacji po osiągnięciu progu pewności. [OWNER/LAWYER: brak informacji i wyjaśnienia dla pracownika — uzupełnienie do audytu 03]

**Modele AI.**
- Obecnie jedynym zadaniem, które trafia do zewnętrznego modelu AI (Google Gemini), jest objaśnienie **publicznych statystyk rynku**. Nie zawiera ono danych osobowych.
- Tłumaczenie wiadomości i sugestie dla zdań wpisywanych na czacie są **wyłączone** w odniesieniu do danych osobowych. Pozostają wyłączone do czasu potwierdzenia płatnych, umownych warunków dostawcy AI. [OWNER DECISION: włączyć ponownie dopiero po potwierdzeniu płatnego planu; najpierw zaktualizować tę sekcję]
- Wynik działania AI jest zawsze sugestią. Nic nie jest zapisywane jako fakt na Twój temat, dopóki Ty lub osoba odpowiedzialna tego nie potwierdzi.
- AI nigdy nie weryfikuje umiejętności, nie przyjmuje ani nie odrzuca kandydata i z nikim się nie kontaktuje.
- Logi uruchomień AI przechowują krótki fragment wyniku. Jest on usuwany po 90 dniach.

**Twoje wybory.**
- Możesz w każdej chwili wyłączyć widoczność. Wówczas przestajesz być uwzględniany(-a) w dopasowywaniu dla pracodawców przy nowych wyszukiwaniach.
- Możesz wnieść sprzeciw wobec profilowania opartego na prawnie uzasadnionych interesach (§10) i poprosić, aby człowiek wyjaśnił ranking.

[LAWYER: ocenić, czy oparty na regułach mechanizm dopasowujący jest „systemem AI” w rozumieniu aktu w sprawie sztucznej inteligencji (EU AI Act, rozporządzenie (UE) 2024/1689, art. 3 pkt 1). Jeżeli tak, sprawdzić załącznik III pkt 4 (zatrudnienie). Nie podawać publicznie klasyfikacji przed dokonaniem oceny.]

## 9. Jak długo przechowujemy dane

Obecnie dane są przechowywane, dopóki istnieje Twoje konto i dana funkcja nadal z nich korzysta. Poniższe okresy są **propozycjami, które nie zostały zatwierdzone**. [OWNER DECISION: zatwierdzić lub zmienić każdy z nich — pakiet A]

| Dane | Obecnie | Proponowany okres |
|---|---|---|
| Konto, profil, Żywe CV | do usunięcia konta | bez zmian |
| Dziennik pracy | do usunięcia konta | [OWNER DECISION: usunąć lub zachować odłączone dowody. Obecnie usunięcie konta usuwa dziennik] |
| Wiadomości | przechowywane | [OWNER DECISION: 36 miesięcy od zamknięcia rozmowy] |
| Rezerwacje i zlecenia | przechowywane | [OWNER DECISION: 6 lat od zakończenia — okres przedawnienia roszczeń; LAWYER] |
| Treść przyczyny nieobecności | przechowywana | [OWNER DECISION: 12 miesięcy] |
| Powiadomienia | przechowywane | [OWNER DECISION: 12 miesięcy] |
| Zdarzenia analityczne | przechowywane | [OWNER DECISION: 24 miesiące lub usunięcie na żądanie] |
| Rekordy zgód i ujawnień | przechowywane, nie podlegają edycji | [OWNER DECISION: okres istnienia konta + 6 lat, pseudonimizacja po usunięciu] |
| Żądania dotyczące prywatności | przechowywane | [OWNER DECISION: 3 lata od zakończenia] |
| Rozliczenia i faktury | przechowywane | [LAWYER: ustawowy okres przechowywania dokumentacji księgowej; standardowa wykładnia prawa litewskiego to 10 lat] |
| Fragmenty wyników AI | **usuwane po 90 dniach** (codziennie) | bez zmian |
| Rekordy dostarczone przez organizację | przechowywane | decyduje organizacja [OWNER DECISION: okres domyślny dla przejściowych wierszy importu] |
| Usunięte publiczne ogłoszenia o pracę | przechowywane, ukryte | [OWNER DECISION: 12 miesięcy od usunięcia] |
| Kopie zapasowe | rotacja zarządzana przez dostawcę | okres dostawcy [OWNER: wskazać faktyczny okres] |

## 10. Twoje prawa

Na podstawie art. 15–22 RODO przysługuje Ci prawo do:

- **Dostępu** (art. 15): uzyskania kopii swoich danych oraz informacji o tym, jak je wykorzystujemy.
- **Sprostowania** (art. 16): poprawienia nieprawidłowych danych. Zapisanych wpisów w dzienniku nie można przepisać; możesz dodać korektę. Rekordy prowadzone przez organizację poprawia ta organizacja; możesz je zakwestionować po powiązaniu Twojego konta.
- **Usunięcia danych** (art. 17): usunięcia Twoich danych, chyba że musimy zachować ich część (na przykład dokumentację księgową lub dowód zgody).
- **Ograniczenia przetwarzania** (art. 18): zażądania od nas ograniczenia wykorzystania na czas wyjaśniania sprawy.
- **Przenoszenia danych** (art. 20): otrzymania przekazanych nam danych w pliku nadającym się do odczytu maszynowego.
- **Sprzeciwu** (art. 21): wniesienia sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionych interesach, w tym profilowania, analityki i dopasowywania przez operatorów. Wówczas zaprzestajemy przetwarzania, chyba że wykażemy istnienie ważnych prawnie uzasadnionych podstaw.
- **Weryfikacji przez człowieka** (art. 22): niepodlegania decyzji, która opiera się wyłącznie na zautomatyzowanym przetwarzaniu i istotnie na Ciebie wpływa. Nie podejmujemy takich decyzji (§8). Nadal możesz poprosić, aby człowiek przyjrzał się dowolnemu automatycznemu wynikowi.
- **Wycofania zgody** (art. 7 ust. 3) w dowolnym momencie, w jednym kroku. Wycofanie nie wpływa na zgodność z prawem tego, co nastąpiło przed nim. Dane, które pracodawca już zgodnie z prawem otrzymał, pozostają u tego pracodawcy, na jego własną odpowiedzialność.

## 11. Jak skorzystać ze swoich praw

**Na swoim koncie:** otwórz **Panel → Prywatność** (`/dashboard/privacy`; w aplikacji mobilnej — Ustawienia → Prywatność).
- **Pobierz swoje dane:** plik JSON z Twoimi danymi oraz plik CSV z Twoim dziennikiem pracy. Następuje to natychmiast.
- **Zażądaj usunięcia:** złóż żądanie usunięcia konta. Usunięcie **nie następuje natychmiast**. Człowiek rozpatruje żądanie i informuje Cię, co zostało usunięte, co zachowane i dlaczego.
- **Zgody:** włączaj lub wyłączaj każdą z nich.

**E-mailem:** napisz na adres **info@labourmarket.ai**. Korzystaj z niego w celu uzyskania dostępu do pełnych informacji na podstawie art. 15, sprostowania, ograniczenia przetwarzania, sprzeciwu lub w każdej sprawie, której nie obejmuje strona konta. [OWNER DECISION: dodać w produkcie typy żądań dotyczące sprostowania, ograniczenia przetwarzania i sprzeciwu]

**Nie masz konta?** Zob. „Informację dla osób nieposiadających konta”. [OWNER DECISION: kanał]

**Weryfikacja tożsamości.** Na koncie identyfikuje Cię samo zalogowanie. W przypadku wiadomości e-mail możemy poprosić Cię o napisanie z adresu przypisanego do konta lub o podanie informacji, które zna tylko właściwa osoba. Prosimy wyłącznie o to, co jest nam potrzebne do potwierdzenia, że to Ty.

**Termin.** Odpowiadamy **w terminie jednego miesiąca** od otrzymania żądania. W przypadku żądań złożonych lub licznych możemy przedłużyć ten termin o maksymalnie kolejne dwa miesiące. W takim przypadku informujemy Cię o tym w ciągu pierwszego miesiąca i podajemy przyczyny (art. 12 ust. 3). Żądania są bezpłatne, chyba że są ewidentnie nieuzasadnione lub nadmierne (art. 12 ust. 5).

## 12. Dzieci i młodzież

[OWNER DECISION: minimalny wiek do utworzenia konta — 16 lub 18 lat]

- Platforma służy pracy, praktykom zawodowym i nauce, dlatego mogą z niej korzystać uczący się i studenci.
- [LAWYER: Litwa ustala wiek 14 lat jako wiek wyrażania zgody na usługi online na podstawie art. 8 RODO — zweryfikować. Poniżej tego wieku dla celów opartych na zgodzie potrzebna jest zgoda rodzica. Sprawdzić również litewskie przepisy dotyczące pracy małoletnich.]
- [OWNER DECISION: czy osoby poniżej 18 lat mogą włączać widoczność dla pracodawców oraz czy szkoła może dodawać uczniów będących małoletnimi]
- Obecnie przy rejestracji nie ma weryfikacji wieku.

## 13. Bezpieczeństwo

Co faktycznie robimy:
- Zasady dostępu znajdują się w samej bazie danych. Bez zasady przyznającej dostęp nikt nie widzi danych. Zasady te są objęte testami automatycznymi.
- Pliki i zdjęcia znajdują się w prywatnym magazynie. Otwierają się wyłącznie przez linki o krótkim okresie ważności.
- Rekordy zgód i ujawnień można wyłącznie uzupełniać (append-only). Nikt, w tym administratorzy systemu, nie może ich zmienić.
- Dostęp do ekranów administracyjnych ma niewielka liczba administratorów systemu.
- Żaden administrator systemu nie może wyrazić zgody w Twoim imieniu.

Żaden system nie jest w pełni bezpieczny. W przypadku naruszenia ochrony danych osobowych zgłaszamy je organowi nadzorczemu, a także zawiadamiamy Ciebie, jeżeli wymaga tego prawo (art. 33–34). Jeśli zauważysz problem, napisz na info@labourmarket.ai.

## 14. Skargi

Możesz wnieść skargę do organu nadzorczego, w szczególności w państwie UE, w którym mieszkasz lub pracujesz, albo w którym doszło do naruszenia (art. 77).

Naszym wiodącym organem nadzorczym jest **Państwowa Inspekcja Ochrony Danych Litwy** (Valstybinė duomenų apsaugos inspekcija, VDAI):
- L. Sapiegos g. 17, LT-10312 Vilnius;
- ada@ada.lt;
- vdai.lrv.lt.

[LAWYER: zweryfikować adres i dane kontaktowe]

Chcielibyśmy mieć najpierw możliwość rozwiązania problemu, dlatego prosimy o kontakt również z nami. Nie masz takiego obowiązku.

## 15. Zmiany niniejszej polityki

- Wersja: **v2 (projekt), 2026-10-15**. Zastępuje wcześniejszą stronę napisaną prostym językiem.
- Gdy zmieniamy niniejszą politykę, aktualizujemy tutaj datę i wersję.
- Jeżeli zmiana dotyczy tego, na co wyraziłeś(-aś) zgodę, informujemy Cię o tym w produkcie przed jej zastosowaniem. Treści zgód są wersjonowane: jeśli treść zgody się zmienia, ponownie prosimy Cię o zgodę.
