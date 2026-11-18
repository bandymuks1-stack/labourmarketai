# Informacja dla osób nieposiadających konta — LabourMarket.ai

*Informacja na podstawie art. 14 RODO (dane pozyskane w sposób inny niż od Ciebie)*

> **Status:** DRAFT v2 — 2026-10-15 (projekt)
> **Wymaga weryfikacji prawnika / Requires lawyer review.** Projekt do weryfikacji przez prawnika. Nie jest ostateczny, nie ma jeszcze mocy prawnej, nie został poświadczony.
> **Tłumaczenie z angielskiego projektu; poprawność prawna tego tłumaczenia wymaga odrębnej weryfikacji przez wykwalifikowanego prawnika/tłumacza.** (Translation from the English draft; legal accuracy of this translation requires separate review by a qualified lawyer/translator.)
>
> **Wykorzystane źródła faktów:**
> - Audyt z 2026-10-15 `01-personal-data-inventory-and-erasure-classes.md` §1c, §3.3 (43 osoby na liście personelu, 41 niepowiązanych z kontem; 2 944 rekordy dowodowe; przejściowe wiersze z `person_label` + `activity_text`; `source_fact` może zawierać imiona i nazwiska oraz adresy osób; powiązanie z kontem SET NULL; brak ścieżki realizacji praw bez konta)
> - `03-rights-consent-legal-pages.md` §0, §3 (wszystkie 43 osoby w jednej organizacji; rekordy dostępne do odczytu dla kierowników organizacji importującej i organizacji będących stronami; brak informacji z art. 14; przejęcie rekordu wyłącznie przez zaproszenie wysłane przez kierownika; kwestionowanie dopiero po powiązaniu; rekordy wyłącznie do dopisywania; ogłoszenia SE: 41 353 opisy z adresem e-mail, 22 500 ze sformułowaniami o osobie kontaktowej; NAV: 3 809 z numerami przypominającymi numery telefonów; treść ogłoszeń wyświetlana dosłownie zalogowanym użytkownikom; usunięte ogłoszenia są przechowywane)
> - `02-processors-transfers-cookies-ai.md` §1 wiersz 15, D13 (`contactList` NAV nigdy nie jest przechowywana; opis SE jest przechowywany); §1 wiersze 9, 21 (kontakty w zapytaniach o potrzeby firm; e-maile z zaproszeniami)
> - `docs/legal/retention-decision-package-v1.md` decyzja 3b
>
> **Otwarte decyzje:**
> 1. [OWNER DECISION: kanał składania żądań dla osób bez konta — propozycja tymczasowa: info@labourmarket.ai; rozważyć dedykowany formularz internetowy z weryfikacją tożsamości]
> 2. [LAWYER: podział ról w odniesieniu do rekordów dostarczonych przez organizacje — organizacja jako administrator, a platforma jako podmiot przetwarzający; współadministratorzy (art. 26); albo niezależni administratorzy. Zob. `organisation-data-terms-v2` §2]
> 3. [LAWYER/OWNER: kto i kiedy przekazuje niniejszą informację osobom z list personelu organizacji (art. 14 ust. 3: najpóźniej w ciągu miesiąca). Obecnie informacja nie jest przekazywana]
> 4. [LAWYER: czy art. 14 ust. 5 lit. b (niewspółmiernie duży wysiłek) ma zastosowanie do osób kontaktowych w publicznych ogłoszeniach o pracę oraz jakie środki publicznego udostępnienia informacji muszą mu towarzyszyć]
> 5. [OWNER DECISION: zaczerniać adresy e-mail i numery telefonów w treści ogłoszeń przed wyświetleniem czy je zachować; okres przechowywania usuniętych ogłoszeń (propozycja: 12 miesięcy)]
> 6. [OWNER DECISION: ścieżka usuwania lub zaczerniania dla rekordów dowodowych organizacji prowadzonych wyłącznie w trybie dopisywania]
> 7. [OWNER DECISION: okres przechowywania przejściowych wierszy importu]

---

## 1. Dlaczego możesz czytać tę informację

Platforma LabourMarket.ai może przechowywać informacje na Twój temat, nawet jeśli nigdy się nie zarejestrowałeś(-aś). Dzieje się tak na cztery sposoby:

- **A.** Firma, agencja lub szkoła **zarejestrowała lub zaimportowała Twoją historię pracy**. Na przykład były pracodawca wprowadził projekty, przy których pracowałeś(-aś).
- **B.** Jesteś wskazany(-a) jako **osoba kontaktowa w publicznym ogłoszeniu o pracę**, opublikowanym przez szwedzką lub norweską publiczną służbę zatrudnienia.
- **C.** Jesteś **osobą kontaktową w zapytaniu biznesowym**, które przesłała nam firma (na przykład w sprawie zapotrzebowania na personel).
- **D.** Ktoś **zaprosił Cię e-mailem** do dołączenia, a Ty jeszcze nie dołączyłeś(-aś).

Niniejsza informacja wyjaśnia, co przechowujemy, dlaczego i co możesz zrobić.

## 2. Kto odpowiada za dane

**UAB „Nonstop Group“**
Kod przedsiębiorstwa 302676973
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Litwa
Kontakt w sprawach prywatności: **info@labourmarket.ai**. Nie wyznaczono inspektora ochrony danych.

W **przypadku A** organizacja, która zarejestrowała Twoją historię, decyduje o tym, co na Twój temat rejestruje, i odpowiada za te rekordy. Za własne działania platformy w odniesieniu do nich odpowiadamy my (na przykład za powiązanie rekordu z kontem, jeśli dołączysz później). [LAWYER: potwierdzić podział ról]

## 3. Co przechowujemy i skąd to pochodzi

| Przypadek | Dane | Źródło |
|---|---|---|
| A — historia pracy | Twoje imię i nazwisko w zapisie organizacji, nadany Ci przez organizację identyfikator, opisy pracy, daty, miejsca i adresy wykonywania pracy, notatki, poświadczenia organizacji oraz sygnały dotyczące umiejętności, które platforma wyprowadza z tych rekordów | organizacja (jej pliki lub importy) |
| B — ogłoszenia o pracę | nazwa pracodawcy, numer organizacji (który może identyfikować jednoosobowego przedsiębiorcę) i treść ogłoszenia, która może zawierać imię i nazwisko, adres e-mail i telefon osoby kontaktowej. Nie przechowujemy odrębnej, ustrukturyzowanej listy kontaktów służby zatrudnienia | Arbetsförmedlingen (Szwecja) i NAV (Norwegia), publiczne otwarte dane |
| C — zapytania | nazwa firmy, Twoje imię i nazwisko oraz dane kontaktowe w brzmieniu wprowadzonym przez firmę, szczegóły potrzeby | firma, która przesłała zapytanie |
| D — zaproszenia | Twój adres e-mail, imię wpisane przez zapraszającego oraz jego wiadomość | osoba lub organizacja, która Cię zaprosiła |

## 4. W jakim celu je wykorzystujemy i na jakiej podstawie prawnej

| Przypadek | Cel | Podstawa prawna |
|---|---|---|
| A | organizacja przechowuje i wykorzystuje własne rekordy pracy. Platforma je hostuje, umożliwia Ci ich późniejsze przejęcie i wyprowadza sygnały dotyczące umiejętności | własna podstawa organizacji dla jej rekordów. W zakresie powiązań i wyprowadzonych sygnałów na platformie: nasz prawnie uzasadniony interes polegający na zapewnieniu osobom użytecznego rejestru ich rzeczywistej pracy (art. 6 ust. 1 lit. f RODO) [LAWYER] |
| B | pokazywanie dostępnych ofert pracy osobom poszukującym pracy, aby mogły aplikować | prawnie uzasadniony interes (art. 6 ust. 1 lit. f): ogłoszenie zostało opublikowane po to, aby osoby kontaktowały się z pracodawcą [LAWYER] |
| C | odpowiedź na zapytanie i przygotowanie ewentualnej umowy | działania przed zawarciem umowy / prawnie uzasadniony interes (art. 6 ust. 1 lit. b i f) |
| D | doręczenie zaproszenia i umożliwienie Ci jego przyjęcia | prawnie uzasadniony interes zapraszającego oraz Twój interes w otrzymaniu zaproszenia (art. 6 ust. 1 lit. f) |

Nie prosimy o szczególne kategorie danych (art. 9) na Twój temat. Jeżeli rekord omyłkowo zawiera takie dane, prosimy o poinformowanie nas lub organizacji.

## 5. Kto może je zobaczyć

- **Przypadek A:** kierownicy organizacji, która je zarejestrowała. Również kierownicy innej organizacji wskazanej jako strona w tym samym rekordzie (na przykład klienta projektu). Inni użytkownicy nie mają dostępu. Rekord **nie** jest pokazywany pracodawcom wyszukującym kandydatów.
- **Przypadek B:** treść ogłoszenia, w tym zawarte w niej dane kontaktowe, jest wyświetlana **zalogowanym użytkownikom** platformy. [OWNER DECISION: zaczernianie]
- **Przypadek C:** nasz zespół. Jeżeli włączony jest kanał powiadomień właściciela, do właściciela trafia przez Telegram lub mostek Agentai OS krótkie powiadomienie; nie zawiera ono danych pracowników. [OWNER: potwierdzić]
- **Przypadek D:** zapraszający i nasz zespół.

Dane hostują nasi usługodawcy (Supabase, w UE; Vercel; pozostali wymienieni w Polityce prywatności, §6). Przekazywanie danych poza EOG wyjaśnia §7 Polityki prywatności.

## 6. Jak długo je przechowujemy

- **A:** tak długo, jak organizacja przechowuje rekord. [OWNER DECISION: okres domyślny; przejściowe wiersze importu]
- **B:** dopóki ogłoszenie jest aktywne. Usunięte ogłoszenia są ukrywane, ale obecnie przechowywane. [OWNER DECISION: propozycja — 12 miesięcy od usunięcia]
- **C:** [OWNER DECISION: propozycja — 24 miesiące od zamknięcia zapytania]
- **D:** [OWNER DECISION: do przyjęcia, wycofania lub wygaśnięcia]

## 7. Twoje prawa

Przysługują Ci te same prawa co posiadaczom kont: prawo dostępu, sprostowania, usunięcia danych, ograniczenia przetwarzania, sprzeciwu oraz — w stosownych przypadkach — przenoszenia danych (art. 15–21 RODO). Opisuje je §10 Polityki prywatności.

**Sprzeciw.** Jeżeli opieramy się na prawnie uzasadnionych interesach (art. 6 ust. 1 lit. f), możesz wnieść sprzeciw. Wówczas zaprzestajemy przetwarzania, chyba że mamy ważne podstawy. W przypadku danych kontaktowych w ogłoszeniach o pracę (przypadek B) ukryjemy lub usuniemy Twoje dane z naszej kopii ogłoszenia. [OWNER DECISION: potwierdzić działanie]

**Przypadek A — rekordy prowadzone przez organizację.**
- Możesz zapytać nas, która organizacja zarejestrowała Twoją historię. Przekażemy Twoje żądanie tej organizacji lub podamy Ci jej dane kontaktowe.
- Usuwamy sygnały dotyczące umiejętności i powiązania, które wyprowadziła sama platforma.
- O własnych rekordach decyduje organizacja. Musi Ci odpowiedzieć w ramach własnych obowiązków wynikających z RODO.
- Rekordy można wyłącznie uzupełniać, więc korekta jest dodawana jako nowy wpis. [OWNER DECISION: ścieżka usuwania]

**Przejęcie Twojej historii pracy.** Jeżeli chcesz mieć historię na własnym koncie, poproś organizację o wysłanie Ci zaproszenia. Obecnie bez zaproszenia nie można przejąć rekordu; zapobiega to wyszukiwaniu cudzych rekordów przez osoby obce. Po powiązaniu Twojego konta możesz zobaczyć rekord i go zakwestionować.

## 8. Jak się z nami skontaktować

[OWNER DECISION: kanał] Napisz na adres **info@labourmarket.ai**, w temacie wpisując „Request — no account” („Żądanie — brak konta”). Podaj nam:
- którego przypadku dotyczy sprawa (A, B, C lub D);
- swoje imię i nazwisko w brzmieniu, w jakim może występować w rekordzie;
- w przypadku A — organizację, jeżeli ją znasz;
- w przypadku B — link do ogłoszenia lub nazwę pracodawcy.

**Weryfikacja tożsamości.** Ponieważ nie masz konta, musimy potwierdzić, że jesteś osobą, której dane dotyczą, zanim cokolwiek udostępnimy lub zmienimy. Prosimy wyłącznie o to, co niezbędne, na przykład o odpowiedź z adresu e-mail widniejącego w rekordzie lub o informacje, które znasz tylko Ty. Nie prosimy o kopię dokumentu tożsamości, chyba że nie ma innej możliwości. [LAWYER: potwierdzić]

**Termin.** Odpowiadamy w terminie **jednego miesiąca**. W przypadku żądań złożonych możemy przedłużyć ten termin o kolejne dwa miesiące; w takim przypadku informujemy Cię o tym w ciągu pierwszego miesiąca (art. 12 ust. 3). Żądania są bezpłatne.

## 9. Skargi

Możesz wnieść skargę do organu nadzorczego w państwie UE, w którym mieszkasz lub pracujesz. Naszym wiodącym organem nadzorczym jest Państwowa Inspekcja Ochrony Danych Litwy (Valstybinė duomenų apsaugos inspekcija, VDAI): L. Sapiegos g. 17, LT-10312 Vilnius, ada@ada.lt, vdai.lrv.lt. [LAWYER: zweryfikować]

## 10. Wersja

v2 (projekt), 2026-10-15. Niniejsza informacja jest opublikowana pod adresem [OWNER DECISION: publiczny adres URL, np. /legal/no-account-notice]. Link do niej znajduje się w Polityce prywatności.
