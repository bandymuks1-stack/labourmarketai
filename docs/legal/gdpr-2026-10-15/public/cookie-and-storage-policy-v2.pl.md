# Polityka plików cookie i pamięci przeglądarki — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15 (projekt)
> **Wymaga weryfikacji prawnika / Requires lawyer review.** Projekt do weryfikacji przez prawnika. Nie jest ostateczny, nie ma jeszcze mocy prawnej, nie został poświadczony.
> **Tłumaczenie z angielskiego projektu; poprawność prawna tego tłumaczenia wymaga odrębnej weryfikacji przez wykwalifikowanego prawnika/tłumacza.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Wykorzystane źródła faktów:**
> - Audyt z 2026-10-15 `02-processors-transfers-cookies-ai.md` §2.1-2.5 (każdy plik cookie i klucz pamięci wraz z miejscem w kodzie) oraz D5, D12; `03-rights-consent-legal-pages.md` §2, L3, L4
> - Okresy ważności sprawdzone w kodzie 2026-10-15: `lm_active_workspace` — 180 dni (`apps/web/lib/company/organization-actions.ts:54`); `lm_hide_admin_ui` — 365 dni (`apps/web/lib/auth/admin-ui-actions.ts:20`)
> - Obecna strona: `apps/web/messages/en.json` → `legal.cookies`
>
> **Otwarte decyzje:**
> 1. [OWNER DECISION: dodać baner zgody przed zapisaniem elementów analitycznych z §4 ALBO uczynić telemetrię niezbędną / wyłącznie zagregowaną i usunąć `lm.attr.first`, `lm.funnel.*` oraz `lm.pilot.session`. **Obecnie elementy te są zapisywane bez zgody i nie istnieje żaden baner.** Niniejszej polityki nie wolno publikować w obecnym brzmieniu, dopóki jedna z opcji nie zostanie wdrożona.]
> 2. [LAWYER: czy na gruncie prawa litewskiego ma zastosowanie jakiekolwiek wyłączenie dla analityki. Wykładnia domyślna: brak wyłączenia dla analityki powiązanej z profilem]
> 3. [LAWYER: kwalifikacja elementów „funkcjonalnych” z §3, o które użytkownik wyraźnie nie prosił (liczniki użycia, ostatnio oglądane oferty)]
> 4. [OWNER: potwierdzić okres ważności pliku cookie logowania — wartość domyślna biblioteki, nieustawiona w naszym kodzie]
> 5. [OWNER: potwierdzić, czy do płatności używane są strony Checkout hostowane przez Stripe, i wskazać to w §5]
> 6. [LAWYER: zweryfikować odesłanie do artykułu litewskiej ustawy o łączności elektronicznej (art. 61 ust. 3, przywołany w audycie) z obowiązującym brzmieniem]

---

## 1. Czego dotyczy niniejsza polityka

Platforma zapisuje w Twojej przeglądarce niewielkie elementy:
- **pliki cookie**;
- **pamięć lokalną** (local storage), która pozostaje do czasu jej wyczyszczenia;
- **pamięć sesji** (session storage), która jest usuwana po zamknięciu karty.

Niektóre funkcje powodują również, że Twoja przeglądarka łączy się bezpośrednio z innymi usługami (§5).

Przechowywanie lub odczytywanie czegokolwiek na Twoim urządzeniu wymaga Twojej **zgody**, chyba że jest to **niezbędne** do świadczenia usługi, o którą prosisz. Zasada ta wynika z art. 5 ust. 3 dyrektywy o prywatności i łączności elektronicznej 2002/58/WE, wdrożonej na Litwie ustawą o łączności elektronicznej (art. 61). [LAWYER: zweryfikować artykuł]

Nie używamy reklamowych plików cookie podmiotów trzecich. Nie korzystamy z żadnej zewnętrznej usługi analitycznej ani z nagrywania sesji. **Mamy natomiast** własną (first-party) analitykę produktową, opisaną w §4.

## 2. Elementy niezbędne

Elementy te nie wymagają zgody. Bez nich usługa, o którą prosisz, nie może działać.

| Nazwa | Typ | Okres ważności | Cel |
|---|---|---|---|
| `sb-<project>-auth-token` (może być podzielony na `.0`, `.1`, …) | plik cookie | dopóki pozostajesz zalogowany(-a); odnawiany automatycznie [OWNER: zweryfikować maksymalny okres ważności] | utrzymuje Twoje zalogowanie |
| `sb-<project>-auth-token-code-verifier` | plik cookie | krótki, wyłącznie na etapie logowania | zabezpiecza logowanie przez Google (PKCE) |
| `lm_active_workspace` | plik cookie (niedostępny dla skryptów strony) | 180 dni | zapamiętuje, w której przestrzeni roboczej (osobistej lub organizacji) pracujesz |
| `lmai:command-finder-speech-consent:v1` | pamięć lokalna | do czasu wyczyszczenia | rejestruje, że zaakceptowałeś(-aś) informację o dyktowaniu głosowym |
| `lm.oauth.trace` | pamięć sesji | do zamknięcia karty | losowy identyfikator pomagający nam prześledzić nieudane logowanie |
| `lm-chunk-reload` | pamięć sesji | do zamknięcia karty | zapobiega zapętlonemu przeładowywaniu strony po aktualizacji |

## 3. Elementy preferencji i elementy funkcjonalne

Zapamiętują dokonane przez Ciebie wybory lub zachowują Twoją pracę podczas korzystania z funkcji.

| Nazwa | Typ | Okres ważności | Cel |
|---|---|---|---|
| `NEXT_LOCALE` | plik cookie | 1 rok | Twój język |
| `lm_tz` | plik cookie | 1 rok | Twoja strefa czasowa, aby dni i godziny wyświetlały się prawidłowo |
| `lm_hide_admin_ui` | plik cookie | 1 rok | wyłącznie dla administratorów systemu: czy elementy sterujące administratora są ukryte. Nie zmienia żadnych uprawnień |
| `theme` | pamięć lokalna | do czasu wyczyszczenia | jasny lub ciemny motyw |
| `lm.communication.writeLanguage` | pamięć lokalna | do czasu wyczyszczenia | język, w którym piszesz wiadomości |
| `lmai:voice-speech-language` | pamięć lokalna | do czasu wyczyszczenia | język dyktowania |
| `lm.search-location.v1` | pamięć lokalna | do czasu wyczyszczenia | wybrana przez Ciebie lokalizacja wyszukiwania. Może być dokładna i pozostaje na Twoim urządzeniu |
| `lm.opportunities.recentlyViewed.v1` | pamięć lokalna | do czasu wyczyszczenia | ostatnio oglądane przez Ciebie oferty pracy [LAWYER: kwalifikacja] |
| `lm.commandFinder.recentCommandIds` | pamięć lokalna | do czasu wyczyszczenia | Twoje ostatnie polecenia |
| `lm.myspace.usage.v1`, `lm.myspace.asked.v1` | pamięć lokalna | do czasu wyczyszczenia | jak często korzystasz z funkcji, aby proponować skróty. Pozostaje na Twoim urządzeniu [LAWYER: kwalifikacja] |
| `lm.professionRecoveryPrompt.v1.dismissed` | pamięć lokalna | do czasu wyczyszczenia | zamknąłeś(-aś) ten komunikat |
| `lm.work-card-checks.kept` | pamięć lokalna | do czasu wyczyszczenia | sprawdzenia, które postanowiłeś(-aś) zachować |
| `lm.employerVisibilityAsk.v1` | pamięć lokalna | do czasu wyczyszczenia | Twoja odpowiedź na komunikat o widoczności dla pracodawców. Sama zgoda jest rejestrowana na naszym serwerze |
| `lm.chat.continueAfterSwitch` | pamięć sesji | do zamknięcia karty | do 500 znaków wpisanego przez Ciebie zdania, aby można było je kontynuować po zmianie przestrzeni roboczej |
| `lmai:voice-transcript-draft` | pamięć sesji | do zamknięcia karty | robocza treść Twojego dyktowania |

## 4. Elementy analityczne — wymagana zgoda

Mierzymy, jak korzysta się z produktu: do których stron i kroków docierają użytkownicy, kroki rejestracji, codzienną aktywność oraz to, która kampania przyprowadziła odwiedzającego. Zdarzenia są przechowywane na naszych własnych serwerach i powiązane z Twoim kontem, jeśli jesteś zalogowany(-a).

[OWNER DECISION: baner lub rezygnacja] **Elementy te są ustawiane dopiero po wyrażeniu przez Ciebie zgody.** Swój wybór możesz w każdej chwili zmienić w [OWNER DECISION: miejsce zmiany wyboru, np. link w stopce „Ustawienia plików cookie”].

| Nazwa | Typ | Okres ważności | Cel |
|---|---|---|---|
| `lm.attr.first` | pamięć lokalna | do czasu wyczyszczenia | dane kampanii z pierwszej wizyty (tagi `utm_*`, strona odsyłająca, strona docelowa). Przy rejestracji są kopiowane do rekordu Twojego konta |
| `lm.funnel.last_seen_day` | pamięć lokalna | do czasu wyczyszczenia | ostatni dzień Twojej aktywności, do liczenia dziennie aktywnych użytkowników |
| `lm.funnel.signup_pending` | pamięć lokalna | do czasu wyczyszczenia | oznacza, że rejestracja jest w toku |
| `lm.pilot.session` | pamięć sesji | do zamknięcia karty | losowy identyfikator sesji wysyłany z każdym zdarzeniem analitycznym |
| `lm.funnel.*` (na przykład `landing_fired`, `login_succeeded`) | pamięć sesji | do zamknięcia karty | zapobiega podwójnemu liczeniu tego samego zdarzenia analitycznego |

Jeśli nie wyrazisz zgody, produkt działa tak samo.

Sama analiza opiera się na naszym prawnie uzasadnionym interesie polegającym na ulepszaniu produktu (art. 6 ust. 1 lit. f RODO). Możesz wnieść wobec niej sprzeciw (zob. Politykę prywatności, §10).

## 5. Usługi, z którymi Twoja przeglądarka łączy się bezpośrednio

- **Kafelki map OpenStreetMap** (`tile.openstreetmap.org`). Mapa rynku pobiera fragmenty mapy z serwerów OpenStreetMap Foundation. Twoja przeglądarka przesyła Twój adres IP, dane przeglądarki i oglądany obszar mapy. Nie są przy tym używane żadne nasze pliki cookie. Zastosowanie ma własna polityka prywatności OpenStreetMap Foundation.
- **Dyktowanie głosowe.** Jeśli korzystasz z dyktowania w wyszukiwarce poleceń, Twoja przeglądarka wysyła nagranie do usługi rozpoznawania mowy swojego producenta (na przykład Google w przypadku Chrome, Apple w przypadku Safari). Nie otrzymujemy nagrania. Przed pierwszym użyciem wyświetlana jest informacja.
- **Strony płatności.** Gdy organizacja dokonuje płatności, na stronach Stripe obowiązują własne warunki i pliki cookie Stripe. [OWNER: potwierdzić hostowany Checkout]
- **Czcionki** są serwowane z naszej własnej witryny. Nie następuje żadne połączenie z Google Fonts.

## 6. Jak kontrolować lub usuwać te elementy

- Ustawienia przeglądarki pozwalają w każdej chwili usunąć pliki cookie i dane witryny (pamięć lokalną i pamięć sesji).
- Jeśli usuniesz pliki cookie logowania, zostaniesz wylogowany(-a).
- Pamięć sesji jest czyszczona po zamknięciu karty.
- [OWNER DECISION: wybór zgody w produkcie dla §4, po jego wdrożeniu]

## 7. Zmiany

- Wersja **v2 (projekt), 2026-10-15**.
- Aktualizujemy tę listę przed dodaniem nowego pliku cookie lub elementu pamięci.
- Pytania: info@labourmarket.ai.
- Administrator: UAB „Nonstop Group“, kod przedsiębiorstwa 302676973 (zob. Politykę prywatności, §1).
