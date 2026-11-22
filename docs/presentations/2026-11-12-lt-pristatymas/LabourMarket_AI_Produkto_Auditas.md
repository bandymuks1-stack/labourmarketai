# LabourMarket.ai — produkto būklės auditas

**Data:** 2026-11-12 · **Aplinka:** produkcija `https://labourmarket.ai` · **Rengėjas:** Claude Code (atskiras agentas; produkcijoje niekas nekeista)

## 0. Atsakymas vienu sakiniu

**Po maždaug pusės metų kūrimo LabourMarket.ai yra veikiantis produktas.** Darbuotojas ir įmonė gali patys užsiregistruoti, sukurti profilį ar organizaciją, paskelbti poreikį, gauti taisyklėmis parinktų kandidatų sąrašą, susirašinėti, sudaryti komandą, priskirti žmones projektui, registruoti ir patvirtinti darbą — tai įrodo **2026-11-11–12 produkcijoje praėjusios eisenos**.

**Komerciškai platforma dar nepaleista**, ir priežastys žinomos:

- mokėjimai internetu išjungti;
- 6 ES kalbos (tarp jų švedų) neaktyvios;
- programėlių nėra parduotuvėse;
- AI pagalba išjungta;
- vieša darbo skelbimų paieška laisvu tekstu lėta ir randa ne viską.

Beveik visi šie dalykai laukia **savininko sprendimų, paskyrų ar teisinio patvirtinimo**, o ne programavimo. Šiuo metu atidaryti **106 PR**, iš jų dešimtys — RED juodraščiai, laukiantys savininko nuo 2026-10-17–23.

## 1. Kaip tikrinta (ir ko netikrinta)

| Šaltinis | Kas tikrinta | Patikimumas |
|---|---|---|
| **Mano tiesioginė produkcijos patikra 2026-11-12** (Chromium, neprisijungus) | `/lt`, `/lt/for-workers`, `/lt/for-companies`, `/lt/for-agencies`, `/lt/jobs`, `/lt/pricing`, `/lt/auth/signup`, `/lt/company-need`, `/lt/about`, `/lt/professions`, `/lt/match-preview`, `/lt/labour-market`, `/lt/work-abroad`; kalbų adresai `/lt /en /ru /de /nl /pl /sv /da /no /et /lv /fi`; mobilus vaizdas (iPhone 14); laisvo teksto paieška `/lt/jobs?q=…` | Tiesioginis, šiandienos |
| **Produkcijos eisenos (`prod-qa-walk`, GitHub Actions)** su sintetinėmis QA paskyromis | Prisijungus vykstančios kelionės: registracija, įmonė, poreikis, atranka, pokalbiai, komandos, projektai, žurnalas ir t. t. | Produkcijos įrodymas, bet automatizuota naršyklė, ne žmogus |
| `docs/program/FUNCTION_REGISTER.md` (287 funkcijos) | Istoriniai įrodymai, užblokuotų ir neveikiančių funkcijų priežastys | Antrinis — naudotas tik ten, kur nėra naujesnio įrodymo |

**Ko negalėjau patikrinti pats:**

- **Prisijungę scenarijai.** Neturiu QA paskyrų slaptažodžių. Savininko tikros paskyros (prieinamos per MCP jungtį) sąmoningai nenaudojau, kad nepaliesčiau tikrų klientų duomenų. Kurti naujų paskyrų produkcijoje nekūriau, nes tai rašymas į produkciją. Šias keliones vertinu pagal produkcijos eisenų rezultatus.
- **Prieiga prie produkcijos.** Iš pradžių ją blokavo šios aplinkos tinklo politika. Pridėjus `labourmarket.ai` į leidžiamų adresų sąrašą, ji atsirado.
- **Aplinkos ypatybė (ne produkcijos klaida).** Šios aplinkos proxy perkoduoja skliaustus JS failų adresuose (`(` → `%28`), todėl naršyklė iš pradžių rodė klaidos ekraną visuose puslapiuose. Tikrinant `curl` su originaliais skliaustais, tie patys failai atsako 200, o produkcijos eisenose klaidos nėra. Mažos rizikos pastaba: serveris į `%28`/`%29` užkoduotus statinių failų adresus atsako 404 — jei taip elgiasi koks nors įmonės proxy, tokiems naudotojams svetainė neveiktų (P2 pataisymų plane).

### Produkcijos eisenos, kuriomis remiamasi

| Eisena | Rezultatas | Data (UTC) | Run ID |
|---|---|---|---|
| fresh-activation (nauja paskyra → profilis) | PASS | 2026-11-11 18:51 | 43081713520 |
| company-chain (įmonė → poreikis → kandidatai → kontaktas) | PASS | 2026-11-11 19:15 | 43085516592 |
| brigade-formation (komanda → pasiūlymas → priskyrimas) | PASS | 2026-11-11 19:22 | 43086556950 |
| orders-bookings (poreikis → datos → sutikimas → įsipareigojimas) | PASS | 2026-11-11 19:30 | 43087901078 |
| notifications-inapp | PASS | 2026-11-11 19:39 | 43089299869 |
| mobile-surfaces (390 px) | PASS | 2026-11-11 19:44 | 43090008647 |
| project-execution (projektas → priskyrimas → valandos → ataskaita) | PASS | 2026-11-11 20:05 | 43093267147 |
| requirements-countries | PASS | 2026-11-11 22:13 | 43109958689 |
| ai-off-honesty (AI išjungta, sąžiningai pasakoma) | PASS | 2026-11-11 22:19 | 43110727884 |
| chat-continuity (pokalbiai) | PASS | 2026-11-11 22:26 | 43111797032 |
| manager-chat | PASS | 2026-11-12 05:28 | 43161566586 |
| journal-confirm (žurnalas → vadovo patvirtinimas → gyvas CV) | PASS | 2026-11-12 05:32 | 43162100185 |
| marketplace, agency-chain, jobs-search, living-cv-growth ir kt. | PASS (visos 19) | 2026-11-06 | registras, „Changes on 2026-11-06“ |

Pastaba: 2026-11-11 18:55–19:14 tos pačios eisenos pirmą kartą nepraėjo, bet po kelių minučių pakartotos praėjo. Registre tokie atvejai aprašyti kaip eisenos (testo), o ne produkto gedimai, tačiau priežasties šiame audite nepatikrinau.

## 2. Būsenų reikšmės

| Būsena | Reikšmė šiame audite |
|---|---|
| **LIVE_VERIFIED** | Veikia produkcijoje: patvirtinta mano šiandienos patikra arba produkcijos eisena per paskutines 7 dienas |
| **CODE_ONLY** | Kodas yra, praeina automatiniai testai, produkcijoje nepatvirtinta |
| **BLOCKED** | Sukurta, bet išjungta arba laukia savininko sprendimo, paskyros ar teisinio patvirtinimo |
| **PLANNED** | Dar nesukurta |
| **NOT_VERIFIED** | Neaišku: įrodymas senas, dalinis arba prieštaringas |

## 3. Dešimt prioritetinių kelionių

| # | Kelionė | Būsena | Pasiekiama įprastam naudotojui? | Visas procesas? | Kas neveikia / neužbaigta | Įrodymas, data | Prioritetas |
|---|---|---|---|---|---|---|---|
| 1 | Darbuotojo registracija ir profilis | **LIVE_VERIFIED** | Taip: el. paštas, Google, LinkedIn, Facebook | Taip: registracija → profilis → gyvas CV | AI CV struktūravimas išjungtas (veikia nemokamas CV importas); išorinės profilio nuorodos laukia RED #2471 | `/lt/auth/signup` 200 (2026-11-12); fresh-activation 43081713520 (2026-11-11) | P2 |
| 2 | Įmonės registracija ir organizacija | **LIVE_VERIFIED** | Taip, ta pati paskyra → „pridėti įmonę“ | Taip | Viena organizacija negali turėti kelių veiklos tipų (ORG-2, savininko sprendimas) | fresh-activation, company-chain 43085516592 (2026-11-11) | P3 |
| 3 | Poreikio / skelbimo paskelbimas | **LIVE_VERIFIED** (prisijungus) · **LIVE_VERIFIED** viešai forma | Taip. Be paskyros — vieša užklausos forma `/lt/company-need`, kurią **tvarko žmogus (operatorius)** | Prisijungus — taip. Be paskyros — iki operatoriaus kontakto | Nemokamo plano riba „1 aktyvi pozicija“ produkcijoje **nepatikrinta** (7.2 CODE_ONLY — pilotinė organizacija ribą turi panaikintą). Įmonės poreikiai **nepatenka į viešą /jobs lentą** (ten tik oficialūs viešų užimtumo šaltinių skelbimai) | company-chain 2026-11-11; `/lt/company-need` 200 (2026-11-12) | P1 |
| 4 | Darbuotojų ir įmonių paieška | **LIVE_VERIFIED**, su išlyga | Taip | Taip | **Viešos /jobs paieškos laisvu tekstu klaida (SR-1/SR-10) iš dalies išlieka:** `byggarbetare` — 3,5 s, 6 rezultatai (2026-11-04: 0 rezultatų ir laiko limitas); profesijų žodžiai veikia per 0,4–0,7 s. Įmonių paieška prisijungus su nepatvirtintų įmonių žyma — RED juodraštis #3214 | Mano patikra 2026-11-12; company-chain | **P1** |
| 5 | Kandidatų ir pasiūlymų atitiktis | **LIVE_VERIFIED** (taisyklėmis) · **BLOCKED** (AI) | Taip | Taip: poreikis → surikiuotas sąrašas su paaiškinimu | AI atitiktis išjungta (savininko ir teisinis sprendimas). Senesni poreikiai be atitikties laukia patvirtinto pildymo | company-chain; `/lt/match-preview` 200; ai-off-honesty 43110727884 | P2 |
| 6 | Bendravimas ir pasiūlymai | **LIVE_VERIFIED** | Taip | Taip: susidomėjimas → kontaktas → gija → datos → sutikimas | Žinučių vertimas (AI) ir push pranešimai išjungti; el. laiškas apie naują žinutę dar ne pagal nutylėjimą (#3226 juodraštis); B2B pasiūlymų pranešimai kitai pusei — #3227 juodraštis | chat-continuity 43111797032, orders-bookings 43087901078 | P1 (pranešimai) |
| 7 | B2B bendradarbiavimas | **NOT_VERIFIED** kaip vientisa grandinė | Iš dalies | **Ne vienu srautu.** Atskiros dalys veikia (derybos 4.7, pasiūlymai ir sutartys 6.6, užsakovo erdvė 6.4, komandos pasiūlymas), bet **„priimta užklausa → pasiūlymas → sutartis“** grandinė laukia RED-1 (#2946, nuo 2026-11-02). Viešas įmonės puslapis `/business` — BLOCKED; įmonių paieška — RED #3214 | Registras J-13 (2026-11-03); brigade-formation 2026-11-11 | **P0** |
| 8 | Darbuotojų ir komandų priskyrimas | **LIVE_VERIFIED** | Taip | Taip | Projekto prognozės ir persidengimų įspėjimai — NOT_VERIFIED | project-execution 43093267147, brigade-formation 43086556950 (2026-11-11) | P3 |
| 9 | Darbo žurnalas, patvirtinimai, gyvas CV | **LIVE_VERIFIED** | Taip | Taip: įrašas → vadovo patvirtinimas → gyvas CV | Žurnalas balsu — BLOCKED (nėra kalbos atpažinimo paslaugos); patirties ginčų dalis — FAIL (saugumo / moderavimo punktas, detalės privačios) | journal-confirm 43162100185 (2026-11-12) | P2 |
| 10a | Kalbos | **LIVE_VERIFIED** 6 · **BLOCKED** 6 | LT, EN, RU, DE, NL, PL — taip | — | **SV, DA, NO, ET, LV, FI → nukreipiama į EN (307).** Trūksta ~9 400 vertimų vienai kalbai, 22–44 % esamų — EN vietos rezervai | Mano patikra 2026-11-12 | **P0** (SV, NO, DA rinkoms) |
| 10b | Mobili versija | **LIVE_VERIFIED** | Taip | Taip | — | mobile-surfaces 43090008647 (2026-11-11); mano iPhone 14 ekranai 2026-11-12 | — |
| 10c | Programėlės (Android / iOS) | **BLOCKED** | **Ne** — parduotuvėse jų nėra | Programėlės veikia su produkcija (bandymai 2026-11-02) | Reikia savininko Google Play ir Apple paskyrų; leidimo darbų eiga — PR #3217 (juodraštis), kelias į TestFlight / Play — #3216 | Registras 8.15–8.18 | **P0** |

## 4. Atsakymai į tiesioginius klausimus

**Kodėl neaktyvuotos svarbios ES kalbos (SV, DA, NO, ET, LV, FI)?**
Ne dėl kodo. Šešios aktyvios kalbos turi visus 15 191 tekstą. SV, DA, NO, ET ir LV turi tik ~5 817 iš jų (FI dar mažiau), o 22–44 % esamų tekstų vis dar anglų kalbos vietos rezervai. Trūksta ~9 400 vertimų vienai kalbai ir jų peržiūros. Registre tai pažymėta kaip **savininko sprendimas dėl vertimo šaltinio ir biudžeto**: galioja „jokio mokamo AI“ politika, todėl mašininis vertimas neleidžiamas be savininko leidimo. Šiandien produkcija SV, DA, NO, ET, LV ir FI nukreipia į anglų kalbą. Švedų sutikimų tekstai — juodraštis #3232 (2026-11-12).

**Kodėl programėlės dar nepaskelbtos?**
Android ir iOS programėlės sukurtos ir patikrintos su produkcija: prisijungimas, žurnalas, žinutės, skelbimai (2026-11-02). Jų nėra parduotuvėse, nes **nėra savininko Google Play ir Apple Developer paskyrų** (8.15). Paruošimo darbai — #3216 (kelias į TestFlight ir Play vidinį testavimą) ir #3217 (leidimo darbų eiga), abu juodraščiai nuo 2026-11-11. „Mobile“ ir „iOS“ darbų eigos repozitorijoje yra nuo 2026-08-29–30, vadinasi, programėlės nepublikuotos jau apie 2,5 mėn.

**Kokia reali mokėjimų ir kainodaros būklė?**
- `/lt/pricing` produkcijoje (2026-11-12): „Kainos patvirtintos savininko“. **Nemokamas — 0 €** (1 aktyvi pozicija, atrankos sąrašas ir kontaktas, rezervacijos, projektai, darbo patvirtinimas). **Organizacija — 99 €/mėn.** (be pozicijų limito, projektų valdymas, ataskaitos, CSV). Ypatingiems poreikiams — susitarimu.
- **„Vieši mokėjimai dar neįjungti“**: mokėjimo puslapio nėra, aktyvinama rankiniu būdu per pilotą. Mokama paslauga šiandien — žmogaus atliekama atranka su sėkmės mokesčiu; sumos viešai neskelbiamos, kaina patvirtinama prieš darbą.
- Blokuoja: 7.28 (mokėtojas ir sąlygos: atnaujinimas, atšaukimas, grąžinimas — FAIL, laukia savininko ir teisininko); 7.15 (99 € apmokėjimas paslėptas pilotui, PVM kelias RED #2685); 7.29 (Stripe Tax); #2441 (antrasis savininko veiksmas gyviems mokėjimams); #2842 (mokamų paslaugų sąlygų projektas teisininkui, nuo 2026-10-27).

**Ar įmonė gali savarankiškai užsiregistruoti, paskelbti poreikį ir gauti kandidatų?**
**Taip** (company-chain, 2026-11-11). Išlygos:
- kandidatai parenkami taisyklėmis, ne AI;
- daugiau nei 1 pozicijai reikia mokamo plano, kurio internetu įsigyti negalima;
- vieša užklausa be paskyros keliauja operatoriui, o ne automatiškai į platformą.

**Ar darbuotojas gali savarankiškai rasti darbą ir susisiekti su darbdaviu?**
**Iš dalies.**
- Gali naršyti 57 086 viešus skelbimus (be paskyros). Prisijungęs mato darbdavį ir vietą, o kandidatuoja **originaliame šaltinyje**, ne platformoje.
- Platformos įmonių poreikiams gali parodyti susidomėjimą, o tada **įmonė** užmezga kontaktą (J-3, LIVE_VERIFIED).
- Darbuotojas negali pirmas parašyti bet kuriai įmonei — taip suprojektuota dėl privatumo.

**Ar B2B bendradarbiavimas realiai užbaigiamas?**
**Ne vienu nepertrauktu srautu.** Derybos, pasiūlymai ir sutartys veikia atskirai. Paslaugų užklausos susiejimas su pasiūlymu ir sutartimi laukia RED-1 (#2946), viešas įmonės puslapis — owner RED, įmonių paieška — RED #3214. Šiandien B2B galima pradėti ir vesti platformoje, bet perėjimai tarp žingsnių dar ne visi automatiniai.

**Kurios funkcijos ilgai lieka „sukurta / tikrinama“?**
Registras pradėtas 2026-10-28, todėl tikslesnį amžių rodo PR datos:
- **RED juodraščiai, laukiantys savininko nuo 2026-10-16–18:** išorinės profilio nuorodos ir darbdavio duomenų atskleidimas (#2471); 3 nemokamos profilio peržiūros ir VIP (#2474); ESCO klasifikatorius (#2463); gyvų mokėjimų įjungimas (#2441); MCP klientų atitikties eisena (#2454).
- **Nuo 2026-10-21–27:** PVM / Stripe Tax (#2685); sąskaitos (#2704); OAuth teisės (#2806–#2812); mokymai ne nariams (#2816); sąlygos teisininkui (#2842).
- **Nuo 2026-08-29–30:** mobilios programėlės (nepublikuotos parduotuvėse).
- **Kalbų aktyvavimas** užstrigęs bent nuo 2026-10-28 (katalogo auditas).

Atidarytų PR iš viso: **106** (2026-11-12).

## 5. Funkcijų registro suvestinė (287 funkcijos)

| Registro būsena | Kiekis | Šio audito būsena |
|---|---|---|
| LIVE_VERIFIED | 197 | LIVE_VERIFIED (svarbiausios iš jų patvirtintos ir 2026-11-11–12 eisenose) |
| PASS_CI_ONLY | 5 | CODE_ONLY |
| NOT_VERIFIED | 16 | NOT_VERIFIED |
| BLOCKED | 39 | BLOCKED |
| FAIL | 8 | BLOCKED arba klaida: SR-1/SR-10 paieška — vartotojo blokeris; 13.1 VPS diegimas, 9.25 saugumo perspėjimai, 10.20 senų skelbimų šalinimas — infrastruktūra; 7.27, 7.28, 11.8, 13.17 — savininko sprendimai |
| NOT_IMPLEMENTED | 22 | PLANNED |

Blokavimo priežastys (iš registro triažo, 73 FAIL / BLOCKED eilutės):

| Priežastis | Kiekis |
|---|---|
| Savininko sprendimas, paskyra ar teisinis patvirtinimas | 48 |
| Neplanuota / nebūtina pagrindiniams scenarijams | 15 |
| Infrastruktūra | 6 |
| Tikras naudotojo blokeris vebe (/jobs paieška) | 2 |
| Testo apribojimas | 2 |

Funkcija-po-funkcijos sąrašas: `LabourMarket_AI_Funkciju_Katalogas_LT.md`.

## 6. Šiandienos faktai produkcijoje (tinka viešam naudojimui)

- **57 086** aktyvūs darbo skelbimai ir **13 730** darbdavių darbo pasiūloje. Šaltinis — oficialūs vieši užimtumo šaltiniai (Švedija, Norvegija); `/lt` rodo „atnaujinta 2026-11-11“.
- Platformos kalbos: **LT, EN, RU, DE, NL, PL**.
- Kainos (`/lt/pricing`, savininko patvirtintos): **0 €** ir **99 €/mėn.**; mokėjimai internetu dar neįjungti.
- Visų profesijų puslapis `/lt/professions`: statyba, logistika, buhalterija, teisė, inžinerija, IT, pardavimai, švietimas, dizainas, priežiūra ir kt.

**Ko NEGALIMA teigti viešai:** naudotojų, įmonių, įdarbinimų ar pajamų skaičių — patikrintų duomenų nėra, o savininko paskyros duomenų sąmoningai neskaičiau.
