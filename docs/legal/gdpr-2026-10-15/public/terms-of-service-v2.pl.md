# Regulamin świadczenia usług — LabourMarket.ai

> **Status:** DRAFT v2 — 2026-10-15 (projekt)
> **Wymaga weryfikacji prawnika / Requires lawyer review.** Projekt do weryfikacji przez prawnika. Nie jest ostateczny, nie ma jeszcze mocy prawnej, nie został poświadczony.
> **Tłumaczenie z angielskiego projektu; poprawność prawna tego tłumaczenia wymaga odrębnej weryfikacji przez wykwalifikowanego prawnika/tłumacza.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Wykorzystane źródła faktów:**
> - `docs/legal/corporate-identity-source-of-truth-v1.md` (strona umowy, właściciel własności intelektualnej, zasada „marka nie jest podmiotem”); `entity-role-and-data-access-matrix-v1.md`
> - Obecny Regulamin i zasady marketplace: `apps/web/messages/en.json` → `legal.terms`, `legal.marketplaceRules`
> - Audyt z 2026-10-15 `03-rights-consent-legal-pages.md` §0 (3 transakcje Stripe Checkout w trybie produkcyjnym (live mode) dla planu organizacji, 0 subskrypcji), §5 (brak weryfikacji wieku), L7 (Regulamin zbyt skąpy); `02-processors-transfers-cookies-ai.md` §1 wiersz 4 (Stripe zbiera adres rozliczeniowy, numer VAT, imię i nazwisko), §4 (brak automatycznego odrzucania)
> - `apps/web/lib/billing/plans.ts` (bezpłatne plany Person i Organization — 0 €; jeden płatny plan Organization; Worker Plus, plany dla agencji, kredyty i dodatkowe usługi multimedialne odłożone i niesprzedawane)
> - `docs/legal/retention-decision-package-v1.md` decyzja 2 (dokumentacja rozliczeniowa)
>
> **Otwarte decyzje:**
> 1. [OWNER DECISION: czy płatne plany są sprzedawane wyłącznie przedsiębiorcom (B2B)? Jeżeli kupować mogą konsumenci lub jednoosobowi przedsiębiorcy działający jako konsumenci, ma zastosowanie §9.6 — 14-dniowe prawo odstąpienia od umowy na podstawie art. 9 dyrektywy 2011/83/UE, litewski Kodeks cywilny [LAWYER: zweryfikować artykuł]]
> 2. [OWNER DECISION: okres rozliczeniowy, automatyczne odnowienie, termin wypowiedzenia i zwroty]
> 3. [OWNER DECISION: minimalny wiek (16 lub 18 lat)]
> 4. [LAWYER: brzmienie i limity ograniczenia odpowiedzialności na gruncie prawa litewskiego i prawa konsumenckiego]
> 5. [LAWYER: podmiot pozasądowego rozwiązywania sporów konsumenckich (Państwowy Urząd Ochrony Praw Konsumentów, VVTAT) oraz to, czy nadal potrzebne jest jakiekolwiek odesłanie do unijnego ODR — unijna platforma ODR została zlikwidowana w 2025 r., zweryfikować]
> 6. [OWNER DECISION: termin powiadomienia o zmianach niniejszego Regulaminu]
> 7. [OWNER DECISION: zasady zawieszania i zamykania kont oraz tryb odwoławczy]
> 8. [LAWYER: czy „LabourMarket.ai” może gdziekolwiek występować jako nazwa strony umowy — zgodnie z zasadami tożsamości nie może]

---

## 1. Z kim zawierasz umowę

- Platformę prowadzi i wszystkie jej usługi sprzedaje **UAB „Nonstop Group“**:
  - kod przedsiębiorstwa 302676973;
  - numer VAT LT100010790613;
  - Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litwa;
  - e-mail info@labourmarket.ai.

  W niniejszym Regulaminie jest określana jako „my” lub „nas”.
- Twoja umowa dotycząca każdej usługi platformy jest zawierana z UAB „Nonstop Group“. To ona wystawia faktury i przyjmuje płatności.
- „LabourMarket.ai” to nazwa platformy. Nie jest to spółka.
- **Labour Market AI Sp. z o.o.** (Warszawa, Polska; KRS 0001218752) jest właścicielem oprogramowania, marki i powiązanej własności intelektualnej i udziela nam na nie licencji. Nie jest stroną Twojej umowy i nie ma dostępu do Twoich danych osobowych.

## 2. Czym jest platforma, a czym nie jest

- Platforma pomaga osobom i organizacjom znajdować, rejestrować, prezentować i koordynować pracę. Obejmuje:
  - profil osoby, Żywe CV i dziennik pracy;
  - potrzeby, projekty, zespoły i rekordy organizacji;
  - dopasowywanie, wiadomości i rezerwacje;
  - publiczne ogłoszenia o pracę.
- W koordynację zaangażowany jest operator-człowiek.
- Korzystanie z platformy **samo w sobie nie tworzy stosunku pracy**. Nie gwarantuje pracy, pracowników ani żadnego rezultatu.
- Każda praca, zlecenie lub umowa uzgodnione przez osoby za pośrednictwem platformy są zawierane między nimi. Nie jesteśmy ich stroną, chyba że oświadczymy to na piśmie.

## 3. Konta

- [OWNER DECISION: aby utworzyć konto, musisz mieć ukończone co najmniej 16 / 18 lat; zasada dla uczących się i studentów]
- Podawaj prawdziwe informacje i dbaj o ich aktualność.
- Chroń swoje dane logowania. Niezwłocznie nas powiadom, jeśli uważasz, że ktoś inny skorzystał z Twojego konta.
- Jedno konto osobiste — jedna osoba. Z kont organizacji korzystają osoby upoważnione przez organizację. Organizacja odpowiada za to, co robią one w jej imieniu.

## 4. Twoje treści

- Zachowujesz prawa do tego, co wprowadzasz: profilu, Żywego CV, wpisów w dzienniku, zdjęć, dokumentów i wiadomości.
- Udzielasz nam niewyłącznej licencji na hostowanie, przechowywanie, wyświetlanie i przetwarzanie tych treści. Licencja obejmuje wyłącznie to, co jest niezbędne do prowadzenia platformy dla Ciebie oraz do pokazywania treści osobom, na które pozwalają zasady platformy lub Twoje zgody.
- Nie przesyłaj treści, którymi nie masz prawa się dzielić, ani treści niezgodnych z prawem. Nie przesyłaj danych osobowych innych osób, chyba że masz do tego prawo. Nie przesyłaj dokumentów tożsamości, chyba że wymaga tego dana funkcja.
- Zapisanych wpisów w dzienniku nie można później przepisać. Możesz dodać korektę. Dzięki temu rejestr pracy pozostaje rzetelny.

## 5. Widoczność i zgoda

- Twój profil zawodowy **nie** jest widoczny dla firm ani agencji, dopóki nie włączysz widoczności.
- Twoje dane kontaktowe, CV i dokumenty trafiają do firmy dopiero po Twoim odrębnym zatwierdzeniu dla tej firmy.
- Wybory te nigdy nie są łączone z niniejszym Regulaminem i nigdy nie są wymagane do korzystania z konta.
- Szczegóły określa nasza Polityka prywatności.

## 6. Organizacje

Jeżeli korzystasz z platformy w imieniu firmy, agencji, szkoły lub innej organizacji, zastosowanie mają również **Warunki przetwarzania danych przez organizacje**. Na pierwszy plan wysuwają się dwa obowiązki:
- Organizacja, która rejestruje lub przesyła dane o osobach (personelu, byłym personelu, kandydatach, uczących się), musi mieć do tego podstawę prawną i musi poinformować te osoby.
- Odpowiada za prawidłowość tego, co rejestruje.

## 7. Zasady korzystania

Zabronione jest:
- podawanie fałszywych informacji, podszywanie się pod kogokolwiek lub powoływanie się na weryfikację, której nie posiadasz;
- oferowanie regulowanych lub nielegalnych towarów lub usług albo handel nimi, a także publikowanie dyskryminujących lub wprowadzających w błąd ofert pracy;
- zbieranie danych innych użytkowników, scraping platformy lub kontaktowanie się z osobami w celach, na które się nie zgodziły;
- próby obejścia zasad dostępu lub zabezpieczeń albo przeciążania usługi;
- wykorzystywanie platformy do wysyłania niezamówionych wiadomości masowych.

Możemy ukrywać treści lub oferty naruszające te zasady. Oferty publiczne pojawiają się dopiero po moderacji. Możesz zgłosić niewłaściwe zachowanie lub podejrzaną aktywność; moderatorzy je rozpatrują.

## 8. Weryfikacja, AI i dopasowywanie

- Status „zweryfikowano” pojawia się wyłącznie po rzeczywistej weryfikacji przez człowieka, nigdy automatycznie.
- Platforma nigdy nie potwierdza prawa do pracy ani spełnienia wymogów prawnych bez wymaganych dokumentów.
- Funkcje AI dają **sugestie**. Nic nie jest zapisywane jako fakt, dopóki Ty lub osoba odpowiedzialna tego nie potwierdzi.
- Dopasowywanie i ranking pomagają organizacjom w pierwszej kolejności zobaczyć odpowiednie osoby. **Nigdy nikogo nie odrzucają automatycznie.** O każdym kontakcie, ofercie lub wyborze decyduje człowiek. Sposób działania dopasowywania wyjaśnia §8 naszej Polityki prywatności.
- Jeżeli podłączysz własnego asystenta AI (np. ChatGPT lub Claude), działa on wyłącznie w ramach Twoich uprawnień. Działania wywołujące skutki wymagają odrębnego potwierdzenia. Za własne przetwarzanie odpowiada dostawca asystenta.

## 9. Usługi płatne

1. **Co jest bezpłatne.** Udział jako osoba fizyczna jest bezpłatny. Organizacje mogą korzystać z bezpłatnego planu z jednym aktywnym otwartym stanowiskiem jednocześnie.
2. **Co jest płatne.** Organizacje mogą wykupić płatny plan Organization. Cena, okres rozliczeniowy i podatki są wskazane na stronie z cennikiem oraz przy składaniu zamówienia przed dokonaniem płatności. [OWNER DECISION: okres rozliczeniowy]
3. **Płatność.** Płatności przetwarza Stripe. Przy składaniu zamówienia Stripe prosi o dane osoby kontaktowej ds. rozliczeń, adres rozliczeniowy oraz numer VAT lub numer identyfikacji podatkowej. Dane karty trafiają bezpośrednio do Stripe; nigdy ich nie otrzymujemy.
4. **Odnowienie i rezygnacja.** [OWNER DECISION: odnowienie, sposób rezygnacji, skutki rezygnacji, zwroty]
5. **Faktury.** Faktury wystawia UAB „Nonstop Group“. Przechowujemy dokumentację rozliczeniową przez okres wymagany przepisami o rachunkowości i podatkach. [LAWYER: potwierdzić okres]
6. **Konsumenci.** [OWNER DECISION: wyłącznie B2B?]
   - **Jeżeli kupować mogą wyłącznie przedsiębiorcy:** płatne plany są przeznaczone dla przedsiębiorców działających w ramach swojej działalności gospodarczej. Dokonując zakupu, potwierdzasz, że nie działasz jako konsument.
   - **Jeżeli kupować mogą konsumenci:** konsument może odstąpić od umowy w terminie 14 dni bez podania przyczyny (dyrektywa 2011/83/UE, art. 9). Jeżeli poprosisz nas o rozpoczęcie świadczenia usługi w ciągu tych 14 dni, a następnie odstąpisz od umowy, płacisz za to, co zostało świadczone do tego momentu (art. 14 ust. 3). [LAWYER: artykuł litewskiego Kodeksu cywilnego; formularz odstąpienia; zasady dotyczące usług cyfrowych]
7. Funkcje, kredyty i dodatki, które nie są oferowane przy składaniu zamówienia, nie są sprzedawane.

## 10. Własność intelektualna

Oprogramowanie, projekt graficzny i marka platformy należą do Labour Market AI Sp. z o.o. i są nam udostępnione na podstawie licencji. Możesz korzystać z platformy wyłącznie w zakresie dozwolonym niniejszym Regulaminem. Komponenty open source pozostają objęte własnymi licencjami.

## 11. Dostępność i zmiany usługi

Dokładamy starań, aby platforma była dostępna i działała prawidłowo. Nie możemy obiecać, że zawsze będzie dostępna, wolna od błędów lub działać bez przerw. Możemy zmieniać, dodawać lub usuwać funkcje. Jeżeli zmiana istotnie ogranicza usługę płatną, informujemy Cię o tym z wyprzedzeniem. [OWNER DECISION: powiadomienie i środek zaradczy]

## 12. Odpowiedzialność

[LAWYER: postanowienie o odpowiedzialności — wyłączenia i limity dopuszczalne na gruncie prawa litewskiego. Nie może wyłączać odpowiedzialności za winę umyślną lub rażące niedbalstwo ani za szkody na życiu lub zdrowiu, ani ograniczać bezwzględnie obowiązujących praw konsumentów.]

Nie odpowiadamy za:
- to, co postanawiają lub robią inni użytkownicy lub organizacje;
- treść publicznych ogłoszeń o pracę pochodzących od publicznych służb zatrudnienia;
- usługi podmiotów trzecich, z których zdecydujesz się korzystać, np. Twojego własnego asystenta AI.

## 13. Zawieszenie i zakończenie

- Możesz w każdej chwili przestać korzystać z platformy. Możesz zażądać usunięcia konta i danych w sekcji **Panel → Prywatność** (zob. Politykę prywatności).
- Możemy zawiesić lub zamknąć konto, które w poważny sposób lub wielokrotnie narusza niniejszy Regulamin lub prawo. W miarę możliwości uprzedzamy Cię o tym wcześniej i podajemy przyczynę. [OWNER DECISION: zasady i tryb odwoławczy]
- Po zakończeniu umowy o tym, co dzieje się z Twoimi danymi, decyduje Polityka prywatności, w tym o tym, co musimy zachować na podstawie prawa.

## 14. Zmiany niniejszego Regulaminu

Możemy aktualizować niniejszy Regulamin. Pokazujemy nową wersję i jej datę. Przed zastosowaniem istotnych zmian informujemy Cię o nich w produkcie. [OWNER DECISION: termin powiadomienia] Jeżeli się nie zgadzasz, możesz przestać korzystać z platformy, zanim zmiana zacznie obowiązywać.

## 15. Prawo właściwe i spory

- Niniejszy Regulamin oraz każda umowa z klientem podlegają prawu Republiki Litewskiej.
- Spory rozstrzygają właściwe sądy Litwy.
- Te dwie zasady obowiązują, z wyjątkiem przypadków, w których bezwzględnie obowiązujące przepisy prawa konsumenckiego, prawa pracy, prawa ochrony danych lub innego prawa przyznają Ci prawa lub właściwość sądu, których nie można Cię pozbawić. Jeżeli jesteś konsumentem, zawsze zachowujesz bezwzględnie obowiązujące prawa państwa, w którym mieszkasz.
- Konsumenci mogą również zwrócić się w celu pozasądowego rozwiązania sporu do Państwowego Urzędu Ochrony Praw Konsumentów Litwy (Valstybinė vartotojų teisių apsaugos tarnyba). [LAWYER: zweryfikować]
- Prosimy o kontakt w pierwszej kolejności pod adresem info@labourmarket.ai. Chcielibyśmy rozwiązać problem wspólnie z Tobą.

## 16. Wersja

**v2 (projekt), 2026-10-15.** Zastępuje wcześniejszą stronę składającą się z trzech sekcji.
