# LabourMarket.ai — 12 valandų būklės ataskaita

<!-- generated-at: 2026-11-15T20:18:08.048Z -->

Sugeneruota 2026-11-15 22:18 (Lietuvos laiku). Laikotarpis: nuo 2026-11-15 10:15.

**Ataskaitos būsena: COMPLETE** — visos užklausos pavyko, registras perskaitytas visas.

Privalomos CI patikros: quality, migration-safety (šaltinis: repository policy (CLAUDE.md); branch protection is not readable with this token). Peržiūra galioja tik su pilnu dabartinės versijos SHA, patikimo autoriaus ir ne senesnė už tą versiją.

Kanoninis dokumentas (savininko nurodymas 2026-11-14, P0). Kiekviena ataskaita perrašo šį failą; ankstesnės ataskaitos — šio failo git istorijoje. Funkcijų būsenos imamos tik iš [`FUNCTION_REGISTER.md`](FUNCTION_REGISTER.md) eilučių: funkcija laikoma veikiančia tik tada, kai jos eilutė turi produkcijos įrodymą (`LIVE_VERIFIED`). Kodas ar žalias CI veikimo neįrodo. Generatorius: `.github/scripts/status-report.mjs`.

**Produkcija:** versija `f461497e`, sveikata gera (DB 402 ms), patikrinta 2026-11-15 22:18.

**Funkcijos:** 287 privalomos apimties funkcijų; veikia produkcijoje (įrodyta) 198 (69.0 %).

Ką matuoja šis skaičius: kiek registro funkcijų turi produkcijos įrodymą (`LIVE_VERIFIED` — paleidimo ar patikros ID produkcijoje). Tai nėra užbaigimo procentas ir nereiškia, kad likusios 89 neveikia. Jos skirstomos taip: TIK KODE 15, TIK CI PATIKRINTA 4, NEPATIKRINTA 1, NEVEIKIA 8, NEĮGYVENDINTA 22, BLOKUOTA 39. Neveikiančiomis laikomos tik NEVEIKIA eilutės; NEPATIKRINTA, TIK KODE ir TIK CI PATIKRINTA reiškia „neįrodyta produkcijoje“, ne „sugedę“.

**Neatitikimai:** nerasta.

## Patvirtinta naujausia būsena

Paskutinis užbaigtas produkcijos bandymas kiekvienam scenarijui ir ekranui, nepriklausomai nuo 12 valandų laikotarpio. Senesnis paleidimas niekada nepakeičia naujesnio. Šaltinis: [`STATUS_EVIDENCE.json`](STATUS_EVIDENCE.json), papildomas iš GitHub kiekvienos ataskaitos metu.

| Bandymas | Ekranas | Rezultatas | Versija | Laikas | Run |
|---|---|---|---|---|---|
| agency-chain | telefonas 390 px | sėkmingas | `1fcff8a6` | 2026-11-15 16:19 | [43723431255](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43723431255) |
| agency-chain | telefonas 375 px | sėkmingas | `d225f58a` | 2026-11-15 19:55 | [43743349514](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743349514) |
| company-chain | telefonas 390 px | sėkmingas | `1fcff8a6` | 2026-11-15 15:51 | [43720771951](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43720771951) |
| company-chain | telefonas 375 px | sėkmingas | `1fcff8a6` | 2026-11-15 16:06 | [43722041470](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43722041470) |
| learning-practice | telefonas 390 px | sėkmingas | `1fcff8a6` | 2026-11-15 16:46 | [43725773540](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43725773540) |
| learning-practice | telefonas 375 px | sėkmingas | `1fcff8a6` | 2026-11-15 16:59 | [43726964928](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43726964928) |
| profile-cv-history | telefonas 390 px | sėkmingas | `f862c524` | 2026-11-15 12:58 | [43705887379](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43705887379) |
| profile-cv-history | telefonas 375 px | sėkmingas | `1fcff8a6` | 2026-11-15 14:33 | [43713174624](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43713174624) |

Šio laikotarpio bandymai be ekrano informacijos (paleisti prieš ekrano įtraukimą į pavadinimą; į sąrašą neįtraukti, kad nebūtų spėliojama): agency-chain [43724558463](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43724558463).

## Pokyčiai nuo ankstesnės ataskaitos

Lyginama su ataskaita, sugeneruota 2026-11-15 21:41.

- Veikia produkcijoje: 198 → 198.
- Atvirų PR: 134 → 132; sujungta per laikotarpį 19.
- Produkcijos diegimų per laikotarpį: 11 sėkmingi, 0 nepavykę.

Funkcijų būsenų pokyčių registre nėra.

## B. Trumpa vadovo suvestinė

**Sinchronizuota ataskaita, 2026-11-15 vakaras** (savininko nurodymas dėl ataskaitų sinchronizavimo). Pakeičia 21:41 ataskaitą, kurios santrauka buvo pasenusi.

- **Produkcija:** versija ir sveikata – antraštėje (patikrinta šios ataskaitos metu). `main` patikros žalios.
- **Telefono bandymai produkcijoje: 8/8 sėkmingi** (keturi scenarijai × 390 ir 375 px), įskaitant pakartotą agency-chain 375 px (`43743349514`, `d225f58a`). Pirmasis jo paleidimas (`43724558463`) nepavyko dėl pasiektos atvirų pasiūlymų ribos sintetinėje paskyroje; pataisyta #3397 (aiškus pranešimas) ir #3398 (bandymas po savęs uždaro pasiūlymą). Visi rezultatai – „Patvirtinta naujausia būsena“.
- **Sujungta šį vakarą ir įdiegta:** #3225, #3390, #3385, #3399, #3400, #3348, #3351, #3375, #3384; vėliau R patvirtinti #3356 ir #3339 sujungti.
- **Savininko jau priimti sprendimai, vykdoma:**
  - #3302 (kainų puslapio tekstai, savininko patvirtinimai 11-12 ir 11-13) – suderintas su `main`, R2 be blokuojančių pastabų, laukiama R peržiūros. Po sujungimo #3250 uždaromas kaip dublikatas (jo turinys yra #3302).
  - #3356 – R pastabos (sprendimas 0025) ištaisytos, R patvirtino, sujungta.
  - #3232 (švediški sutikimų tekstai) – paruoštas, R2 be blokuojančių pastabų; nejungiamas, kol savininkas nepatvirtins švediškų tekstų ir atskirai migracijos turinio.
- **Neveikia arba neįrodyta:** mokėjimų grandinė J-14 (7.5 nepatikrinta, 7.28 neveikia), programėlių parduotuvės (8.15 blokuota).
- **Artimiausi darbai:** R peržiūri #3302 ir #3227; F taiso #3218 (41 švediškas tekstas telefono programėlėje); A tikrina darbdavio kelią iki įdarbinimo.

## A1. Būsenos pagal registro grupes

| Sritis | Iš viso | VEIKIA PRODUKCIJOJE | TIK KODE | TIK CI PATIKRINTA | NEPATIKRINTA | NEVEIKIA | NEĮGYVENDINTA | BLOKUOTA |
|---|---|---|---|---|---|---|---|---|
| 1. Paskyra, registracija ir organizacijos | 15 | 14 | 0 | 0 | 0 | 0 | 0 | 1 |
| 2. Darbuotojo profilis, darbo žurnalas ir gyvas CV | 37 | 29 | 2 | 0 | 0 | 1 | 1 | 4 |
| 3. Įmonės darbai ir projektai | 36 | 33 | 3 | 0 | 0 | 0 | 0 | 0 |
| 4. Poreikiai, darbo skelbimai ir atranka | 26 | 23 | 1 | 0 | 0 | 0 | 1 | 1 |
| 5. Pokalbiai ir pranešimai | 21 | 15 | 1 | 0 | 0 | 0 | 2 | 3 |
| 6. Prekyvietė | 22 | 15 | 0 | 0 | 0 | 0 | 6 | 1 |
| 7. Planai ir mokėjimai | 29 | 4 | 6 | 1 | 1 | 2 | 8 | 7 |
| 8. Kalbos ir rinkos | 18 | 12 | 0 | 0 | 0 | 0 | 0 | 6 |
| 9. Administravimas, privatumas ir saugumas | 24 | 18 | 0 | 2 | 0 | 1 | 0 | 3 |
| 10. Pagalbininkai ir dirbtinis intelektas | 26 | 11 | 0 | 0 | 0 | 1 | 3 | 11 |
| 11. Mokymasis | 10 | 7 | 0 | 0 | 0 | 1 | 1 | 1 |
| 12. Rinkos žinios | 6 | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| 13. Infrastruktūra ir veikimas | 17 | 11 | 2 | 1 | 0 | 2 | 0 | 1 |
| **Iš viso** | 287 | 198 | 15 | 4 | 1 | 8 | 22 | 39 |

## A2. Penkios naudotojų grupės

Produkcijos bandymai 2026-11-15, telefono ekranuose (390 ir 375 px) – visi sėkmingi:

| Grupė | Bandymas | 390 px | 375 px |
|---|---|---|---|
| Darbuotojas | profile-cv-history | `43705887379` | `43713174624` |
| Darbdavys | company-chain | `43720771951` | `43722041470` |
| Agentūra | agency-chain | `43723431255` | `43743349514` (pakartotas po #3397/#3398) |
| Studentas / praktikantas, mokymo įstaiga | learning-practice | `43725773540` | `43726964928` |

Kompiuterio ekrano bandymai vyksta automatinėje rotacijoje (push / schedule).

| Sritis | Iš viso | VEIKIA PRODUKCIJOJE | TIK KODE | TIK CI PATIKRINTA | NEPATIKRINTA | NEVEIKIA | NEĮGYVENDINTA | BLOKUOTA |
|---|---|---|---|---|---|---|---|---|
| Darbuotojas | 130 | 100 | 2 | 0 | 0 | 3 | 10 | 15 |
| Darbdavys | 173 | 122 | 11 | 1 | 1 | 3 | 18 | 17 |
| Personalo atrankos / įdarbinimo agentūra | 25 | 22 | 1 | 0 | 0 | 0 | 2 | 0 |
| Studentas / praktikantas | 10 | 7 | 0 | 0 | 0 | 1 | 1 | 1 |
| Mokymo įstaiga | 8 | 6 | 0 | 0 | 0 | 1 | 0 | 1 |

Funkcija priskiriama grupei pagal registro stulpelį „Kam“; viena funkcija gali tarnauti kelioms grupėms. Grupės funkcijos, kurios dar neveikia produkcijoje:

- **Darbuotojas** (30): 2.10 Nuorodos į kitus profilius — BLOKUOTA; 2.24 Patirties įrašai ir ginčai — NEVEIKIA; 2.30 Žurnalas balsu — BLOKUOTA; 2.36 Žurnalo šablonai pagal profesiją — TIK KODE; 2.37 Įrašo atsisakymas — NEĮGYVENDINTA; 4.18 Duomenų atskleidimas darbdaviui — BLOKUOTA; 5.5 Žinučių vertimas — BLOKUOTA; 5.8 Pranešimai telefone — BLOKUOTA; 5.15 Balsas kaip lygiavertis būdas — TIK KODE; 5.21 SMS ir WhatsApp kanalai — NEĮGYVENDINTA; 6.21 Viešas verslo puslapis — BLOKUOTA; 6.22 Būstas — NEĮGYVENDINTA; 6.23 Paslaugos įvertinimas ir ginčai — NEĮGYVENDINTA; 7.11 Atidėti planai — NEĮGYVENDINTA; 7.30 Sąskaitos ir priėmimo aktai iš žurnalo — NEĮGYVENDINTA; 7.31 Planai darbuotojams ir įmonėms — NEĮGYVENDINTA; 8.3 Automatinis vertimas — BLOKUOTA; 8.13 Programėlė telefonui — BLOKUOTA; 8.14 Nuorodos į programėlę — BLOKUOTA; 8.15 Programėlių parduotuvės — BLOKUOTA; 10.4 Dirbtinio intelekto leidimų sritys — NEĮGYVENDINTA; 10.6 Dirbtinio intelekto pagalba — BLOKUOTA; 10.7 Pokalbio ketinimų atpažinimas — BLOKUOTA; 10.8 CV sutvarkymas dirbtiniu intelektu — BLOKUOTA; 10.9 Žurnalo siūlymai — BLOKUOTA; 10.10 Paaiškinimai — BLOKUOTA; 10.16 Pagalbininkai kaip dalyviai — NEĮGYVENDINTA; 10.20 Senų skelbimų šalinimas — NEVEIKIA; 11.8 Mokymų ir pažymėjimų sąrašas — NEVEIKIA; 11.10 Ankstesnio mokymosi pripažinimas — NEĮGYVENDINTA
- **Darbdavys** (51): 1.8 Viena organizacija, keli veiklos tipai — BLOKUOTA; 2.24 Patirties įrašai ir ginčai — NEVEIKIA; 2.27 Įmonės istorinių įrašų įkėlimas — BLOKUOTA; 3.34 Projekto eigos prognozė — TIK KODE; 3.35 Persidengiančių įsipareigojimų įspėjimas — TIK KODE; 3.36 Įmonės gyvasis CV — TIK KODE; 4.22 Trys nemokami profilių peržiūrėjimai — NEĮGYVENDINTA; 4.30 Kandidatas, sprendimas, poreikio uždarymas — TIK KODE; 5.5 Žinučių vertimas — BLOKUOTA; 5.8 Pranešimai telefone — BLOKUOTA; 5.15 Balsas kaip lygiavertis būdas — TIK KODE; 5.20 Savos automatizacijos — NEĮGYVENDINTA; 5.21 SMS ir WhatsApp kanalai — NEĮGYVENDINTA; 6.12 Tarptautiniai sandoriai — NEĮGYVENDINTA; 6.13 Prekių užsakymai — NEĮGYVENDINTA; 6.14 Logistika — NEĮGYVENDINTA; 6.21 Viešas verslo puslapis — BLOKUOTA; 6.22 Būstas — NEĮGYVENDINTA; 6.23 Paslaugos įvertinimas ir ginčai — NEĮGYVENDINTA; 6.24 Paslaugų srautas telefone — NEĮGYVENDINTA; 7.2 Nemokamas planas: vienas atviras poreikis — TIK CI PATIKRINTA; 7.5 Mokėjimas už planą — NEPATIKRINTA; 7.8 Kreditų sąskaita — BLOKUOTA; 7.9 Kreditų papildymas ir planų pakopos — NEĮGYVENDINTA; 7.13 Užsakymų riba pagal planą — TIK KODE; 7.14 Skelbimų vertimo teisė — BLOKUOTA; 7.15 Metinė prenumerata — BLOKUOTA; 7.18 Mokėjimas keičia teises — TIK KODE; 7.19 Grąžinimai ir ginčai — BLOKUOTA; 7.20 Sąskaitos platformoje — NEĮGYVENDINTA; 7.21 Atsiskaitymo portalas — TIK KODE; 7.22 Mokamų funkcijų teisės ir ribos — TIK KODE; 7.23 Kreditų pirkimas — NEĮGYVENDINTA; 7.24 Kreditai po vieno mokėjimo — NEĮGYVENDINTA; 7.25 Kreditų likutis ir istorija — TIK KODE; 7.26 Kreditų išleidimas ir grąžinimas — NEĮGYVENDINTA; 7.27 Nemokamas VIP patvirtintoms įmonėms — NEVEIKIA; 7.28 Pardavėjas ir sąlygos — NEVEIKIA; 7.29 PVM skaičiavimas — TIK KODE; 7.30 Sąskaitos ir priėmimo aktai iš žurnalo — NEĮGYVENDINTA; 7.31 Planai darbuotojams ir įmonėms — NEĮGYVENDINTA; 8.3 Automatinis vertimas — BLOKUOTA; 8.9 Viešas įmonės profilis — BLOKUOTA; 8.13 Programėlė telefonui — BLOKUOTA; 8.14 Nuorodos į programėlę — BLOKUOTA; 8.15 Programėlių parduotuvės — BLOKUOTA; 10.4 Dirbtinio intelekto leidimų sritys — NEĮGYVENDINTA; 10.6 Dirbtinio intelekto pagalba — BLOKUOTA; 10.7 Pokalbio ketinimų atpažinimas — BLOKUOTA; 10.10 Paaiškinimai — BLOKUOTA; 10.16 Pagalbininkai kaip dalyviai — NEĮGYVENDINTA
- **Personalo atrankos / įdarbinimo agentūra** (3): 4.30 Kandidatas, sprendimas, poreikio uždarymas — TIK KODE; 7.9 Kreditų papildymas ir planų pakopos — NEĮGYVENDINTA; 7.11 Atidėti planai — NEĮGYVENDINTA
- **Studentas / praktikantas** (3): 11.8 Mokymų ir pažymėjimų sąrašas — NEVEIKIA; 11.9 Mokymosi peržiūra žmogaus akimis — BLOKUOTA; 11.10 Ankstesnio mokymosi pripažinimas — NEĮGYVENDINTA
- **Mokymo įstaiga** (2): 11.8 Mokymų ir pažymėjimų sąrašas — NEVEIKIA; 11.9 Mokymosi peržiūra žmogaus akimis — BLOKUOTA

### Naudotojų scenarijai (visi žingsniai)

| Scenarijus | Žingsnių | Veikia produkcijoje | Neveikiantys žingsniai |
|---|---|---|---|
| J-1 Darbuotojas prisijungia, pradeda ir mato gyvą CV | 4 | taip | — |
| J-2 Vadovas patvirtina žurnalo įrašą, ir jis atsiranda CV | 3 | taip | — |
| J-3 Darbuotojas randa poreikį ir susisiekia su įmone | 3 | taip | — |
| J-4 Viešoji darbo paieška | 2 | taip | — |
| J-5 Įmonė prisijungia ir randa kandidatus | 5 | taip | — |
| J-6 Įmonė pakviečia žmogų | 2 | taip | — |
| J-7 Projektas, valandos ir ataskaita | 5 | taip | — |
| J-8 Poreikis, datos ir darbuotojo sutikimas | 1 | taip | — |
| J-9 Agentūra pasiūlo žmones klientui | 2 | taip | — |
| J-10 Brigada siūloma kaip vienas vienetas | 3 | taip | — |
| J-11 Prekė ar paslauga: paskelbta, rasta, užsakyta | 3 | taip | — |
| J-12 Mokymo įstaiga, grupė, praktika, kompetencija | 7 | taip | — |
| J-13 Pirkėjas ir paslaugos teikėjas | 2 | taip | — |
| J-14 Įmonė perka planą be pagalbos | 4 | ne | 7.5 (NEPATIKRINTA), 7.15 (BLOKUOTA), 7.28 (NEVEIKIA) |
| J-15 Pranešimas apie tinkamą darbą be prisijungimo | 3 | taip | — |
| J-16 Pamiršai slaptažodį | 1 | taip | — |
| J-17 Programėlės įdiegimas iš parduotuvės | 3 | ne | 8.15 (BLOKUOTA) |
| J-18 Tavo duomenų eksportas ir ištrynimas | 3 | taip | — |
| J-19 Augimas: galimi įgūdžiai ir mokymosi kryptis | 2 | taip | — |

## A3. Vientisa CV sistema (#3354)

#3354 (P0):
- #3361, #3359, #3355 sujungti; vadovavimo valandos neprideda darbuotojo valandų – tai padengia esami testai.
- #3356 (archyvuota organizacija be pavadinimo nerodoma kaip darbo istorijos eilutė) sujungtas po R pastabų pataisos: valandų šaltinis nekeičiamas (sprendimas 0025).
- #3349 sujungtas anksčiau (RED, savininko pritaikyta migracija).
- #3375 sujungtas: tik skaitymo bandymas `cv-readonly`, produkcijoje dar nepaleistas.
- Istorinis priskyrimas – tik bandomasis skaitymo režimu; detalės privačiame Internal Brain.

Registro eilutės, kurios sudaro CV sistemą:

| ID | Funkcija | Būsena | Trūkumai |
|---|---|---|---|
| 1.15 | Įmonės praeitis ir jos perėmimas | VEIKIA PRODUKCIJOJE | — |
| 2.1 | Profesinis profilis | VEIKIA PRODUKCIJOJE | — |
| 2.2 | Darbo kortelė | VEIKIA PRODUKCIJOJE | **2026-11-06: Save on a page the browser translates killed the screen, with the row stored (real report 11-05); #3113 and #3114, walk availability-save 42207699886 on ae2cf083a, 20/20, translator DOM swap emulated in real Chrome, plus 5 other languages and the education and certificate forms. Real sign-out and new sign-in not walked; Chrome's own translator not run** |
| 2.3 | CV įkėlimas ir patvirtinimas | VEIKIA PRODUKCIJOJE | open: UF-3 (first real user 2026-11-04); **FAIL 2026-11-05: two tabs confirming the same CV education or certificate row at the same moment can store it twice.** Walk cv-import-duplicates 42098444964, real Chrome: confirmed once and re-imported (#3102) gave 1 row each, PASS; every parallel round sent 2 POSTs, each answered 201. Rows stored: 7 education from 4 titles, 5 certificate from 3 titles, from the cleanup's totals, because that run stopped before its own per-round counts and never reached the double click. No unique key on these tables; a migration is a separate owner decision. Cause: read, then insert, with nothing in the database between. Fix prepared 2026-11-06, unapplied and not proven on production, so the FAIL stands: a unique index and a per-person lock in a draft migration awaiting the owner. The review's confirms no longer re-render the whole page per row, the load that slowed run 42098444964 2026-11-06, walk 42208992447 on ae2cf083a after #3110: double click 1 action and 1 row, PASS; cleanup 0 rows left, PASS; parallel still 2 rows each, FAIL, until the RED draft #3111 is applied by owner decision. |
| 2.4 | Gyvasis CV | VEIKIA PRODUKCIJOJE | — |
| 2.5 | Darbo patirtis | VEIKIA PRODUKCIJOJE | — |
| 2.6 | Praktika ir savanorystė | VEIKIA PRODUKCIJOJE | — |
| 2.7 | Išsilavinimas | VEIKIA PRODUKCIJOJE | fixed by #3089 and proven in prod walk profile-cv-history 41994411748 2026-11-05 on a6dd80110 (24/24, the runner's Chrome, headless, scripted): education, achievements and experience each show a failed save with no row and the typed text kept, a saved row in under 1 s, one row after a reload and after a repeat save, and a removal in under 1 s. No person in real Chrome yet. Before #3089 a saved row took 6 to 30 s under load and a repeat save stored it twice. Open: a repeat CV import can still store an education row twice (`confirmCvEducationAction`); in the same run the summary restore was stored (HTTP 200) but "saved" did not show within 30 s, cause unknown, seen once; open: UF-5 suggestion (first real user 2026-11-04) |
| 2.8 | Pasiekimai ir pažymėjimai | VEIKIA PRODUKCIJOJE | — |
| 2.9 | Kalbos | VEIKIA PRODUKCIJOJE | — |
| 2.10 | Nuorodos į kitus profilius | BLOKUOTA | Nėra produkcijos įrodymo |
| 2.11 | Reikalavimų sąrašas | VEIKIA PRODUKCIJOJE | — |
| 2.12 | Įgūdžių ir profesijų sąrašas | VEIKIA PRODUKCIJOJE | — |
| 2.13 | Įgūdžių atpažinimas iš darbo žurnalo | VEIKIA PRODUKCIJOJE | — |
| 2.14 | Įrodymų lygiai | VEIKIA PRODUKCIJOJE | — |
| 2.15 | Savo įgūdžių pareiškimas | VEIKIA PRODUKCIJOJE | — |
| 2.16 | Bendrieji gebėjimai | VEIKIA PRODUKCIJOJE | — |
| 2.17 | Europos profesijų klasifikatorius | TIK KODE | Nėra produkcijos įrodymo |
| 2.18 | Dokumentai ir jų galiojimas | VEIKIA PRODUKCIJOJE | — |
| 2.19 | Darbo žurnalas | VEIKIA PRODUKCIJOJE | AI suggestions stay BLOCKED in 10.9 (owner AI keys); the honest off-state is proven |
| 2.20 | Vadovo patvirtinimas | VEIKIA PRODUKCIJOJE | — |
| 2.21 | Darbo patvirtinimo būsenos | VEIKIA PRODUKCIJOJE | — |
| 2.22 | Nuotraukos ir darbo įrodymai | VEIKIA PRODUKCIJOJE | — |
| 2.23 | Valandos ir suvestinės | VEIKIA PRODUKCIJOJE | — |
| 2.24 | Patirties įrašai ir ginčai | NEVEIKIA | Nėra produkcijos įrodymo |
| 2.25 | Darbas skaičiais | VEIKIA PRODUKCIJOJE | — |
| 2.26 | Viena nuosekli profesinė istorija | VEIKIA PRODUKCIJOJE | — |
| 2.27 | Įmonės istorinių įrašų įkėlimas | BLOKUOTA | Nėra produkcijos įrodymo |
| 2.28 | Senų įrašų sujungimas | BLOKUOTA | Nėra produkcijos įrodymo |
| 2.29 | Galimi, dar neįrodyti gebėjimai | VEIKIA PRODUKCIJOJE | — |
| 2.30 | Žurnalas balsu | BLOKUOTA | Nėra produkcijos įrodymo |
| 2.31 | Žurnalo įrašų apsauga nuo keitimo | VEIKIA PRODUKCIJOJE | — |
| 2.32 | Kitos pusės atsiliepimas | VEIKIA PRODUKCIJOJE | — |
| 2.33 | Darbų galerija | VEIKIA PRODUKCIJOJE | — |
| 2.34 | Žurnalo ir valandų atsisiuntimas | VEIKIA PRODUKCIJOJE | — |
| 2.35 | Sutikimas būti randamam | VEIKIA PRODUKCIJOJE | — |
| 2.36 | Žurnalo šablonai pagal profesiją | TIK KODE | no production walk |
| 2.37 | Įrašo atsisakymas | NEĮGYVENDINTA | owner decision ARCH-5, then build |
| 3.27 | Įmonės istorija ir duomenų kokybė | VEIKIA PRODUKCIJOJE | — |
| 3.36 | Įmonės gyvasis CV | TIK KODE | owner to confirm the product shape |
| 7.25 | Kreditų likutis ir istorija | TIK KODE | open security/permission item — details kept out of the public repository (owner rule) |
| 7.30 | Sąskaitos ir priėmimo aktai iš žurnalo | NEĮGYVENDINTA | owner: invoicing rules per country, then build |
| 10.8 | CV sutvarkymas dirbtiniu intelektu | BLOKUOTA | Nėra produkcijos įrodymo |
| 10.9 | Žurnalo siūlymai | BLOKUOTA | Nėra produkcijos įrodymo |

## A4. PR ir diegimai

### Produkcijos diegimai per laikotarpį

| Versija | Rezultatas | Laikas | Įrašas |
|---|---|---|---|
| `ca4b3594` | success | 2026-11-15 22:10 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43756579240) |
| `f461497e` | success | 2026-11-15 20:30 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43746703946) |
| `f461497e` | success | 2026-11-15 20:21 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43745129759) |
| `d225f58a` | success | 2026-11-15 19:05 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43738638269) |
| `d225f58a` | success | 2026-11-15 18:51 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43737312783) |
| `1fcff8a6` | success | 2026-11-15 13:53 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43710723088) |
| `1fcff8a6` | success | 2026-11-15 13:42 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43709863890) |
| `f862c524` | success | 2026-11-15 12:40 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43704786917) |
| `f862c524` | success | 2026-11-15 12:25 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43703676073) |
| `a5797a9c` | success | 2026-11-15 10:43 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43695437061) |
| `3e069634` | success | 2026-11-15 10:23 | [run](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43693820010) |

Nepavykę diegimai: nėra.

### Produkcijos bandymai (walks) per laikotarpį

| Bandymas | Ekranas | Versija | Rezultatas | Laikas |
|---|---|---|---|---|
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43756933923) | kompiuteris | `daa77725` | in_progress | 2026-11-15 22:14 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43756927586) | kompiuteris | `772ef6ae` | cancelled | 2026-11-15 22:14 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743820581) | kompiuteris | `f461497e` | success | 2026-11-15 22:13 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743815582) | kompiuteris | `b19edd95` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743809996) | kompiuteris | `32b0dc40` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743804591) | kompiuteris | `fbb05136` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743800159) | kompiuteris | `e4e88933` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743795329) | kompiuteris | `db0a0787` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743790070) | kompiuteris | `f53f99d8` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743784831) | kompiuteris | `2c2f348a` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743752699) | kompiuteris | `9c6f2f9f` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk agency-chain](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43743349514) | nežinomas | `d225f58a` | success | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43736456681) | kompiuteris | `d225f58a` | cancelled | 2026-11-15 19:55 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43736385861) | kompiuteris | `8c765062` | cancelled | 2026-11-15 18:37 |
| [prod-qa-walk learning-practice](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43726964928) | nežinomas | `1fcff8a6` | success | 2026-11-15 16:59 |
| [prod-qa-walk learning-practice](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43725773540) | nežinomas | `1fcff8a6` | success | 2026-11-15 16:46 |
| [prod-qa-walk agency-chain](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43724558463) | nežinomas | `1fcff8a6` | failure | 2026-11-15 16:32 |
| [prod-qa-walk agency-chain](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43723431255) | nežinomas | `1fcff8a6` | success | 2026-11-15 16:19 |
| [prod-qa-walk company-chain](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43722041470) | nežinomas | `1fcff8a6` | success | 2026-11-15 16:06 |
| [prod-qa-walk company-chain](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43720771951) | nežinomas | `1fcff8a6` | success | 2026-11-15 15:51 |
| [prod-qa-walk profile-cv-history](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43713174624) | nežinomas | `1fcff8a6` | success | 2026-11-15 14:33 |
| [prod-qa-walk schedule](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43709206177) | kompiuteris | `1fcff8a6` | success | 2026-11-15 13:32 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43709012789) | kompiuteris | `1fcff8a6` | success | 2026-11-15 15:38 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43709003307) | kompiuteris | `cd58f08f` | cancelled | 2026-11-15 13:27 |
| [prod-qa-walk profile-cv-history](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43705887379) | nežinomas | `f862c524` | success | 2026-11-15 12:58 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43702910524) | kompiuteris | `f862c524` | cancelled | 2026-11-15 13:27 |
| [prod-qa-walk push](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/43694695789) | kompiuteris | `a5797a9c` | cancelled | 2026-11-15 12:12 |

### Sujungti per laikotarpį (19)

- #3405 docs(program): 12h status report 2026-11-15 21:41
- #3400 test(prod-walk): the teardown reads a status before it trusts one
- #3399 fix(i18n): the offer limit lines in all 11 catalogs
- #3398 test(prod-walk): the agency walk withdraws the proposal it created
- #3397 fix(agency): say which booking limit stopped an offer accept
- #3393 fix(copy): no internal development or legal-process notes in the UI
- #3392 fix(agency): partners page fits a phone; Swedish visitor walk asserts Swedish
- #3390 fix(ui): a person's name is never cut on the identity stage
- #3385 feat(landing): adverts in the visitor's language come first
- #3384 feat(theme): a new account starts in the light theme
- #3375 test(prod-walk): the CV as a signed-in person sees it, read only
- #3372 fix(ops): log CLEAR when every invitation-delivery alert clears at once
- #3356 fix(cv): the archived nameless row is renamed, never hidden
- #3351 test(e2e): K-7 waits for the settled link set, not a mid-replace read
- #3348 test(e2e): the production agency walk opens readiness and client records
- #3339 fix(profile): the experience form asks what the engagement was
- #3225 fix(demand): the company-need wizard asks for the work country
- #3206 fix(pricing): no payment promise while online payment is closed
- #3202 feat(company-need): an inquiry records which public button opened it

### Atviri PR (132)

Kandidatai jungti 1 (prieš jungimą tikrinama iš naujo); konfliktuoja 35; CI nepraėjo 37; laukia peržiūros 40; RED (migracijos, RLS, saugumas) 65.

PR sugrupuoti pagal funkcinę sritį; srities viduje pirmiausia RED, tada paruošti, tada kiti. Blokatorius — pirmoji iš eilės priežastis (konfliktas, CI, peržiūra).

#### 1. Paskyra, registracija ir organizacijos (24)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2454](https://github.com/bandymuks1-stack/labourmarketai/pull/2454) | test(e2e): external MCP client conformance walk — DCR, PKCE, consent, token, use, refresh, revoke (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2707](https://github.com/bandymuks1-stack/labourmarketai/pull/2707) | feat(mcp): OAuth permission scopes behind MCP_SCOPE_ENFORCEMENT (RED) (juodraštis) | RED | failure | none / none | CI nepraėjo: quality |
| [#2713](https://github.com/bandymuks1-stack/labourmarketai/pull/2713) | feat(marketplace): goods purchase requests on listings, delivery fields [RED] (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2806](https://github.com/bandymuks1-stack/labourmarketai/pull/2806) | fix(auth): third-party OAuth tokens are accepted only at the connector door (RED) (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2809](https://github.com/bandymuks1-stack/labourmarketai/pull/2809) | ci(oauth): isolated OAuth test job on a local Supabase stack (B5a, RED) (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2811](https://github.com/bandymuks1-stack/labourmarketai/pull/2811) | feat(db): OAuth door gate for direct database access (B1b, RED, ships off) (juodraštis) | RED | failure | none / none | CI nepraėjo: migration-safety |
| [#2812](https://github.com/bandymuks1-stack/labourmarketai/pull/2812) | feat(auth): user-controlled OAuth permissions — choose, review, change, revoke (B3, RED) (juodraštis) | RED | failure | none / none | CI nepraėjo: CodeQL, quality, migration-safety |
| [#2918](https://github.com/bandymuks1-stack/labourmarketai/pull/2918) | fix(auth): bind bearer tokens to the resource they were issued for (C-3, RED) (juodraštis) | RED | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#2923](https://github.com/bandymuks1-stack/labourmarketai/pull/2923) | feat(mcp): curated assistant toolset for OAuth clients (10.4, RED draft, X-2) (juodraštis) | RED | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3220](https://github.com/bandymuks1-stack/labourmarketai/pull/3220) | feat(auth): bearer tokens admitted only for their audience (C-3) [owner gate] (juodraštis) | RED | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3226](https://github.com/bandymuks1-stack/labourmarketai/pull/3226) | feat(chat): new-message e-mail on by default, with opt-out (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3292](https://github.com/bandymuks1-stack/labourmarketai/pull/3292) | feat(invitations): decline an invitation from your own list (RED draft, not applied) (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3296](https://github.com/bandymuks1-stack/labourmarketai/pull/3296) | perf(auth): the login form is in the server HTML [needs-human-gate] (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3320](https://github.com/bandymuks1-stack/labourmarketai/pull/3320) | RED draft: company registration e-mails, request alerts and delivery control (Lane N) (juodraštis) | RED | success | none / no-block | laukia peržiūros |
| [#1835](https://github.com/bandymuks1-stack/labourmarketai/pull/1835) | test(global-access): production walk + local spec for LT SE DE IE VN US SA GE PH — draft keeps the picked country, onboarding offers every ISO country | GREEN | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2924](https://github.com/bandymuks1-stack/labourmarketai/pull/2924) | fix(oauth): consent screen names each permission in plain words + revoke path (juodraštis) | GREEN | failure | untrusted / none | CI nepraėjo: quality |
| [#3099](https://github.com/bandymuks1-stack/labourmarketai/pull/3099) | docs(register): critical scenarios against the seven questions | GREEN | success | none / none | laukia peržiūros |
| [#3167](https://github.com/bandymuks1-stack/labourmarketai/pull/3167) | test(ai): Lithuanian evals for every registered agent | GREEN | success | none / none | laukia peržiūros |
| [#3218](https://github.com/bandymuks1-stack/labourmarketai/pull/3218) | feat(mobile): offers screen answers job proposals and invitations (juodraštis) | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3238](https://github.com/bandymuks1-stack/labourmarketai/pull/3238) | docs(security): chat alert race, one-line status in the register (juodraštis) | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3282](https://github.com/bandymuks1-stack/labourmarketai/pull/3282) | docs(register): launch state per function and seven missing team/project rows (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3285](https://github.com/bandymuks1-stack/labourmarketai/pull/3285) | fix(onboarding): fields use the one guarded auth field class (44px floor) (juodraštis) | GREEN | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3289](https://github.com/bandymuks1-stack/labourmarketai/pull/3289) | feat(teams): team structure views on the shared StructureTree; name search when inviting (Lane H, PR 3) (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3362](https://github.com/bandymuks1-stack/labourmarketai/pull/3362) | fix(i18n): polite form of address on sign-up, onboarding and public pages (juodraštis) | GREEN | success | none / none | laukia peržiūros |

#### 2. Darbuotojo profilis, darbo žurnalas ir gyvas CV (20)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#1816](https://github.com/bandymuks1-stack/labourmarketai/pull/1816) | feat(i18n): COMM-1 RED draft — profiles.communication_locale + the read side (needs-human-gate) (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2471](https://github.com/bandymuks1-stack/labourmarketai/pull/2471) | feat(privacy): external profile links shared only through the worker's per-company grant [RED] (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2474](https://github.com/bandymuks1-stack/labourmarketai/pull/2474) | feat(billing): free plan opens 3 unique worker profiles per organization [RED] (juodraštis) | RED | failure | none / none | CI nepraėjo: migration-safety |
| [#2685](https://github.com/bandymuks1-stack/labourmarketai/pull/2685) | feat(billing): Stripe Tax evidence + review routing, switched OFF (RED) (juodraštis) | RED | failure | none / none | CI nepraėjo: migration-safety |
| [#2886](https://github.com/bandymuks1-stack/labourmarketai/pull/2886) | feat(agentai): daily aggregate growth export (registrations by utm, active + completed Living CVs) [RED] (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#3111](https://github.com/bandymuks1-stack/labourmarketai/pull/3111) | feat(db): one CV statement once, at the database [RED] (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3311](https://github.com/bandymuks1-stack/labourmarketai/pull/3311) | RED draft: a former worker can claim the history an organization holds (Lane H) (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3324](https://github.com/bandymuks1-stack/labourmarketai/pull/3324) | feat(db): a moderator who is a party to an experience is refused in the database (2.24) [RED] (juodraštis) | RED | success | stale / no-block | konfliktas su main (reikia atnaujinti šaką) |
| [#3291](https://github.com/bandymuks1-stack/labourmarketai/pull/3291) | feat(journal): the review queue can be narrowed to one project (Lane H, PR 4) (juodraštis) | GREEN | success | no-block / none | kandidatas jungti (juodraštis; prieš jungimą tikrinama iš naujo) |
| [#1166](https://github.com/bandymuks1-stack/labourmarketai/pull/1166) | feat(design-rd): Living Opportunity World R5 — real 3D world + Göteborg cinematic journey | GREEN | failure | none / none | CI nepraėjo: CodeQL |
| [#1211](https://github.com/bandymuks1-stack/labourmarketai/pull/1211) | design(visual): art direction spec + pipeline audit — PARKED for owner decision (juodraštis) | GREEN | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2377](https://github.com/bandymuks1-stack/labourmarketai/pull/2377) | docs(design): Future Experience 2030 — three concepts for owner choice (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3164](https://github.com/bandymuks1-stack/labourmarketai/pull/3164) | feat(mcp): read-only profile at /api/mcp/read (juodraštis) | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3219](https://github.com/bandymuks1-stack/labourmarketai/pull/3219) | feat(mcp): curated ChatGPT tool profile at /api/mcp/chatgpt (juodraštis) | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3254](https://github.com/bandymuks1-stack/labourmarketai/pull/3254) | feat(chat): work history, plan and search reads for assistants (juodraštis) | GREEN | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3276](https://github.com/bandymuks1-stack/labourmarketai/pull/3276) | test(e2e): worker fills profile and CV, employer search, CV isolation | GREEN | success | stale / none | R peržiūra ne dabartinei versijai (reikia naujos) |
| [#3301](https://github.com/bandymuks1-stack/labourmarketai/pull/3301) | fix(experience): a dispute can be decided and a reply published (2.24) | GREEN | success | stale / stale | R peržiūra ne dabartinei versijai (reikia naujos) |
| [#3343](https://github.com/bandymuks1-stack/labourmarketai/pull/3343) | test(education): student→worker history and access after the link ends (Lane L) (juodraštis) | GREEN | failure | stale / stale | CI nepraėjo: signup-isolated |
| [#3350](https://github.com/bandymuks1-stack/labourmarketai/pull/3350) | test(e2e): two example CVs from synthetic accounts, kept as CI screenshots (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3363](https://github.com/bandymuks1-stack/labourmarketai/pull/3363) | feat(organization-cv): the organization's projects and the links between them (#3354, Lane H) (juodraštis) | GREEN | success | no-block / none | GitHub sujungiamumas nepatvirtintas |

#### 3. Įmonės darbai ir projektai (9)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2418](https://github.com/bandymuks1-stack/labourmarketai/pull/2418) | perf(spine): team-offer badge counts in one read [RED, not applied] (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2795](https://github.com/bandymuks1-stack/labourmarketai/pull/2795) | feat(db): let an acknowledged booking clash be recorded (RED #5 end) (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2816](https://github.com/bandymuks1-stack/labourmarketai/pull/2816) | fix(training): an organization can assign training to its active employees (11.8, RED) (juodraštis) | RED | failure | none / none | CI nepraėjo: migration-safety |
| [#3230](https://github.com/bandymuks1-stack/labourmarketai/pull/3230) | feat(ops): operator alerts for waiting company applications (RED draft) (juodraštis) | RED | failure | untrusted / unclear | CI nepraėjo: signup-isolated |
| [#3231](https://github.com/bandymuks1-stack/labourmarketai/pull/3231) | feat(db): team_offer_counterpart_v1, the gated recipient of a team offer (RED) (juodraštis) | RED | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3295](https://github.com/bandymuks1-stack/labourmarketai/pull/3295) | RED draft: a team's company, a role in a team (team-lead label), a role on a project (Lane H design note) (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3241](https://github.com/bandymuks1-stack/labourmarketai/pull/3241) | fix(projects): a project with a place carries its country (juodraštis) | GREEN | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3279](https://github.com/bandymuks1-stack/labourmarketai/pull/3279) | refactor(teams): team and team-assignment controls use the shared primitives (Lane H, PR 2) (juodraštis) | GREEN | success | stale / none | R peržiūra ne dabartinei versijai (reikia naujos) |
| [#3401](https://github.com/bandymuks1-stack/labourmarketai/pull/3401) | fix(company): the person who sets up a company acts for it (juodraštis) | GREEN | success | none / none | laukia peržiūros |

#### 4. Poreikiai, darbo skelbimai ir atranka (19)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2227](https://github.com/bandymuks1-stack/labourmarketai/pull/2227) | feat(ingestion): vacancy scheduler watchdog migration (RED - human gate) (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2235](https://github.com/bandymuks1-stack/labourmarketai/pull/2235) | feat(db): RED draft — service_role-only expiry sweeps (needs-human-gate, NOT applied) (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2693](https://github.com/bandymuks1-stack/labourmarketai/pull/2693) | feat(db): vacancy retention reads protected ids; pin sentinel search_path [RED] (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2993](https://github.com/bandymuks1-stack/labourmarketai/pull/2993) | feat(jobs): country + city for signed-out visitors [RED, not applied] (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2996](https://github.com/bandymuks1-stack/labourmarketai/pull/2996) | feat(seo): keyset sitemap paging [RED, not applied] (juodraštis) | RED | missing | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3021](https://github.com/bandymuks1-stack/labourmarketai/pull/3021) | chore(db): drop the exact-duplicate vacancy board index [RED, not applied] (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3173](https://github.com/bandymuks1-stack/labourmarketai/pull/3173) | feat(jobs): country filter on the one public search [needs-human-gate] (juodraštis) | RED | failure | none / none | CI nepraėjo: quality |
| [#3208](https://github.com/bandymuks1-stack/labourmarketai/pull/3208) | fix(company-need): an answer the company did not give is stored as unknown (RED) (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3214](https://github.com/bandymuks1-stack/labourmarketai/pull/3214) | feat(company): signed-in company search, unconfirmed companies marked (RED draft, D2) (juodraštis) | RED | success | untrusted / no-block | konfliktas su main (reikia atnaujinti šaką) |
| [#3221](https://github.com/bandymuks1-stack/labourmarketai/pull/3221) | feat(mcp): public job search without sign-in on the ChatGPT door [owner gate] (juodraštis) | RED | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3256](https://github.com/bandymuks1-stack/labourmarketai/pull/3256) | feat(demand): unconfirmed companies' needs public only by explicit consent (RED, principle C) (juodraštis) | RED | success | none / unclear | laukia peržiūros |
| [#3353](https://github.com/bandymuks1-stack/labourmarketai/pull/3353) | RED draft: an agency's placement term, accepted at the hire decision; opt-in to a suggested agency (Lane H) (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2642](https://github.com/bandymuks1-stack/labourmarketai/pull/2642) | fix(jobs): the saved-jobs view never says nothing saved when it is not (owner waiver needed) | GREEN | failure | none / none | CI nepraėjo: quality |
| [#3181](https://github.com/bandymuks1-stack/labourmarketai/pull/3181) | fix(seo): each job page gets its own meta description (juodraštis) | GREEN | failure | none / none | CI nepraėjo: quality |
| [#3222](https://github.com/bandymuks1-stack/labourmarketai/pull/3222) | feat(mcp): job-list widget for the ChatGPT door (Apps SDK) (juodraštis) | GREEN | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3237](https://github.com/bandymuks1-stack/labourmarketai/pull/3237) | fix(company): setup copy says when workers see a company's needs (juodraštis) | GREEN | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3327](https://github.com/bandymuks1-stack/labourmarketai/pull/3327) | fix(jobs): a typed job word with no catalogue profession is not a zero (juodraštis) | GREEN | failure | untrusted / none | CI nepraėjo: quality |
| [#3403](https://github.com/bandymuks1-stack/labourmarketai/pull/3403) | fix(scouting): the person searching is never their own candidate (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3404](https://github.com/bandymuks1-stack/labourmarketai/pull/3404) | fix(demand): the saved need's next step opens that need's candidates (juodraštis) | GREEN | success | none / none | laukia peržiūros |

#### 5. Pokalbiai ir pranešimai (5)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2440](https://github.com/bandymuks1-stack/labourmarketai/pull/2440) | fix(db): null-safe owner check in append_assistant_message [RED, NOT applied] (juodraštis) | RED | failure | none / none | CI nepraėjo: quality, Vercel |
| [#3168](https://github.com/bandymuks1-stack/labourmarketai/pull/3168) | fix(communication): refuse unfaithful message translations | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3227](https://github.com/bandymuks1-stack/labourmarketai/pull/3227) | fix(notifications): B2B offers tell the other side (juodraštis) | GREEN | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3239](https://github.com/bandymuks1-stack/labourmarketai/pull/3239) | test(chat): A-B-C chat-revocation production walk and attachment proof (juodraštis) | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3249](https://github.com/bandymuks1-stack/labourmarketai/pull/3249) | fix(chat): attachment links work for 60 s instead of 300 s (juodraštis) | GREEN | success | blocks / none | R peržiūra: blokuoja |

#### 6. Prekyvietė (3)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#1045](https://github.com/bandymuks1-stack/labourmarketai/pull/1045) | fix(admin): repair the founder admin-grant path — narrow service_role column grants (owner-gated, UNAPPLIED) (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2746](https://github.com/bandymuks1-stack/labourmarketai/pull/2746) | feat(db): listing closed outcome + discarded draft never reopens [RED, NOT applied] (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2946](https://github.com/bandymuks1-stack/labourmarketai/pull/2946) | feat(db): RED-1 link an accepted service request to a proposal [RED] (juodraštis) | RED | success | untrusted / no-block | konfliktas su main (reikia atnaujinti šaką) |

#### 7. Planai ir mokėjimai (17)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2165](https://github.com/bandymuks1-stack/labourmarketai/pull/2165) | feat(worker-activation): Nonstop inbound worker -> signup -> existing consent + supply-declaration screen (REVIEW ONLY; migration unapplied) (juodraštis) | RED | missing | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2203](https://github.com/bandymuks1-stack/labourmarketai/pull/2203) | feat(finance): project-to-invoice lifecycle v1 [RED, needs-human-gate, NOT applied] (juodraštis) | RED | failure | none / none | CI nepraėjo: migration-safety |
| [#2441](https://github.com/bandymuks1-stack/labourmarketai/pull/2441) | feat(billing): the second owner act — live checkouts need live_payments_enabled [RED: billing, no migration] (juodraštis) | RED | failure | none / none | CI nepraėjo: quality, Vercel |
| [#2647](https://github.com/bandymuks1-stack/labourmarketai/pull/2647) | feat(lmc): Stripe TEST top-ups credit once per payment [RED] (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2682](https://github.com/bandymuks1-stack/labourmarketai/pull/2682) | fix(billing): the pilot pass shows its plan name, fixed term and amount (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2701](https://github.com/bandymuks1-stack/labourmarketai/pull/2701) | fix(billing): drop unproven VAT promise; record Stripe Tax decision (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2704](https://github.com/bandymuks1-stack/labourmarketai/pull/2704) | feat(billing): organization invoices inside the account billing section (RED) (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2752](https://github.com/bandymuks1-stack/labourmarketai/pull/2752) | docs(legal): name the free-tier AI processors before activation [RED] (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#3019](https://github.com/bandymuks1-stack/labourmarketai/pull/3019) | perf(db): row-independent policy calls run once per statement [RED] (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3047](https://github.com/bandymuks1-stack/labourmarketai/pull/3047) | fix(billing): checkout route refuses a recurring order during the pilot pass [RED] (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#3250](https://github.com/bandymuks1-stack/labourmarketai/pull/3250) | fix(pricing): public pages show only what works while payment is closed (juodraštis) | RED | success | none / no-block | konfliktas su main (reikia atnaujinti šaką) |
| [#3252](https://github.com/bandymuks1-stack/labourmarketai/pull/3252) | fix(billing): paused grants no grace; prove the test-mode lifecycle (juodraštis) | RED | success | untrusted / no-block | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3305](https://github.com/bandymuks1-stack/labourmarketai/pull/3305) | test(billing): pin the FREE-limit transition rules (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#2403](https://github.com/bandymuks1-stack/labourmarketai/pull/2403) | fix(jobs): a title word no longer overrules a publisher's non-catalogue occupation (G-16 waiver needed) (juodraštis) | GREEN | failure | none / none | CI nepraėjo: quality |
| [#2842](https://github.com/bandymuks1-stack/labourmarketai/pull/2842) | docs(legal): paid-services terms draft v2 + EN + checkout checklist (for legal review, not published) (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3236](https://github.com/bandymuks1-stack/labourmarketai/pull/3236) | docs(presentations): LT decks, product audit and P0 plan (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3272](https://github.com/bandymuks1-stack/labourmarketai/pull/3272) | docs(design): one UX/UI discrepancy list and rollout plan (tracking) (juodraštis) | GREEN | success | stale / none | R peržiūra ne dabartinei versijai (reikia naujos) |

#### 8. Kalbos ir rinkos (7)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2463](https://github.com/bandymuks1-stack/labourmarketai/pull/2463) | feat(db): ESCO cold locales archived on the VPS, hot set = UI locales [RED, not applied] (decision 0026) (juodraštis) | RED | success | none / none | laukia peržiūros |
| [#3232](https://github.com/bandymuks1-stack/labourmarketai/pull/3232) | feat(privacy): Swedish consent texts with the RED hash re-pin (draft, not applied) (juodraštis) | RED | success | untrusted / no-block | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3248](https://github.com/bandymuks1-stack/labourmarketai/pull/3248) | feat(db): save_customer_request_v2, a buyer request records kind and language (RED) (juodraštis) | RED | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3217](https://github.com/bandymuks1-stack/labourmarketai/pull/3217) | ci(mobile): owner-started EAS release build that skips without secrets (juodraštis) | GREEN | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3332](https://github.com/bandymuks1-stack/labourmarketai/pull/3332) | fix(app): form fields are full touch targets on phones; ranked defect list (juodraštis) | GREEN | success | untrusted / none | peržiūra tik nepatikimo autoriaus (botas / išorinis) |
| [#3388](https://github.com/bandymuks1-stack/labourmarketai/pull/3388) | feat(i18n): formal address in Lithuanian, Dutch and Russian (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3402](https://github.com/bandymuks1-stack/labourmarketai/pull/3402) | fix(i18n): the offer limit lines in Danish (juodraštis) | GREEN | success | none / none | laukia peržiūros |

#### 9. Administravimas, privatumas ir saugumas (1)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2747](https://github.com/bandymuks1-stack/labourmarketai/pull/2747) | feat(privacy): free workers discoverable by default — one ledger, notice first, one-tap objection [RED] (juodraštis) | RED | success | none / none | laukia peržiūros |

#### 10. Pagalbininkai ir dirbtinis intelektas (2)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#2970](https://github.com/bandymuks1-stack/labourmarketai/pull/2970) | fix(ops): ai-failing counts technical failures over attempted runs | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3166](https://github.com/bandymuks1-stack/labourmarketai/pull/3166) | feat(ai): monthly euro cap on AI vendor runs | GREEN | success | blocks / none | R peržiūra: blokuoja |

#### 11. Mokymasis (3)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#3302](https://github.com/bandymuks1-stack/labourmarketai/pull/3302) | fix(pricing): plain wording on the pricing page, no internal terms (juodraštis) | RED | success | none / no-block | laukia peržiūros |
| [#3307](https://github.com/bandymuks1-stack/labourmarketai/pull/3307) | feat(marketing): audience pages for education and service providers (juodraštis) | GREEN | success | none / none | laukia peržiūros |
| [#3347](https://github.com/bandymuks1-stack/labourmarketai/pull/3347) | docs(education): design for the public programme catalogue and institution↔employer cooperation (Lane L) (juodraštis) | GREEN | success | none / none | laukia peržiūros |

#### 12. Rinkos žinios (2)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#3008](https://github.com/bandymuks1-stack/labourmarketai/pull/3008) | fix(reports): documents tile says unavailable, not a false 0 | GREEN | success | blocks / none | R peržiūra: blokuoja |
| [#3297](https://github.com/bandymuks1-stack/labourmarketai/pull/3297) | docs(launch): launch audit of 2026-11-12, three reports (juodraštis) | GREEN | success | none / stale | laukia peržiūros |

#### 13. Infrastruktūra ir veikimas (20)

| PR | Pavadinimas | Klasė | CI | R / R2 | Blokatorius |
|---|---|---|---|---|---|
| [#1577](https://github.com/bandymuks1-stack/labourmarketai/pull/1577) | feat(catalogue): office & professional professions — seed, mirror, lexicon (W6 G-D2, RED draft) (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2362](https://github.com/bandymuks1-stack/labourmarketai/pull/2362) | feat(db): historical date correction v1 — 165 dates [RED] (juodraštis) | RED | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2420](https://github.com/bandymuks1-stack/labourmarketai/pull/2420) | perf(db): supply-count cron skips the full scan when nothing changed [RED, not applied] (juodraštis) | RED | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#1617](https://github.com/bandymuks1-stack/labourmarketai/pull/1617) | chore(ci): bump github/codeql-action/analyze from 4.37.3 to 4.37.9 | GREEN | failure | none / none | CI nepraėjo: Analyze (javascript-typescript) |
| [#1619](https://github.com/bandymuks1-stack/labourmarketai/pull/1619) | chore(ci): bump github/codeql-action/init from 4.37.3 to 4.37.9 | GREEN | failure | none / none | CI nepraėjo: Analyze (javascript-typescript) |
| [#1620](https://github.com/bandymuks1-stack/labourmarketai/pull/1620) | chore(ci): bump actions/upload-artifact from 4 to 7 | GREEN | success | none / none | laukia peržiūros |
| [#1622](https://github.com/bandymuks1-stack/labourmarketai/pull/1622) | chore(deps-dev): Bump the dev-tooling group across 1 directory with 2 updates | GREEN | success | none / none | laukia peržiūros |
| [#1623](https://github.com/bandymuks1-stack/labourmarketai/pull/1623) | chore(deps): Bump expo from 57.0.18 to 57.0.26 | GREEN | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#1624](https://github.com/bandymuks1-stack/labourmarketai/pull/1624) | chore(deps): bump @supabase/supabase-js from 2.106.0 to 2.115.0 | GREEN | success | none / none | laukia peržiūros |
| [#1625](https://github.com/bandymuks1-stack/labourmarketai/pull/1625) | chore(deps): Bump @expo/metro-runtime from 57.0.14 to 57.0.16 | GREEN | success | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#2198](https://github.com/bandymuks1-stack/labourmarketai/pull/2198) | feat(voice): transcription production deploy bundle + runbook (COM-6) | GREEN | success | none / none | laukia peržiūros |
| [#2356](https://github.com/bandymuks1-stack/labourmarketai/pull/2356) | chore(deps-dev): Bump eslint-config-next from 15.5.24 to 15.5.29 in the next-framework group across 1 directory | GREEN | failure | none / none | CI nepraėjo: quality |
| [#2370](https://github.com/bandymuks1-stack/labourmarketai/pull/2370) | feat(identity): one identity family — re-port of the frozen design class (D2) | GREEN | failure | none / none | CI nepraėjo: quality |
| [#3178](https://github.com/bandymuks1-stack/labourmarketai/pull/3178) | feat(seo): RU and TR worker guides for ten European countries (juodraštis) | GREEN | failure | none / none | konfliktas su main (reikia atnaujinti šaką) |
| [#3263](https://github.com/bandymuks1-stack/labourmarketai/pull/3263) | test(e2e): public CTA crawl and a citable release check (juodraštis) | GREEN | failure | stale / none | CI nepraėjo: crawl (ru), crawl (en), crawl (lt), crawl (de), crawl (nl), crawl (pl), lighthouse (en), lighthouse (lt) |
| [#3270](https://github.com/bandymuks1-stack/labourmarketai/pull/3270) | feat(nav): signed-in home on the shared goal navigator (Lane A2 on Lane A's components) (juodraštis) | GREEN | success | stale / none | R peržiūra ne dabartinei versijai (reikia naujos) |
| [#3271](https://github.com/bandymuks1-stack/labourmarketai/pull/3271) | ci(smoke): a short check of the main journeys after every production deploy (juodraštis) | GREEN | failure | stale / stale | CI nepraėjo: crawl (de), crawl (nl), crawl (lt), crawl (pl), crawl (ru), lighthouse (en), crawl (en), lighthouse (lt) |
| [#3273](https://github.com/bandymuks1-stack/labourmarketai/pull/3273) | feat(ui): shared primitives for every module + DESIGN.md how-to (juodraštis) | GREEN | success | stale / none | R peržiūra ne dabartinei versijai (reikia naujos) |
| [#3330](https://github.com/bandymuks1-stack/labourmarketai/pull/3330) | docs(governance): owner delegation through one coordinator (decision 0031) (juodraštis) | GREEN | success | none / unclear | laukia peržiūros |
| [#3364](https://github.com/bandymuks1-stack/labourmarketai/pull/3364) | fix(a11y): 44px tap targets on the public and sign-in pages (juodraštis) | GREEN | success | none / none | laukia peržiūros |

## A5. Realus produkto veikimas pagal sritis

Būsenos imamos tik iš registro. Šiame cikle registro funkcijų būsenos nepakeistos; telefono bandymai patvirtina jau LIVE_VERIFIED eilutes telefono ekranuose.

| Sritis | Iš viso | VEIKIA PRODUKCIJOJE | TIK KODE | TIK CI PATIKRINTA | NEPATIKRINTA | NEVEIKIA | NEĮGYVENDINTA | BLOKUOTA |
|---|---|---|---|---|---|---|---|---|
| Registracija | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Profiliai ir CV | 37 | 29 | 2 | 0 | 0 | 1 | 1 | 4 |
| Darbo paieška | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Poreikių skelbimas | 5 | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| Kandidatavimas ir įdarbinimas | 12 | 11 | 1 | 0 | 0 | 0 | 0 | 0 |
| Agentūrų veikla | 25 | 22 | 1 | 0 | 0 | 0 | 2 | 0 |
| Organizacijų valdymas ir projektai | 42 | 38 | 3 | 0 | 0 | 0 | 0 | 1 |
| Mokymas ir praktika | 10 | 7 | 0 | 0 | 0 | 1 | 1 | 1 |
| Komunikacija | 21 | 15 | 1 | 0 | 0 | 0 | 2 | 3 |
| Prekyvietė | 22 | 15 | 0 | 0 | 0 | 0 | 6 | 1 |
| Mokėjimai | 29 | 4 | 6 | 1 | 1 | 2 | 8 | 7 |
| AI funkcijos ir MCP | 26 | 11 | 0 | 0 | 0 | 1 | 3 | 11 |
| Kalbos ir mobilus naudojimas | 18 | 12 | 0 | 0 | 0 | 0 | 0 | 6 |
| Saugumas, privatumas ir administravimas | 24 | 18 | 0 | 2 | 0 | 1 | 0 | 3 |
| Rinkos žinios | 6 | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| Infrastruktūra ir veikimas | 17 | 11 | 2 | 1 | 0 | 2 | 0 | 1 |

Papildomos patikros, matuotos ne funkcijų eilutėse (paskutinis matavimas registre):

| Patikra | Matuota | Rezultatai |
|---|---|---|
| SEO | 2026-11-04 | PASS 9, BLOCKED 1, FAIL 1, NOT VERIFIED 2 |
| GEO (AI paieškos varikliai) | 2026-11-04 | PASS 5, NOT VERIFIED 1 |
| Vidinė paieška | 2026-11-04 | FAIL 3, PASS 5, NOT VERIFIED 2 |
| UX/UI (neprisijungus) | 2026-11-04 | PASS 15 |

## A6. Pilnumo kontrolė

- Patvirtinta apimtis: 287 funkcijų (registras; dublikatai ir papildomi testai neskaičiuojami).
- Veikia produkcijoje: 198. Neužbaigta: 89 (sąrašas žemiau ir A7).
- Regresijos registre: 13.1.

### Neužbaigti reikalavimai ir kitas veiksmas

| ID | Funkcija | Būsena | Trūkumas | Atsakingas | Kitas veiksmas |
|---|---|---|---|---|---|
| 1.3 | Slaptažodžio atkūrimas | VEIKIA PRODUKCIJOJE (dalinai) | no repeatable production walk yet (D-4 mailbox walk #2903 pending the owner) | N / B (registracija, laiškai) | Pašalinti likusį trūkumą |
| 1.4 | Pirmieji žingsniai po registracijos | VEIKIA PRODUKCIJOJE (dalinai) | open: UF-4 (first real user 2026-11-04) | N / B (registracija, laiškai) | Pašalinti likusį trūkumą |
| 1.8 | Viena organizacija, keli veiklos tipai | BLOKUOTA | Nėra produkcijos įrodymo | N / B (registracija, laiškai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 1.9 | Nariai, kvietimai ir vaidmenys | VEIKIA PRODUKCIJOJE (dalinai) | expired-invitation and project-linked invitation not walked in production | N / B (registracija, laiškai) | Pašalinti likusį trūkumą |
| 2.2 | Darbo kortelė | VEIKIA PRODUKCIJOJE (dalinai) | **2026-11-06: Save on a page the browser translates killed the screen, with the row stored (real report 11-05); #3113 and #3114, walk availability-save 42207699886 on ae2cf083a, 20/20, translator DOM swap emulated in real Chrome, plus 5 other languages and the education and certificate forms. Real sign-out and new sign-in not walked; Chrome's own translator not run** | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.3 | CV įkėlimas ir patvirtinimas | VEIKIA PRODUKCIJOJE (dalinai) | open: UF-3 (first real user 2026-11-04); **FAIL 2026-11-05: two tabs confirming the same CV education or certificate row at the same moment can store it twice.** Walk cv-import-duplicates 42098444964, real Chrome: confirmed once and re-imported (#3102) gave 1 row each, PASS; every parallel round sent 2 POSTs, each answered 201. Rows stored: 7 education from 4 titles, 5 certificate from 3 titles, from the cleanup's totals, because that run stopped before its own per-round counts and never reached the double click. No unique key on these tables; a migration is a separate owner decision. Cause: read, then insert, with nothing in the database between. Fix prepared 2026-11-06, unapplied and not proven on production, so the FAIL stands: a unique index and a per-person lock in a draft migration awaiting the owner. The review's confirms no longer re-render the whole page per row, the load that slowed run 42098444964 2026-11-06, walk 42208992447 on ae2cf083a after #3110: double click 1 action and 1 row, PASS; cleanup 0 rows left, PASS; parallel still 2 rows each, FAIL, until the RED draft #3111 is applied by owner decision. | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.7 | Išsilavinimas | VEIKIA PRODUKCIJOJE (dalinai) | fixed by #3089 and proven in prod walk profile-cv-history 41994411748 2026-11-05 on a6dd80110 (24/24, the runner's Chrome, headless, scripted): education, achievements and experience each show a failed save with no row and the typed text kept, a saved row in under 1 s, one row after a reload and after a repeat save, and a removal in under 1 s. No person in real Chrome yet. Before #3089 a saved row took 6 to 30 s under load and a repeat save stored it twice. Open: a repeat CV import can still store an education row twice (`confirmCvEducationAction`); in the same run the summary restore was stored (HTTP 200) but "saved" did not show within 30 s, cause unknown, seen once; open: UF-5 suggestion (first real user 2026-11-04) | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.10 | Nuorodos į kitus profilius | BLOKUOTA | Nėra produkcijos įrodymo | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.17 | Europos profesijų klasifikatorius | TIK KODE | Nėra produkcijos įrodymo | G / H (#3354 CV) | Owner: RED #2463 and quota |
| 2.19 | Darbo žurnalas | VEIKIA PRODUKCIJOJE (dalinai) | AI suggestions stay BLOCKED in 10.9 (owner AI keys); the honest off-state is proven | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.24 | Patirties įrašai ir ginčai | NEVEIKIA | Nėra produkcijos įrodymo | G / H (#3354 CV) | Coordinator: private record |
| 2.27 | Įmonės istorinių įrašų įkėlimas | BLOKUOTA | Nėra produkcijos įrodymo | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.28 | Senų įrašų sujungimas | BLOKUOTA | Nėra produkcijos įrodymo | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.30 | Žurnalas balsu | BLOKUOTA | Nėra produkcijos įrodymo | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.36 | Žurnalo šablonai pagal profesiją | TIK KODE | no production walk | G / H (#3354 CV) | Coordinator: add a walk step for a profession template |
| 2.37 | Įrašo atsisakymas | NEĮGYVENDINTA | owner decision ARCH-5, then build | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 3.1 | Įmonės pradžia | VEIKIA PRODUKCIJOJE (dalinai) | large-org timing not measured | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.13 | Projekto operacijų lenta | VEIKIA PRODUKCIJOJE (dalinai) | outsider-refusal step E-13 still to re-run (spec fixed #2702) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.14 | Darbų planavimas ir kalendorius | VEIKIA PRODUKCIJOJE (dalinai) | open: UF-6 (first real user 2026-11-04) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.22 | Žmonių įkėlimas | VEIKIA PRODUKCIJOJE (dalinai) | spec fault fixed #2667 | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.30 | Įmonės nustatymai ir pagalbos prašymas | VEIKIA PRODUKCIJOJE (dalinai) | 10-23 failure was a walk-spec defect (#2702) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.32 | Įrankiai ir turtas | VEIKIA PRODUKCIJOJE (dalinai) | D-2 fixed | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.34 | Projekto eigos prognozė | TIK KODE | wire storage + recompute modes (#2738), then walk a project with enough recorded work | H (organizacijos) | Coordinator: install the cron (#2738), then walk a project with enough recorded work |
| 3.35 | Persidengiančių įsipareigojimų įspėjimas | TIK KODE | flow + production walk | H (organizacijos) | Owner: RED #2795. Coordinator: walk the flow |
| 3.36 | Įmonės gyvasis CV | TIK KODE | owner to confirm the product shape | H (organizacijos) | Owner: confirm the product shape |
| 4.4 | Viešoji darbo skelbimų lenta | VEIKIA PRODUKCIJOJE (dalinai) | open: UF-1, UF-2, UF-7 (first real user 2026-11-04) | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.5 | Žmonių ir darbų suderinimas | VEIKIA PRODUKCIJOJE (dalinai) | older needs await an owner-approved backfill | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.6 | Komandos paieška ir pasiūlymas | VEIKIA PRODUKCIJOJE (dalinai) | pricing note fixed #2687 | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.9 | Išsaugotos paieškos ir pranešimai | VEIKIA PRODUKCIJOJE (dalinai) | not walked in production | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.18 | Duomenų atskleidimas darbdaviui | BLOKUOTA | Nėra produkcijos įrodymo | A / C (paieška, atranka) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 4.22 | Trys nemokami profilių peržiūrėjimai | NEĮGYVENDINTA | owner approval + figures | A / C (paieška, atranka) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 4.30 | Kandidatas, sprendimas, poreikio uždarymas | TIK KODE | build decision/history UI; agency parts | A / C (paieška, atranka) | GREEN executor: decision and history UI. Coordinator: walk |
| 5.5 | Žinučių vertimas | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | E (pranešimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 5.7 | Pranešimai el. paštu | VEIKIA PRODUKCIJOJE (dalinai) | not walked in production | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.8 | Pranešimai telefone | BLOKUOTA | owner: VAPID keys + real delivery test | E (pranešimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 5.9 | Savaitės apžvalga | VEIKIA PRODUKCIJOJE (dalinai) | by design a worker who visited that week gets the digest in-app only | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.11 | Darbuotojo kalendorius | VEIKIA PRODUKCIJOJE (dalinai) | open: UF-6 (first real user 2026-11-04) | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.13 | Užsakymas, sutikimas, darbas | VEIKIA PRODUKCIJOJE (dalinai) | the acknowledged-overlap path stays RED #2795 (constraint not relaxed); plain accept works | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.15 | Balsas kaip lygiavertis būdas | TIK KODE | no prod voice walk | E (pranešimai) | Owner: voice host (deferred 2026-10-08) |
| 5.16 | Įspėjimai savininkui | BLOKUOTA | Nėra produkcijos įrodymo | E (pranešimai) | Coordinator: private record |
| 5.20 | Savos automatizacijos | NEĮGYVENDINTA | build | E (pranešimai) | None now. Owner schedules it if wanted |
| 5.21 | SMS ir WhatsApp kanalai | NEĮGYVENDINTA | owner: paid channel provider (separate approval) | E (pranešimai) | None now. Owner schedules it if wanted |
| 6.4 | Pirkėjo erdvė | VEIKIA PRODUKCIJOJE (dalinai) | open security/permission item — details kept out of the public repository (owner rule) | C (prekyvietė) | Pašalinti likusį trūkumą |
| 6.8 | Komandiruotės | VEIKIA PRODUKCIJOJE (dalinai) | fixed by #2706 (rpc .catch crash) | C (prekyvietė) | Pašalinti likusį trūkumą |
| 6.11 | Pasirengimas darbui užsienyje | VEIKIA PRODUKCIJOJE (dalinai) | copy D-2 | C (prekyvietė) | Coordinator: Chrome check of the public part |
| 6.12 | Tarptautiniai sandoriai | NEĮGYVENDINTA | owner: decide whether 6.6 contracts + 6.11 cross-border readiness suffice | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.13 | Prekių užsakymai | NEĮGYVENDINTA | depends on payments for goods (only org plans are armed); owner design | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.14 | Logistika | NEĮGYVENDINTA | depends on 6.13 | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.21 | Viešas verslo puslapis | BLOKUOTA | Nėra produkcijos įrodymo | C (prekyvietė) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 6.22 | Būstas | NEĮGYVENDINTA | owner scope, then build | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.23 | Paslaugos įvertinimas ir ginčai | NEĮGYVENDINTA | owner policy, then build | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.24 | Paslaugų srautas telefone | NEĮGYVENDINTA | owner to confirm | C (prekyvietė) | None now. Owner schedules it if wanted |
| 7.2 | Nemokamas planas: vienas atviras poreikis | TIK CI PATIKRINTA | Nėra produkcijos įrodymo | D (mokėjimai) | Coordinator: a QA organization off the pilot, then walk the limit |
| 7.5 | Mokėjimas už planą | NEPATIKRINTA | Nėra produkcijos įrodymo | D (mokėjimai) | Owner: self-serve stays off by decision |
| 7.6 | Mokėjimų įrašų atkūrimas | BLOKUOTA | owner VPS step | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.7 | Rankinis bandomojo plano suteikimas | BLOKUOTA | Nėra produkcijos įrodymo | D (mokėjimai) | Coordinator: fix the walk harness, re-run |
| 7.8 | Kreditų sąskaita | BLOKUOTA | Nėra produkcijos įrodymo | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.9 | Kreditų papildymas ir planų pakopos | NEĮGYVENDINTA | owner prices; LMC owner-locked | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.11 | Atidėti planai | NEĮGYVENDINTA | owner prices | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.12 | Dirbtinio intelekto kaštų skaičiavimas | BLOKUOTA | Nėra produkcijos įrodymo | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.13 | Užsakymų riba pagal planą | TIK KODE | needs an org at its booking limit (synthetic Gama is on the pilot) | D (mokėjimai) | Coordinator: a QA organization at its booking limit, then walk |
| 7.14 | Skelbimų vertimo teisė | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.15 | Metinė prenumerata | BLOKUOTA | owner: approve #2685 and decide when to show EUR 99 | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.17 | Dvigubo apmokestinimo apsauga | VEIKIA PRODUKCIJOJE (dalinai) | 2 stale open checkout ops | D (mokėjimai) | Coordinator: close the 2 stale open checkout operations; name the run |
| 7.18 | Mokėjimas keičia teises | TIK KODE | missing evidence: payment failure or expiry -> rights withdrawn (TEST-mode failed payment scenario, or the pilot's own expiry 2026-11-22) | D (mokėjimai) | Coordinator: walk failure and expiry in Stripe TEST (7.4) |
| 7.19 | Grąžinimai ir ginčai | BLOKUOTA | owner refund policy + TEST walk | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.20 | Sąskaitos platformoje | NEĮGYVENDINTA | build Stripe invoice read for the org | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.21 | Atsiskaitymo portalas | TIK KODE | missing evidence: a second billing manager of the same org opens the portal | D (mokėjimai) | Coordinator: a second billing manager in the walk |
| 7.22 | Mokamų funkcijų teisės ir ribos | TIK KODE | missing evidence: the other paid-feature limits (profile views #2474, VIP) are not built/applied | D (mokėjimai) | Owner: #2474 and the limits. Coordinator: walk |
| 7.23 | Kreditų pirkimas | NEĮGYVENDINTA | owner: packages, VAT, refund; LMC owner-locked | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.24 | Kreditai po vieno mokėjimo | NEĮGYVENDINTA | depends on 7.23 | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.25 | Kreditų likutis ir istorija | TIK KODE | open security/permission item — details kept out of the public repository (owner rule) | D (mokėjimai) | Coordinator: private record |
| 7.26 | Kreditų išleidimas ir grąžinimas | NEĮGYVENDINTA | depends on 7.23 | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.27 | Nemokamas VIP patvirtintoms įmonėms | NEVEIKIA | owner #2474 | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.28 | Pardavėjas ir sąlygos | NEVEIKIA | owner/legal clauses (RED); meta-text removal in progress | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.29 | PVM skaičiavimas | TIK KODE | Nėra produkcijos įrodymo | D (mokėjimai) | Owner + legal: RED #2685 |
| 7.30 | Sąskaitos ir priėmimo aktai iš žurnalo | NEĮGYVENDINTA | owner: invoicing rules per country, then build | D (mokėjimai) | None now. Owner schedules it if wanted |
| 7.31 | Planai darbuotojams ir įmonėms | NEĮGYVENDINTA | owner: final tiers, limits and prices (separate approval); no pricing change before that | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.1 | Svetainės kalbos | VEIKIA PRODUKCIJOJE (dalinai) | D-1 fixed | E / F (kalbos, mobilus) | Coordinator: re-run sectors-languages |
| 8.3 | Automatinis vertimas | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.5 | Devynios pirmosios rinkos | BLOKUOTA | Activating the 5 markets needs ~9400 missing keys per locale plus the [EN] placeholders translated and reviewed (owner: translation source/budget decision; zero paid AI policy) | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.9 | Viešas įmonės profilis | BLOKUOTA | owner: allow a synthetic public profile for the walk, or wait for a real organization to opt in | E / F (kalbos, mobilus) | Coordinator: fix the walk harness, re-run |
| 8.13 | Programėlė telefonui | BLOKUOTA | Nėra produkcijos įrodymo | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.14 | Nuorodos į programėlę | BLOKUOTA | Nėra produkcijos įrodymo | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.15 | Programėlių parduotuvės | BLOKUOTA | owner store accounts (Google Play, Apple, EAS) + ARCH-6 | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.17 | Programėlė Android telefonui | VEIKIA PRODUKCIJOJE (dalinai) | not in Google Play (see 8.15) | E / F (kalbos, mobilus) | Owner: Google Play account (8.15) |
| 8.18 | Programėlė iPhone | VEIKIA PRODUKCIJOJE (dalinai) | need submission not tested on iOS (open, owner decision); first attempt can stall on the system Save-Password sheet; not in the App Store (see 8.15) | E / F (kalbos, mobilus) | Owner: Apple account (8.15) |
| 9.8 | Duomenų prieigos taisyklės | VEIKIA PRODUKCIJOJE (dalinai) | cleanup candidate backfill snapshot (RED) | R2 (saugumas) | Coordinator: a read-only catalog run, stated in the private record |
| 9.9 | Veiksmų žurnalas | TIK CI PATIKRINTA | open security/permission item — details kept out of the public repository (owner rule) | R2 (saugumas) | Coordinator: private record |
| 9.10 | Užklausų ribojimas | VEIKIA PRODUKCIJOJE (dalinai) | in-memory per instance; real-IP depends on VPS cloudflare.inc | R2 (saugumas) | Coordinator: private record |
| 9.16 | Rekomendavimo sąsaja | BLOKUOTA | Nėra produkcijos įrodymo | R2 (saugumas) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 9.17 | Vidinis pasiūlos srautas | TIK CI PATIKRINTA | readback 1x/24 h vs 4/day intended | R2 (saugumas) | Coordinator: settle the intended readback cadence, then a job run |
| 9.19 | Importo bandymų erdvė | BLOKUOTA | owner: enable flag if wanted | R2 (saugumas) | None now. Owner schedules it if wanted |
| 9.20 | Stebėjimų tikrintuvas | BLOKUOTA | owner: enable flag if wanted | R2 (saugumas) | None now. Owner schedules it if wanted |
| 9.22 | Aplinkos nustatymų patikra | VEIKIA PRODUKCIJOJE (dalinai) | open security/permission item — details kept out of the public repository (owner rule) | R2 (saugumas) | Coordinator: private record |
| 9.23 | Duomenų bazės funkcijų kontrolė | VEIKIA PRODUKCIJOJE (dalinai) | 3 functions mutable search_path (RED R-2) | R2 (saugumas) | Coordinator: RED R-2, private record |
| 9.24 | Saugumo incidentų tvarkymas | VEIKIA PRODUKCIJOJE (dalinai) | CSP has no report-uri | R2 (saugumas) | Coordinator: private record |
| 9.25 | Saugumo perspėjimai | NEVEIKIA | open security/permission item — details kept out of the public repository (owner rule) | R2 (saugumas) | Coordinator: private record |
| 10.1 | Atvira sąsaja dirbtinio intelekto programoms | VEIKIA PRODUKCIJOJE (dalinai) | tools/list 233 tools on c3df7431d; the row title's 229 predates #2889/#2895 | F (AI, MCP) | Pašalinti likusį trūkumą |
| 10.3 | Prisijungimas dirbtinio intelekto programoms | VEIKIA PRODUKCIJOJE (dalinai) | #2454 (the spec) awaits owner merge; a security item is open (details in the private record) | F (AI, MCP) | Pašalinti likusį trūkumą |
| 10.4 | Dirbtinio intelekto leidimų sritys | NEĮGYVENDINTA | auth path = RED; design draft #2923; final set = owner decision X-2 | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.5 | Sąrašai dirbtinio intelekto parduotuvėse | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.6 | Dirbtinio intelekto pagalba | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.7 | Pokalbio ketinimų atpažinimas | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.8 | CV sutvarkymas dirbtiniu intelektu | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.9 | Žurnalo siūlymai | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.10 | Paaiškinimai | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.15 | Pagalbininkų vykdymas | NEĮGYVENDINTA | owner AGENT-1..4 decisions; ARCHITECTURE_ONLY | F (AI, MCP) | None now. Owner schedules it if wanted |
| 10.16 | Pagalbininkai kaip dalyviai | NEĮGYVENDINTA | owner AGENT-1..4 decisions | F (AI, MCP) | None now. Owner schedules it if wanted |
| 10.20 | Senų skelbimų šalinimas | NEVEIKIA | open security/permission item — details kept out of the public repository (owner rule) | F (AI, MCP) | Coordinator: private record |
| 10.21 | Statistikos importas | BLOKUOTA | owner: allow scheduled import | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.22 | Partnerio organizacijos sąsaja | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.24 | Savo serverio vertimas | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.25 | Debesų dirbtinis intelektas | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.26 | Programų konkursas | BLOKUOTA | Nėra produkcijos įrodymo | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 11.8 | Mokymų ir pažymėjimų sąrašas | NEVEIKIA | engaged non-member workers cannot be assigned training (owner product decision, RED #2816) | L (mokymasis) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 11.9 | Mokymosi peržiūra žmogaus akimis | BLOKUOTA | Nėra produkcijos įrodymo | L (mokymasis) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 11.10 | Ankstesnio mokymosi pripažinimas | NEĮGYVENDINTA | owner, RED schema | L (mokymasis) | None now. Owner schedules it if wanted |
| 12.2 | Darbo rinkos žinios | VEIKIA PRODUKCIJOJE (dalinai) | copy D-2 | koordinatorius | Coordinator: Chrome check; copy D-2 stays open |
| 12.4 | Poreikio atpažinimas | VEIKIA PRODUKCIJOJE (dalinai) | duration-vs-headcount follow-up #2694 (auto-merge after regression tests); re-check after deploy; crews not representable yet (flagged) | koordinatorius | Pašalinti likusį trūkumą |
| 13.1 | Svetainės talpinimas ir atnaujinimas | NEVEIKIA | REGRESIJA. REGRESSION-class infra: GitHub-runner → VPS inbound loss now fails production walks; provider network fault probable, not proven; Hostinger ticket pending owner | M / koordinatorius | Coordinator: private record |
| 13.4 | Duomenų bazės talpa | TIK CI PATIKRINTA | Nėra produkcijos įrodymo | M / koordinatorius | Coordinator: read the plan and capacity, name the date |
| 13.5 | Atsarginės kopijos | VEIKIA PRODUKCIJOJE (dalinai) | Per part, 2026-11-05. PASS: start after Quality Gates on main, guard skip (41834401403, #3067); a backup started by a merge (41981561592); freshness job fresh path (41834401352); full backup + restore drill + shipping + stored grants (41824425911); grants proof and mismatch stop (41822877894, 41819279617); the failure issue closing (#3058). NOT VERIFIED: a backup started by the schedule (first slot since #3051 fired 2026-11-04 18:45 UTC, at least 3 h late, and the guard skipped it as it should, 41890262254; the 2026-11-05 00:28 UTC slot skipped too, 12 h after the last backup, 41941621226; measured over 7 days, frequent workflows lost 83-98% of slots and daily ones started 6-8 h late); the 26 h freshness job's stale path; the failure issue opening from a run on main; decrypting a stored file (last done 2026-11-03 on the VPS with its key; the check of today's file was refused to the agent session); the owner's offline key decrypting (never shown); a restore into a real Supabase project. VPS watchdog: NOT INSTALLED, on hold by the owner's order of 2026-11-05 (no root install; the 2026-11-04 approval no longer stands). A non-root variant is prepared for review only in draft #3104; installing it needs a separate owner approval. The owner approved an admin alert address; that it receives mail is not yet shown. Retention from the receiver, 2026-11-04: 4 dumps and 3 file bundles kept, 14-day rotation, 20,809 MB free, 366 MB a pair. No automatic off-site copy; a Backblaze plan is private and not activated (owner decision). Manual: encrypted files of 2026-11-03 on the owner's PC; Supabase managed backups (list not read). | M / koordinatorius | Pašalinti likusį trūkumą |
| 13.6 | Reguliarūs foniniai darbai | VEIKIA PRODUKCIJOJE (dalinai) | 1 erasure notice queued (no SMTP) | M / koordinatorius | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 13.8 | Pakeitimų žurnalo suderinimas | VEIKIA PRODUKCIJOJE (dalinai) | record/merge #2410 | M / koordinatorius | Coordinator: name a production parity run |
| 13.9 | Ryšys su kodo saugykla | BLOKUOTA | Nėra produkcijos įrodymo | M / koordinatorius | Coordinator: private record |
| 13.13 | Funkcijų prieinamumo sąrašas | TIK KODE | Nėra produkcijos įrodymo | M / koordinatorius | Coordinator: Chrome check of the catalogue's surfaces |
| 13.14 | Išimčių valdymas | VEIKIA PRODUKCIJOJE (dalinai) | live parity gate skipped: CI role lacks USAGE on supabase_migrations (owner GOV-1) | M / koordinatorius | Coordinator: restore the live parity read for CI |
| 13.16 | Naršyklės klaidų pranešimai | TIK KODE | Nėra produkcijos įrodymo | M / koordinatorius | Coordinator: find primary evidence or mark not built |
| 13.17 | Aplinkos suderinimas po perkėlimo | NEVEIKIA | OWNER+LEGAL: AI off coincides with owner 10-15 Gemini personal-data restriction (needs billed key + AI_GEMINI_PAID_TIER_CONFIRMED=1 / DPA). SMTP: LM_SMTP_PASS + INVITE_EMAIL_PROVIDER=smtp via lm-env-set.sh | M / koordinatorius | Owner: the decision in the Reason column. Then the coordinator applies or walks |

### Naujai aptiktos ar patvirtintos funkcijos ir prognozė

**Prognozė (sąlyginė, negarantuota):** pagrindinis produktas viešai – 2026 m. gruodžio vidurys; pilna istorinė apimtis – 2027 m. vasaris. Prognozė nepakeista.

## A7. Pilnas vardinis funkcijų registras

Stulpeliai: Apimtyje · Kode · Sujungta su main · Įdiegta · CI · Patikrinta produkcijoje · Visas scenarijus. Reikšmės išvestos iš registro būsenos; „nenustatyta“ — registras to neįrodo.

| ID | Pavadinimas | Ką atlieka / kam | Apimt. | Kode | main | Įdiegta | CI | Prod. | Scenarijus | Būsena | Trūkumai | Nuorodos | Atsakingas | Kitas veiksmas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | Registracija ir prisijungimas | Susikuri paskyrą ir prisijungi el. paštu bei slaptažodžiu. — darbuotojas, ieškantis darbo, įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2861, #2864, #2865, #2854, run 43680057090, build f5c0e88f (tikrinta 2026-11-15) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 1.2 | Prisijungimas per Google | Prisijungi viena paspaudimu su savo Google paskyra. — darbuotojas, ieškantis darbo, įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-18) | N / B (registracija, laiškai) | Coordinator: a Chrome check of the Google door on a QA identity |
| 1.3 | Slaptažodžio atkūrimas | Pamiršęs slaptažodį gauni laišką ir nusistatai naują. — darbuotojas, ieškantis darbo, įmonė, agentūra | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | no repeatable production walk yet (D-4 mailbox walk #2903 pending the owner) | #2861, #2864, #2865, run 41428606490, run 40166272659 (tikrinta 2026-11-02) | N / B (registracija, laiškai) | Pašalinti likusį trūkumą |
| 1.4 | Pirmieji žingsniai po registracijos | Po registracijos žingsnis po žingsnio nustatai, ko tau reikia. — darbuotojas, ieškantis darbo, įmonė, agentūra | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | open: UF-4 (first real user 2026-11-04) | #2845, #2846, run 41279196446, build 51a35183 (tikrinta 2026-11-01) | N / B (registracija, laiškai) | Pašalinti likusį trūkumą |
| 1.5 | Keli vaidmenys vienoje paskyroje | Vienoje paskyroje gali būti ir darbuotojas, ir įmonės žmogus. — darbuotojas, įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41280157502, build 38bfb9d93 (tikrinta 2026-11-01) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 1.6 | Įmonės paskyros sukūrimas | Sukuri savo įmonės ar organizacijos paskyrą. — įmonė, vadovas, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 1.7 | Įmonės patikra | Įmonė patvirtinama, kad kiti ja galėtų pasitikėti. — įmonė, administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 1.8 | Viena organizacija, keli veiklos tipai | Viena organizacija gali veikti keliose srityse vienu metu. — įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | N / B (registracija, laiškai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 1.9 | Nariai, kvietimai ir vaidmenys | Pakvieti žmones į įmonę ir nustatai, ką kiekvienas gali daryti. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | expired-invitation and project-linked invitation not walked in production | #2861, #2864, #2865, run 41430482903 (tikrinta 2026-11-02) | N / B (registracija, laiškai) | Pašalinti likusį trūkumą |
| 1.10 | Darbo erdvės perjungimas | Perjungi tarp savo asmeninės ir įmonės erdvių. — darbuotojas, įmonė, vadovas, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41318490491, build 681e6678f (tikrinta 2026-11-01) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 1.11 | Įmonių duomenų atskyrimas | Apsaugo, kad viena įmonė nematytų kitos įmonės duomenų. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2876, run 41318189146, build 681e6678f (tikrinta 2026-11-01) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 1.12 | Kvietimai ir rekomendavimas | Pakvieti pažįstamus prisijungti per savo nuorodą. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2855, #2858, build a4cbc9b9 (tikrinta 2026-10-28) | N / B (registracija, laiškai) | Coordinator: walk the referral link end to end |
| 1.13 | Sistemos laiškai | Gauni svarbius laiškus apie savo paskyrą ir veiksmus. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-28) | N / B (registracija, laiškai) | Owner + legal: mail stays limited (13.17). Coordinator: walk after |
| 1.14 | Pranešimas apie peržiūrą | Personalas gauna žinią, kai ką nors reikia peržiūrėti. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-21) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 1.15 | Įmonės praeitis ir jos perėmimas | Perimi savo įmonės ankstesnius darbo įrašus. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41279265278, run 40217117255, build 38bfb9d93 (tikrinta 2026-11-01) | N / B (registracija, laiškai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.1 | Profesinis profilis | Susirašai, kas esi ir ką moki dirbti. — darbuotojas, ieškantis darbo, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.2 | Darbo kortelė | Nurodai, kada gali dirbti, kokio atlygio tikiesi ir kur. — darbuotojas, ieškantis darbo, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | **2026-11-06: Save on a page the browser translates killed the screen, with the row stored (real report 11-05); #3113 and #3114, walk availability-save 42207699886 on ae2cf083a, 20/20, translator DOM swap emulated in real Chrome, plus 5 other languages and the education and certificate forms. Real sign-out and new sign-in not walked; Chrome's own translator not run** | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.3 | CV įkėlimas ir patvirtinimas | Įkeli CV ir patvirtini kiekvieną joje rastą faktą. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | open: UF-3 (first real user 2026-11-04); **FAIL 2026-11-05: two tabs confirming the same CV education or certificate row at the same moment can store it twice.** Walk cv-import-duplicates 42098444964, real Chrome: confirmed once and re-imported (#3102) gave 1 row each, PASS; every parallel round sent 2 POSTs, each answered 201. Rows stored: 7 education from 4 titles, 5 certificate from 3 titles, from the cleanup's totals, because that run stopped before its own per-round counts and never reached the double click. No unique key on these tables; a migration is a separate owner decision. Cause: read, then insert, with nothing in the database between. Fix prepared 2026-11-06, unapplied and not proven on production, so the FAIL stands: a unique index and a per-person lock in a draft migration awaiting the owner. The review's confirms no longer re-render the whole page per row, the load that slowed run 42098444964 2026-11-06, walk 42208992447 on ae2cf083a after #3110: double click 1 action and 1 row, PASS; cleanup 0 rows left, PASS; parallel still 2 rows each, FAIL, until the RED draft #3111 is applied by owner decision. | run 41925521910, run 41282258795, run 40191899327, build 38bfb9d93 (tikrinta 2026-11-04) | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.4 | Gyvasis CV | Turi nuolat atsinaujinantį CV, kurį gali atsisiųsti. — darbuotojas, ieškantis darbo, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2894, #2837, #2838, run 41279196446, run 41281984217, run 40546035425, build 429b106bc (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.5 | Darbo patirtis | Surašai, kur dirbai ir ką darei. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41925521910, run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-04) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.6 | Praktika ir savanorystė | Įrašai praktiką ir savanorystę kaip patirtį. — ieškantis darbo, besimokantis, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.7 | Išsilavinimas | Pridedi savo mokslus ir kvalifikacijas. — darbuotojas, ieškantis darbo, besimokantis | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | fixed by #3089 and proven in prod walk profile-cv-history 41994411748 2026-11-05 on a6dd80110 (24/24, the runner's Chrome, headless, scripted): education, achievements and experience each show a failed save with no row and the typed text kept, a saved row in under 1 s, one row after a reload and after a repeat save, and a removal in under 1 s. No person in real Chrome yet. Before #3089 a saved row took 6 to 30 s under load and a repeat save stored it twice. Open: a repeat CV import can still store an education row twice (`confirmCvEducationAction`); in the same run the summary restore was stored (HTTP 200) but "saved" did not show within 30 s, cause unknown, seen once; open: UF-5 suggestion (first real user 2026-11-04) | run 41925521910, run 41922748967, run 41282258795, build 38bfb9d93 (tikrinta 2026-11-04) | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.8 | Pasiekimai ir pažymėjimai | Pridedi pasiekimus ir savo nurodytus pažymėjimus. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.9 | Kalbos | Nurodai, kokias kalbas moki ir kaip gerai. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.10 | Nuorodos į kitus profilius | Prie profilio pridedi nuorodas į savo darbus kitur. — darbuotojas, savarankiškas specialistas | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo | #2471 (atviras) (tikrinta —) | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.11 | Reikalavimų sąrašas | Matai, ko dar trūksta, kad atitiktum darbo reikalavimus. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40209522348 (tikrinta 2026-10-25) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.12 | Įgūdžių ir profesijų sąrašas | Pasirenki savo profesijas ir įgūdžius iš bendro sąrašo. — darbuotojas, ieškantis darbo, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.13 | Įgūdžių atpažinimas iš darbo žurnalo | Iš tavo darbo įrašų atpažįstama, ką moki. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2894, #2885, run 41281984217, run 40083930868, build 88a60b567 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.14 | Įrodymų lygiai | Matai, kiek tavo įgūdis pagrįstas tikru darbu. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.15 | Savo įgūdžių pareiškimas | Įrašai įgūdį savais žodžiais, net jei jo nėra sąraše. — darbuotojas, ieškantis darbo, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2754, run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.16 | Bendrieji gebėjimai | Matai gebėjimus, kurie tinka daugelyje darbų. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.17 | Europos profesijų klasifikatorius | Profesijos ir įgūdžiai susiejami su Europos sąrašu. — sistema | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | Nėra produkcijos įrodymo | #2463 (atviras) (tikrinta —) | G / H (#3354 CV) | Owner: RED #2463 and quota |
| 2.18 | Dokumentai ir jų galiojimas | Laikai dokumentus ir matai, kada baigsis jų galiojimas. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41716118134, run 40152566232, build a10b6c47d (tikrinta 2026-11-03) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.19 | Darbo žurnalas | Kasdien užsirašai, ką padarei darbe. — darbuotojas, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | AI suggestions stay BLOCKED in 10.9 (owner AI keys); the honest off-state is proven | #2893, #2895, #2884, run 41279196446, run 41281666555, run 41307643008, build 91a1a39c (tikrinta 2026-11-01) | G / H (#3354 CV) | Pašalinti likusį trūkumą |
| 2.20 | Vadovo patvirtinimas | Vadovas peržiūri ir patvirtina tavo darbo įrašus. — vadovas, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2948, run 41478434884, run 41467005959, run 41281666555, build 38bfb9d93 (tikrinta 2026-11-02) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.21 | Darbo patvirtinimo būsenos | Matai, ar įrašą jau patvirtino, ar dar laukia. — darbuotojas, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2895, run 41280396705, run 41307643008, run 40300016332, build c3df7431d (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.22 | Nuotraukos ir darbo įrodymai | Prie įrašo pridedi nuotraukas, kad parodytum atliktą darbą. — darbuotojas, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41312948857, run 40186822215, build 7f8bfaa2a (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.23 | Valandos ir suvestinės | Matai savo valandas ir darbo laiko lapus. — darbuotojas, vadovas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, build 7f0f06583 (tikrinta 2026-11-03) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.24 | Patirties įrašai ir ginčai | Gali užginčyti įrašą, kuris tau atrodo neteisingas. — darbuotojas, vadovas | taip | taip | taip | taip | nenustatyta | ne | ne | NEVEIKIA | Nėra produkcijos įrodymo | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Coordinator: private record |
| 2.25 | Darbas skaičiais | Matai savo darbo apimtis skaičiais. — darbuotojas, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.26 | Viena nuosekli profesinė istorija | Visa tavo darbo istorija sudėta į vieną vietą. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2894, run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.27 | Įmonės istorinių įrašų įkėlimas | Įmonė įkelia ankstesnius savo darbuotojų darbo įrašus. — įmonė, vadovas | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.28 | Senų įrašų sujungimas | Seni dubliuoti darbo įrašai sujungiami į vieną. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo | #2362 (atviras) (tikrinta —) | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.29 | Galimi, dar neįrodyti gebėjimai | Parodomi gebėjimai, kuriuos tikėtina turi. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41281984217, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.30 | Žurnalas balsu | Darbo žurnalą pasakai balsu, o ne rašai. — darbuotojas, savarankiškas specialistas | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.31 | Žurnalo įrašų apsauga nuo keitimo | Apsaugo, kad praeities įrašai nebūtų slapčia pakeisti. — darbuotojas, vadovas, sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40083466362 (tikrinta 2026-10-24) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.32 | Kitos pusės atsiliepimas | Klientas ar partneris patvirtina arba įvertina atliktą darbą. — savarankiškas specialistas, klientas, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.33 | Darbų galerija | Rodai savo atliktų darbų nuotraukas. — savarankiškas specialistas, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41312948857, run 40186822215, build 7f8bfaa2a (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.34 | Žurnalo ir valandų atsisiuntimas | Parsisiunti žurnalą ir valandas faile. — darbuotojas, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41312948857, run 40186822215, build 7f8bfaa2a (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.35 | Sutikimas būti randamam | Pats nusprendi, ar darbdaviai gali tave rasti. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | G / H (#3354 CV) | Nereikia; kartoti tik po susijusio pakeitimo |
| 2.36 | Žurnalo šablonai pagal profesiją | Gauni žurnalo formą, pritaikytą tavo profesijai. — darbuotojas, savarankiškas specialistas | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | no production walk |  (tikrinta 2026-11-01) | G / H (#3354 CV) | Coordinator: add a walk step for a profession template |
| 2.37 | Įrašo atsisakymas | Žmogus gali atsisakyti apie jį įkelto įrašo. — darbuotojas | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner decision ARCH-5, then build |  (tikrinta 2026-11-01) | G / H (#3354 CV) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 3.1 | Įmonės pradžia | Matai savo įmonės dienos vaizdą vienoje vietoje. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | large-org timing not measured |  (tikrinta 2026-10-23) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.2 | Projektai | Sukuri projektą ir seki jo eigą. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, run 41283540387, build 38bfb9d93 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.3 | Objektai ir vietos | Projektui priskiri objektą ar darbo vietą. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, build 7f0f06583 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.4 | Projekto etapai | Projektą suskaidai į etapus. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, run 41283540387, run 40085615921, build 38bfb9d93 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.5 | Užduotys | Skiri užduotis ir seki, ar jos atliktos. — įmonė, vadovas, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2724, run 41722638759, run 41283540387, run 40081437313, build 38bfb9d93 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.6 | Darbuotojo skyrimas projektui | Paskiri žmogų dirbti konkrečiame projekte. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2897, run 41722638759, run 41295981934, run 41283540387, build 38bfb9d93 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.7 | Brigados | Sudarai brigadą iš kelių žmonių. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-22) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.8 | Brigados skyrimas projektui | Visą brigadą paskiri į projektą. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2917, run 41350506578, build 7c46946c3 (tikrinta 2026-11-01) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.9 | Projekto pasirengimas | Matai, ar viskas paruošta projektui pradėti. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, build 7f0f06583 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.10 | Defektai ir taisymai | Užfiksuoji trūkumus ir pažymi, kada jie ištaisyti. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, build 7f0f06583 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.11 | Perdavimo dokumentas | Užbaigus darbą parengi perdavimo dokumentą klientui. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, build 7f0f06583 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.12 | Projekto išlaidos ir pajamos | Matai, kiek projektas kainuoja ir kiek uždirba. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, build 7f0f06583 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.13 | Projekto operacijų lenta | Matai visus projekto darbus vienoje lentoje ir parsisiunti. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | outsider-refusal step E-13 still to re-run (spec fixed #2702) | run 41722638759, run 41283540387, build 38bfb9d93 (tikrinta 2026-11-03) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.14 | Darbų planavimas ir kalendorius | Planuoji žmonių darbus kalendoriuje. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | open: UF-6 (first real user 2026-11-04) |  (tikrinta 2026-10-21) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.15 | Nebuvimai ir atostogos | Užsirašai ir patvirtini atostogas bei nebuvimus. — darbuotojas, vadovas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40007491242 (tikrinta 2026-10-23) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.16 | Žmonių trūkumo laiko juosta | Matai, kada trūks žmonių. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.17 | Žmonių rezervavimas | Rezervuoji žmogaus laiką ateičiai. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41722638759, build 7f0f06583 (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.18 | Užimtumas | Matai, kiek kiekvienas žmogus užimtas. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40295307338 (tikrinta 2026-10-26) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.19 | Planas ir faktas | Palygini suplanuotą darbą su atliktu. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40295307338 (tikrinta 2026-10-26) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.20 | Pamainos ir grafikai | Sudarai pamainų grafiką. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40659497014, run 40018016745 (tikrinta 2026-10-28) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.21 | Darbuotojų sąrašas | Matai visus savo įmonės žmones. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41318490491, build 681e6678f (tikrinta 2026-11-01) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.22 | Žmonių įkėlimas | Įkeli žmonių sąrašą iš failo. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | spec fault fixed #2667 | run 41318490491, run 40052543761, build 681e6678f (tikrinta 2026-11-01) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.23 | Priėmimas ir išleidimas iš darbo | Seki naujo darbuotojo įvedimą ir išėjimą. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41318490491, build 681e6678f (tikrinta 2026-11-01) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.24 | Patvirtinimai ir procesai | Pateiktus prašymus patvirtini ar atmeti. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41716118134, run 40663181329, run 40152566232, build a10b6c47d (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.25 | Vadovo sprendimai | Užrašai sprendimus ir jų peržiūras. — vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40687308231, run 40296167812 (tikrinta 2026-10-28) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.26 | Nurodymai | Darbuotojams išsiunti nurodymus. — vadovas, įmonė, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41318490491, run 40052543761, build 681e6678f (tikrinta 2026-11-01) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.27 | Įmonės istorija ir duomenų kokybė | Matai įmonės istoriją ir kur trūksta duomenų. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2894, run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.28 | Atsakymai vadovui pokalbyje | Vadovas pokalbyje paklausia apie savo įmonę ir gauna atsakymą. — vadovas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40054481359 (tikrinta 2026-10-24) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.29 | Įmonės dokumentų sąrašas | Saugai įmonės dokumentus vienoje vietoje. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41716118134, run 40152566232, build a10b6c47d (tikrinta 2026-11-03) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.30 | Įmonės nustatymai ir pagalbos prašymas | Keiti įmonės nustatymus ir paprašai pagalbos. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | 10-23 failure was a walk-spec defect (#2702) | run 41318490491, run 40052543761, build 681e6678f (tikrinta 2026-11-01) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.31 | Ataskaitos ir atsisiuntimas | Gauni ataskaitas ir jas parsisiunti. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.32 | Įrankiai ir turtas | Seki, kas turi kokį įmonės įrankį. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | D-2 fixed | run 41318490491, build 681e6678f (tikrinta 2026-11-01) | H (organizacijos) | Pašalinti likusį trūkumą |
| 3.33 | Valandų puslapis | Žiūri ir tvirtini žmonių valandas. — įmonė, vadovas, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2673, run 41283188592, build 38bfb9d93 (tikrinta 2026-11-01) | H (organizacijos) | Nereikia; kartoti tik po susijusio pakeitimo |
| 3.34 | Projekto eigos prognozė | Prognozuojama, kada projektas baigsis. — įmonė, vadovas | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | wire storage + recompute modes (#2738), then walk a project with enough recorded work | #2920, #2738, #2733, run 41366955536, run 41408054477 (tikrinta 2026-11-01) | H (organizacijos) | Coordinator: install the cron (#2738), then walk a project with enough recorded work |
| 3.35 | Persidengiančių įsipareigojimų įspėjimas | Gauni įspėjimą, kai žmogus paskirtas į du darbus vienu metu. — įmonė, vadovas | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | flow + production walk | #2795 (atviras) (tikrinta 2026-11-01) | H (organizacijos) | Owner: RED #2795. Coordinator: walk the flow |
| 3.36 | Įmonės gyvasis CV | Įmonė turi savo nuolat atsinaujinantį profilį. — įmonė, vadovas | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | owner to confirm the product shape |  (tikrinta 2026-11-01) | H (organizacijos) | Owner: confirm the product shape |
| 4.1 | Poreikio įvedimas | Įmonė vienodu būdu užrašo, kokių žmonių jai reikia. — įmonė, vadovas, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2837, #2838, run 41279196446, run 41283188592, run 40546035425, build 429b106bc (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.2 | Poreikis ir pasiūla atskirai | Skiriama, ko įmonė ieško ir ką žmogus siūlo. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40186517027 (tikrinta 2026-10-25) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.3 | Galimybių lenta darbuotojui | Matai tau tinkamas galimybes ir pasakai, kad domina. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283188592, run 40315387466, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.4 | Viešoji darbo skelbimų lenta | Be registracijos ieškai darbo skelbimų. — ieškantis darbo, darbuotojas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | open: UF-1, UF-2, UF-7 (first real user 2026-11-04) | run 41978529892, run 40645813917, run 40205429467, build c9a58473e (tikrinta 2026-11-05) | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.5 | Žmonių ir darbų suderinimas | Siūlomi tinkami darbai žmonėms ir žmonės darbams. — ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | older needs await an owner-approved backfill | #2889, #2887, run 41279265278, run 41283989921, run 40215640433, build e506e98b (tikrinta 2026-11-01) | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.6 | Komandos paieška ir pasiūlymas | Įmonė randa visą komandą ir jai pateikia pasiūlymą. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | pricing note fixed #2687 | #2917, run 41350506578, build 7c46946c3 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.7 | Derybos tarp įmonių | Dvi įmonės susiderina sąlygas. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-22) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.8 | Anoniminis poreikio pateikimas | Be registracijos įmonė palieka savo poreikį. — įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #3378, #3379, #2883, run 43680930057, run 40833394554, build f6c96f06 (tikrinta 2026-11-15) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.9 | Išsaugotos paieškos ir pranešimai | Išsaugai paiešką ir gauni žinią apie naujus skelbimus. — ieškantis darbo, darbuotojas | taip | taip | taip | nenustatyta | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | not walked in production | #2952, #2883, run 41488266687, run 40833394554, run 40186822215, build fa81b12fd (tikrinta 2026-11-02) | A / C (paieška, atranka) | Pašalinti likusį trūkumą |
| 4.10 | Pasiūlos paieška įmonėms | Įmonė ieško žmonių ir komandų pagal poreikį. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.11 | Kandidatų paieška | Įmonė ieško tinkamų kandidatų. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283188592, run 40546035425, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.12 | Trumpasis sąrašas ir pastabos | Įmonė susideda kandidatus į sąrašą ir rašo pastabas. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41279265278, run 40187168804, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.13 | Automatinis kandidatų parinkimas | Kandidatai parenkami automatiškai ir pateikiamas kvitas. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.14 | Kandidatų juodraščiai | Įmonė paruošia kandidato pasiūlymą prieš išsiunčiant. — agentūra, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.15 | Agentūros ir kliento ryšys | Agentūra susieja su klientu ir siūlo jam žmones. — agentūra, klientas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41717112150, run 40357361254, build a10b6c47d (tikrinta 2026-11-03) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.16 | Susisiekimas su susidomėjusiu žmogumi | Įmonė parašo žmogui, kuris pareiškė susidomėjimą. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #3333, run 43638235918, run 43626735228, run 41283188592, build 38bfb9d93 (tikrinta 2026-11-14) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.18 | Duomenų atskleidimas darbdaviui | Leidi konkrečiam darbdaviui matyti papildomus savo duomenis. — darbuotojas, ieškantis darbo | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo | #2471 (atviras) (tikrinta —) | A / C (paieška, atranka) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 4.19 | Prašymai atskleisti kontaktus | Įmonė paprašo tavo kontaktų, o tu nusprendi. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.20 | Asmens apsauga paieškoje | Paieškoje žmogaus tapatybė nerodoma be jo leidimo. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40046311013 (tikrinta 2026-10-24) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.21 | Asmens vardo slėpimas | Žmogaus vardas rodomas tik gavus leidimą. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40199732022, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.22 | Trys nemokami profilių peržiūrėjimai | Įmonė kelis profilius mato nemokamai, daugiau už papildomą planą. — įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner approval + figures | #2474 (atviras) (tikrinta —) | A / C (paieška, atranka) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 4.25 | Derinimo valdymo skydas | Administratorius tikrina derinimo rezultatus. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-25) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.26 | Viešas tinkamumo peržiūrėjimas | Be registracijos pamatai, ar tinki darbui. — ieškantis darbo, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40191899327 (tikrinta 2026-10-25) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.28 | Pasiūlos pareiškimas | Įmonė ar žmogus pasako, ką gali pasiūlyti. — savarankiškas specialistas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | A / C (paieška, atranka) | Nereikia; kartoti tik po susijusio pakeitimo |
| 4.29 | Susidomėjimas virsta laisva vieta | Žmogaus susidomėjimas paverčiamas darbo vieta įmonėje. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | A / C (paieška, atranka) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 4.30 | Kandidatas, sprendimas, poreikio uždarymas | Nuo kandidato iki priėmimo sprendimo ir poreikio uždarymo. — įmonė, agentūra, vadovas | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | build decision/history UI; agency parts |  (tikrinta 2026-11-01) | A / C (paieška, atranka) | GREEN executor: decision and history UI. Coordinator: walk |
| 5.1 | Pokalbio pradžia | Pradedi nuo pokalbio ir paprašai, ko reikia. — darbuotojas, ieškantis darbo, įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40191899327 (tikrinta 2026-10-25) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.2 | Pokalbio istorija | Pokalbis išlieka ir gali grįžti prie jo vėliau. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41322286924, run 40662743591, run 40042455002, build 4a5b45828 (tikrinta 2026-11-01) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.3 | Vienkartiniai patvirtinimai | Svarbų veiksmą patvirtini vieną kartą. — darbuotojas, įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-21) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.4 | Žinutės ir gijos | Susirašinėji su kitais žmonėmis ir įmonėmis. — darbuotojas, įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41717112150, build a10b6c47d (tikrinta 2026-11-03) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.5 | Žinučių vertimas | Žinutė išverčiama, o originalas lieka matomas. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | run 40191899327, run 40301607964 (tikrinta 2026-10-26) | E (pranešimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 5.6 | Pranešimai programoje | Matai naujus pranešimus programoje. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40012716741, run 40204616787 (tikrinta 2026-10-25) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.7 | Pranešimai el. paštu | Gauni svarbias žinias el. paštu. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | nenustatyta | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | not walked in production | #2883, run 41488266687, run 40833394554 (tikrinta 2026-11-02) | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.8 | Pranešimai telefone | Gauni pranešimą į telefoną. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner: VAPID keys + real delivery test | #2712 (tikrinta —) | E (pranešimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 5.9 | Savaitės apžvalga | Kas savaitę gauni trumpą apžvalgą el. paštu. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | by design a worker who visited that week gets the digest in-app only | #2883, run 42581979562, run 41488266687, run 40833394554 (tikrinta 2026-11-09) | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.10 | Veiklos centras | Vienoje vietoje matai, kam reikia tavo dėmesio. — darbuotojas, įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41312513056, run 40204616787, build 7f8bfaa2a (tikrinta 2026-11-01) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.11 | Darbuotojo kalendorius | Matai savo darbus kalendoriuje. — darbuotojas, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | open: UF-6 (first real user 2026-11-04) | run 40007491242 (tikrinta 2026-10-23) | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.12 | Prieinamumas | Nurodai, kada gali dirbti. — darbuotojas, savarankiškas specialistas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta —) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.13 | Užsakymas, sutikimas, darbas | Gauni užsakymą, jį priimi ir pradedi darbą. — darbuotojas, savarankiškas specialistas, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | the acknowledged-overlap path stays RED #2795 (constraint not relaxed); plain accept works | #2905, #2907, run 41718546706, run 41321294873, run 41311931938, build 4a5b45828 (tikrinta 2026-11-03) | E (pranešimai) | Pašalinti likusį trūkumą |
| 5.14 | Greitoji paieška ir balsas | Greitai randi puslapį ar veiksmą, galima balsu. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2673, #2679 (tikrinta —) | E (pranešimai) | Coordinator: add a finder step to a walk |
| 5.15 | Balsas kaip lygiavertis būdas | Viską gali padaryti ir balsu. — darbuotojas, įmonė | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | no prod voice walk | #2714 (tikrinta —) | E (pranešimai) | Owner: voice host (deferred 2026-10-08) |
| 5.16 | Įspėjimai savininkui | Savininkas gauna žinią per Telegram. — administratorius | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | E (pranešimai) | Coordinator: private record |
| 5.17 | Pagalbos pokalbiai | Parašai pagalbos komandai. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.18 | Paieška skyriuje | Ieškai žmonių, projektų ir dokumentų vienoje vietoje. — darbuotojas, įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.19 | Gautų ataskaitų peržiūra | Matai gautas ataskaitas. — vadovas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | E (pranešimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 5.20 | Savos automatizacijos | Pats susikuri automatinius veiksmus. — įmonė, vadovas | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | build |  (tikrinta 2026-11-01) | E (pranešimai) | None now. Owner schedules it if wanted |
| 5.21 | SMS ir WhatsApp kanalai | Žinutes gauni per SMS ar WhatsApp. — darbuotojas, įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner: paid channel provider (separate approval) |  (tikrinta 2026-11-01) | E (pranešimai) | None now. Owner schedules it if wanted |
| 6.1 | Paslaugos ir užklausų ratas | Siūlai paslaugas ir gauni užklausas. — savarankiškas specialistas, klientas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #3028, run 41729310761, run 41721656743, run 41284728549, build 38bfb9d93 (tikrinta 2026-11-03) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.2 | Skelbimai: prekės, nuoma, ieškau | Skelbi prekes, nuomą ar ko ieškai. — savarankiškas specialistas, klientas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #3028, run 41729310761, run 41721656743, run 41284728549, build 38bfb9d93 (tikrinta 2026-11-03) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.3 | Bendra paieška | Ieškai paslaugų ir skelbimų vienoje vietoje. — klientas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #3028, run 41729310761, run 41721656743, run 41284728549, build 38bfb9d93 (tikrinta 2026-11-03) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.4 | Pirkėjo erdvė | Kaip pirkėjas matai savo užklausas ir pasiūlymus. — klientas, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | open security/permission item — details kept out of the public repository (owner rule) | #3003, run 41713787541, run 41480104268, run 40377604733, build 4453e9d3a (tikrinta 2026-11-03) | C (prekyvietė) | Pašalinti likusį trūkumą |
| 6.6 | Pasiūlymai ir sutartys | Paruoši pasiūlymą ir sutartį klientui. — savarankiškas specialistas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41716118134, run 40152566232, build a10b6c47d (tikrinta 2026-11-03) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.7 | Pirkimai | Valdai pirkimus savo įmonėje. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41718546706, run 41321294873, run 40361384432, build 4a5b45828 (tikrinta 2026-11-03) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.8 | Komandiruotės | Planuoji ir seki komandiruotes. — įmonė, vadovas, darbuotojas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | fixed by #2706 (rpc .catch crash) | run 41718546706, run 41321294873, run 40361384432, build 4a5b45828 (tikrinta 2026-11-03) | C (prekyvietė) | Pašalinti likusį trūkumą |
| 6.9 | Finansų įrašai | Matai įmonės finansų įrašus. — įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41718546706, run 41321294873, run 40361384432, build 4a5b45828 (tikrinta 2026-11-03) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.10 | Projekto kainos skaičiuoklė | Be registracijos apskaičiuoji projekto kainą. — klientas, įmonė, savarankiškas specialistas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.11 | Pasirengimas darbui užsienyje | Matai, ko reikia dirbti kitoje šalyje. — įmonė, darbuotojas | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | copy D-2 |  (tikrinta 2026-10-23) | C (prekyvietė) | Coordinator: Chrome check of the public part |
| 6.12 | Tarptautiniai sandoriai | Įmonės sudaro sandorius tarp šalių. — įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner: decide whether 6.6 contracts + 6.11 cross-border readiness suffice |  (tikrinta —) | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.13 | Prekių užsakymai | Perki prekes per platformą. — klientas, įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | depends on payments for goods (only org plans are armed); owner design |  (tikrinta —) | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.14 | Logistika | Susitvarkai prekių pristatymą. — įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | depends on 6.13 |  (tikrinta —) | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.16 | Perdavimas partnerio organizacijai | Užklausa perduodama partnerio organizacijai. — įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-24) | C (prekyvietė) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 6.17 | Pardavimų eiga | Seki potencialių klientų eigą. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-25) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.18 | Laukiančiųjų sąrašas | Užsirašai gauti žinią, kai funkcija atsiras. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41357630136 (tikrinta 2026-11-01) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.19 | Komandos užklausos | Gauni komandos užklausas. — įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41279265278, run 40205429467, build 38bfb9d93 (tikrinta 2026-11-01) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.20 | Vertės kanalai | Parodomi keliai, kuriais žmogus gauna naudą iš platformos. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2831, run 40371836163, run 40363282539 (tikrinta 2026-10-26) | C (prekyvietė) | Nereikia; kartoti tik po susijusio pakeitimo |
| 6.21 | Viešas verslo puslapis | Verslas turi viešą savo puslapį. — įmonė, savarankiškas specialistas, klientas | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | C (prekyvietė) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 6.22 | Būstas | Susirandi nakvynę darbui. — darbuotojas, įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner scope, then build |  (tikrinta 2026-11-01) | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.23 | Paslaugos įvertinimas ir ginčai | Įvertini paslaugą, atšauki užsakymą ar paduodi skundą. — klientas, savarankiškas specialistas | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner policy, then build |  (tikrinta 2026-11-01) | C (prekyvietė) | None now. Owner schedules it if wanted |
| 6.24 | Paslaugų srautas telefone | Naršai paslaugas braukdamas pirštu. — klientas | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner to confirm |  (tikrinta 2026-11-01) | C (prekyvietė) | None now. Owner schedules it if wanted |
| 7.1 | Planai ir kainų puslapis | Matai, kokie yra planai. — įmonė, darbuotojas, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | D (mokėjimai) | Nereikia; kartoti tik po susijusio pakeitimo |
| 7.2 | Nemokamas planas: vienas atviras poreikis | Nemokamai gali turėti vieną atvirą poreikį. — įmonė | taip | taip | taip | nenustatyta | taip | ne | ne | TIK CI PATIKRINTA | Nėra produkcijos įrodymo |  (tikrinta 2026-10-23) | D (mokėjimai) | Coordinator: a QA organization off the pilot, then walk the limit |
| 7.3 | Planų teisių nustatymas | Žinoma, ką leidžia tavo planas. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | D (mokėjimai) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 7.4 | Bandomasis mokėjimas | Išbandomas mokėjimas be tikrų pinigų. — administratorius | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | PAPILDOMAS TESTAS | extra TEST scenario; does not block launch and is not a payment defect |  (tikrinta 2026-10-28) | D (mokėjimai) | Coordinator: arm the pilot in Stripe TEST (optional scenario) |
| 7.5 | Mokėjimas už planą | Įmonė už planą sumoka kortele. — įmonė | taip | taip | taip | taip | nenustatyta | ne | ne | NEPATIKRINTA | Nėra produkcijos įrodymo |  (tikrinta 2026-11-01) | D (mokėjimai) | Owner: self-serve stays off by decision |
| 7.6 | Mokėjimų įrašų atkūrimas | Pataisomi nepavykę mokėjimų įrašai. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner VPS step | #2696 (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.7 | Rankinis bandomojo plano suteikimas | Administratorius suteikia bandomąjį planą. — administratorius | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | D (mokėjimai) | Coordinator: fix the walk harness, re-run |
| 7.8 | Kreditų sąskaita | Seki kreditų likutį. — įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.9 | Kreditų papildymas ir planų pakopos | Papildai kreditus ir renkiesi planą. — įmonė, agentūra | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner prices; LMC owner-locked |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.11 | Atidėti planai | Ateityje bus papildomi planai darbuotojams ir agentūroms. — darbuotojas, agentūra | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner prices |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.12 | Dirbtinio intelekto kaštų skaičiavimas | Skaičiuojama, kiek kainuoja dirbtinio intelekto pagalba. — administratorius | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.13 | Užsakymų riba pagal planą | Plane nustatyta, kiek užsakymų gali turėti. — įmonė | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | needs an org at its booking limit (synthetic Gama is on the pilot) | run 40205429467 (tikrinta 2026-10-25) | D (mokėjimai) | Coordinator: a QA organization at its booking limit, then walk |
| 7.14 | Skelbimų vertimo teisė | Skelbimo vertimas priklauso nuo plano. — įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | #2771, run 40191899327, run 40301607964 (tikrinta 2026-10-26) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.15 | Metinė prenumerata | Įmonė užsisako mokamą planą. — įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner: approve #2685 and decide when to show EUR 99 | #2685 (atviras) (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.16 | Mokėjimo pranešimo patikra | Tikrinama, ar mokėjimo žinia tikra. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | D (mokėjimai) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 7.17 | Dvigubo apmokestinimo apsauga | Tavo kortelė nenurašoma du kartus už tą patį. — įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | 2 stale open checkout ops |  (tikrinta —) | D (mokėjimai) | Coordinator: close the 2 stale open checkout operations; name the run |
| 7.18 | Mokėjimas keičia teises | Sumokėjus atsiranda teisės, nutrūkus mokėjimui jos dingsta. — įmonė | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | missing evidence: payment failure or expiry -> rights withdrawn (TEST-mode failed payment scenario, or the pilot's own expiry 2026-11-22) |  (tikrinta 2026-10-23) | D (mokėjimai) | Coordinator: walk failure and expiry in Stripe TEST (7.4) |
| 7.19 | Grąžinimai ir ginčai | Pinigų grąžinimas ar ginčo sprendimas. — įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner refund policy + TEST walk |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.20 | Sąskaitos platformoje | Sąskaitas matai pačioje platformoje. — įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | build Stripe invoice read for the org | #2682 (atviras) (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.21 | Atsiskaitymo portalas | Kiekvienas už mokėjimus atsakingas žmogus gali atidaryti portalą. — įmonė, vadovas | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | missing evidence: a second billing manager of the same org opens the portal |  (tikrinta 2026-10-23) | D (mokėjimai) | Coordinator: a second billing manager in the walk |
| 7.22 | Mokamų funkcijų teisės ir ribos | Kiekviena mokama funkcija taikoma pagal plano ribas. — įmonė | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | missing evidence: the other paid-feature limits (profile views #2474, VIP) are not built/applied |  (tikrinta —) | D (mokėjimai) | Owner: #2474 and the limits. Coordinator: walk |
| 7.23 | Kreditų pirkimas | Vienkartinis kreditų pirkimas. — įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner: packages, VAT, refund; LMC owner-locked |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.24 | Kreditai po vieno mokėjimo | Už vieną mokėjimą kreditai suteikiami vieną kartą. — įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | depends on 7.23 |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.25 | Kreditų likutis ir istorija | Matai savo kreditų likutį ir istoriją. — įmonė | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | open security/permission item — details kept out of the public repository (owner rule) | run 40210854856 (tikrinta 2026-10-25) | D (mokėjimai) | Coordinator: private record |
| 7.26 | Kreditų išleidimas ir grąžinimas | Išleidžiami ir grąžinami kreditai. — įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | depends on 7.23 |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.27 | Nemokamas VIP patvirtintoms įmonėms | Patvirtinta įmonė gauna VIP nemokamai. — įmonė | taip | taip | taip | ne | nenustatyta | ne | ne | NEVEIKIA | owner #2474 |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.28 | Pardavėjas ir sąlygos | Matai, kas parduoda ir kokiomis sąlygomis. — įmonė | taip | taip | taip | ne | nenustatyta | ne | ne | NEVEIKIA | owner/legal clauses (RED); meta-text removal in progress |  (tikrinta —) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.29 | PVM skaičiavimas | Mokėjimuose skaičiuojamas PVM. — įmonė | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | Nėra produkcijos įrodymo | #2685 (atviras) (tikrinta —) | D (mokėjimai) | Owner + legal: RED #2685 |
| 7.30 | Sąskaitos ir priėmimo aktai iš žurnalo | Iš darbo žurnalo parengiama sąskaita ir priėmimo aktas. — savarankiškas specialistas, įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner: invoicing rules per country, then build |  (tikrinta 2026-11-01) | D (mokėjimai) | None now. Owner schedules it if wanted |
| 7.31 | Planai darbuotojams ir įmonėms | Planai abiem pusėms: nemokamas ir mokami. — darbuotojas, įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner: final tiers, limits and prices (separate approval); no pricing change before that |  (tikrinta 2026-11-01) | D (mokėjimai) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.1 | Svetainės kalbos | Naudoji platformą savo kalba. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | D-1 fixed | #2686 (tikrinta 2026-10-23) | E / F (kalbos, mobilus) | Coordinator: re-run sectors-languages |
| 8.2 | Darbas suprantamas keliomis kalbomis | Darbo aprašai suprantami keliomis kalbomis. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2779, run 40300823818 (tikrinta 2026-10-26) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.3 | Automatinis vertimas | Tekstas išverčiamas į tavo kalbą. — darbuotojas, ieškantis darbo, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | #2771, run 40191899327, run 40301607964 (tikrinta 2026-10-26) | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.4 | Šalių darbo rinkos puslapiai | Skaitai apie darbo rinką skirtingose šalyse. — ieškantis darbo, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.5 | Devynios pirmosios rinkos | Platforma pritaikoma devynioms šalims. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Activating the 5 markets needs ~9400 missing keys per locale plus the [EN] placeholders translated and reviewed (owner: translation source/budget decision; zero paid AI policy) |  (tikrinta 2026-10-28) | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.6 | Šalių reikalavimų lentelė | Matai, ko reikia dirbti konkrečioje šalyje. — ieškantis darbo, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40209522348 (tikrinta 2026-10-25) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.7 | Viešas atsakymų puslapis | Randi atsakymus į dažniausius klausimus. — ieškantis darbo, darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.8 | Paieškos sistemų paruošimas | Svetainė tinkamai matoma paieškos sistemose. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.9 | Viešas įmonės profilis | Įmonė turi viešą savo profilį. — įmonė, klientas | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner: allow a synthetic public profile for the walk, or wait for a real organization to opt in | run 40205429467 (tikrinta 2026-10-26) | E / F (kalbos, mobilus) | Coordinator: fix the walk harness, re-run |
| 8.10 | Pristatymo svetainė | Perskaitai apie platformą prieš registruojantis. — ieškantis darbo, darbuotojas, įmonė, agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.11 | Svetainė telefone | Naudoji platformą telefone. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2751, #2755, #2759, run 41311144346, run 41317177981, run 40195784343, build 681e6678f (tikrinta 2026-11-01) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.12 | Įdiegimas telefone | Platformą įdedi į telefono pradžios ekraną. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40205429467 (tikrinta 2026-10-25) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.13 | Programėlė telefonui | Atskira programėlė telefone. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo | build 84cc2f85 (tikrinta 2026-10-30) | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.14 | Nuorodos į programėlę | Nuoroda iš laiško atidaro programėlę. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.15 | Programėlių parduotuvės | Programėlė pasiekiama programėlių parduotuvėse. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner store accounts (Google Play, Apple, EAS) + ARCH-6 |  (tikrinta 2026-10-30) | E / F (kalbos, mobilus) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.16 | Pastabos apie vertimą | Praneši, kad vertimas neteisingas. — darbuotojas, ieškantis darbo, įmonė, administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40371836163 (tikrinta 2026-10-26) | E / F (kalbos, mobilus) | Nereikia; kartoti tik po susijusio pakeitimo |
| 8.17 | Programėlė Android telefonui | Programėlė Android telefonui. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | not in Google Play (see 8.15) | run 41451882387, run 41014999978, build 84cc2f85 (tikrinta 2026-11-02) | E / F (kalbos, mobilus) | Owner: Google Play account (8.15) |
| 8.18 | Programėlė iPhone | Programėlė iPhone telefonui. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | need submission not tested on iOS (open, owner decision); first attempt can stall on the system Save-Password sheet; not in the App Store (see 8.15) | run 41451829006, run 41015011284, build 84cc2f85 (tikrinta 2026-11-02) | E / F (kalbos, mobilus) | Owner: Apple account (8.15) |
| 9.1 | Administratoriaus skydas | Administratorius valdo platformą. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2761, run 40688059945, build 3f552e0d (tikrinta 2026-10-28) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.2 | Bandymai, rodikliai, lyga | Administratorius seka bandymus ir rodiklius. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-25) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.3 | Naudotojo peržiūra | Administratorius pažiūri vieno naudotojo būseną. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-25) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.4 | Privatumo prašymai | Gali paprašyti savo duomenų ar jų ištrynimo. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-19) | R2 (saugumas) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 9.5 | Duomenų atsisiuntimas | Parsisiunti visus apie save laikomus duomenis. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40199732022, build 38bfb9d93 (tikrinta 2026-11-01) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.6 | Duomenų ištrynimas | Tavo duomenys ištrinami, kai to paprašai. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-19) | R2 (saugumas) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 9.7 | Darbuotojo duomenų skyrimas | Atskiriami žmogaus ir jo įmonės duomenys. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-21) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.8 | Duomenų prieigos taisyklės | Kiekvienas mato tik savo duomenis. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | cleanup candidate backfill snapshot (RED) |  (tikrinta 2026-10-23) | R2 (saugumas) | Coordinator: a read-only catalog run, stated in the private record |
| 9.9 | Veiksmų žurnalas | Svarbūs veiksmai užrašomi. — sistema, administratorius | taip | taip | taip | nenustatyta | taip | ne | ne | TIK CI PATIKRINTA | open security/permission item — details kept out of the public repository (owner rule) | #2883, run 40833394554 (tikrinta 2026-10-30) | R2 (saugumas) | Coordinator: private record |
| 9.10 | Užklausų ribojimas | Apsaugo nuo piktnaudžiavimo. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | in-memory per instance; real-IP depends on VPS cloudflare.inc |  (tikrinta 2026-10-23) | R2 (saugumas) | Coordinator: private record |
| 9.11 | Užklausų kilmės patikra | Apsaugo nuo suklastotų užklausų. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40210854856, build 711745d0 (tikrinta —) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.12 | Teisiniai puslapiai | Perskaitai sąlygas ir privatumo politiką. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40205429467, build 38bfb9d93 (tikrinta 2026-11-01) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.13 | Asmens vietos apsauga | Tavo tikslios vietos kiti nemato. — darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40199732022, build 38bfb9d93 (tikrinta 2026-11-01) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.14 | Naudojimo statistika | Administratorius mato, kaip naudojama platforma. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-25) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.15 | Paieškos būdai | Skirtingos paieškos randa žmones, darbus ir paslaugas. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.16 | Rekomendavimo sąsaja | Išorinė sistema siunčia rekomendacijas. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | R2 (saugumas) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 9.17 | Vidinis pasiūlos srautas | Vidinė sistema gauna pasiūlos duomenis. — sistema | taip | taip | taip | nenustatyta | taip | ne | ne | TIK CI PATIKRINTA | readback 1x/24 h vs 4/day intended |  (tikrinta 2026-10-23) | R2 (saugumas) | Coordinator: settle the intended readback cadence, then a job run |
| 9.18 | Viešos duomenų sąsajos | Kitos svetainės gali gauti viešus duomenis. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41357630136 (tikrinta 2026-11-01) | R2 (saugumas) | Nereikia; kartoti tik po susijusio pakeitimo |
| 9.19 | Importo bandymų erdvė | Administratorius išbando importą. — administratorius | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner: enable flag if wanted |  (tikrinta 2026-10-25) | R2 (saugumas) | None now. Owner schedules it if wanted |
| 9.20 | Stebėjimų tikrintuvas | Administratorius tikrina stebėjimus. — administratorius | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner: enable flag if wanted |  (tikrinta 2026-10-25) | R2 (saugumas) | None now. Owner schedules it if wanted |
| 9.22 | Aplinkos nustatymų patikra | Neleidžia paleisti sistemos su blogais nustatymais. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | open security/permission item — details kept out of the public repository (owner rule) | build 431385cf (tikrinta —) | R2 (saugumas) | Coordinator: private record |
| 9.23 | Duomenų bazės funkcijų kontrolė | Saugo, kad duomenų funkcijos nebūtų per laisvos. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | 3 functions mutable search_path (RED R-2) |  (tikrinta 2026-10-23) | R2 (saugumas) | Coordinator: RED R-2, private record |
| 9.24 | Saugumo incidentų tvarkymas | Reaguojama į saugumo incidentus. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | CSP has no report-uri |  (tikrinta —) | R2 (saugumas) | Coordinator: private record |
| 9.25 | Saugumo perspėjimai | Stebimi saugumo perspėjimai apie kodą. — sistema | taip | taip | taip | ne | nenustatyta | ne | ne | NEVEIKIA | open security/permission item — details kept out of the public repository (owner rule) | #2879, #2880, #2881 (tikrinta 2026-11-01) | R2 (saugumas) | Coordinator: private record |
| 10.1 | Atvira sąsaja dirbtinio intelekto programoms | Programa gali veikti tavo vardu su tavo leidimu. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | tools/list 233 tools on c3df7431d; the row title's 229 predates #2889/#2895 | run 41307643008, build c3df7431d (tikrinta 2026-11-01) | F (AI, MCP) | Pašalinti likusį trūkumą |
| 10.2 | Dirbtinio intelekto scenarijai | Paruošti scenarijai dirbtinio intelekto programoms. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | F (AI, MCP) | Nereikia; kartoti tik po susijusio pakeitimo |
| 10.3 | Prisijungimas dirbtinio intelekto programoms | Programa saugiai gauna tavo leidimą. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | #2454 (the spec) awaits owner merge; a security item is open (details in the private record) | #2454 (atviras), run 41354839810 (tikrinta 2026-11-02) | F (AI, MCP) | Pašalinti likusį trūkumą |
| 10.4 | Dirbtinio intelekto leidimų sritys | Nustatai, ką programa gali daryti. — darbuotojas, įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | auth path = RED; design draft #2923; final set = owner decision X-2 |  (tikrinta 2026-11-02) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.5 | Sąrašai dirbtinio intelekto parduotuvėse | Platforma rodoma dirbtinio intelekto programų sąrašuose. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.6 | Dirbtinio intelekto pagalba | Platforma naudoja dirbtinį intelektą pagalbai. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | AI provider keys (owner) — honest off-state proven, the AI function itself not | #2771, run 40191899327, run 40301607964 (tikrinta 2026-10-26) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.7 | Pokalbio ketinimų atpažinimas | Pokalbyje atpažįstama, ko nori. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.8 | CV sutvarkymas dirbtiniu intelektu | Iš CV dirbtinis intelektas išrenka faktus. — darbuotojas, ieškantis darbo | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.9 | Žurnalo siūlymai | Žurnalo įrašui siūlomi patobulinimai. — darbuotojas | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.10 | Paaiškinimai | Gauni paaiškinimą, kodėl taip pasiūlyta. — darbuotojas, įmonė | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.11 | Pagalbininkai be iškvietimo | Yra pagalbininkai, kurių dar niekas nekviečia. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2765, run 40209522348 (tikrinta —) | F (AI, MCP) | Nereikia; kartoti tik po susijusio pakeitimo |
| 10.13 | Pagalbininko puslapis | Pasikalbi su pagalbininku. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40191899327 (tikrinta 2026-10-25) | F (AI, MCP) | Nereikia; kartoti tik po susijusio pakeitimo |
| 10.14 | Pagalbininkų valdymas | Administratorius valdo pagalbininkus. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-25) | F (AI, MCP) | Nereikia; kartoti tik po susijusio pakeitimo |
| 10.15 | Pagalbininkų vykdymas | Pagalbininkai atlieka darbus patys. — administratorius | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner AGENT-1..4 decisions; ARCHITECTURE_ONLY |  (tikrinta —) | F (AI, MCP) | None now. Owner schedules it if wanted |
| 10.16 | Pagalbininkai kaip dalyviai | Pagalbininkas yra pokalbio dalyvis. — darbuotojas, įmonė | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner AGENT-1..4 decisions |  (tikrinta —) | F (AI, MCP) | None now. Owner schedules it if wanted |
| 10.17 | Išorinių veiksmų kvitai | Gauni kvitą apie išorinį veiksmą. — darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | F (AI, MCP) | Nereikia; kartoti tik po susijusio pakeitimo |
| 10.18 | Skelbimai iš Švedijos | Platforma gauna skelbimus iš Švedijos. — ieškantis darbo, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | F (AI, MCP) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 10.19 | Skelbimai iš Norvegijos | Platforma gauna skelbimus iš Norvegijos. — ieškantis darbo, darbuotojas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | F (AI, MCP) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 10.20 | Senų skelbimų šalinimas | Pasenę skelbimai pašalinami. — ieškantis darbo, darbuotojas | taip | taip | taip | ne | nenustatyta | ne | ne | NEVEIKIA | open security/permission item — details kept out of the public repository (owner rule) |  (tikrinta 2026-10-23) | F (AI, MCP) | Coordinator: private record |
| 10.21 | Statistikos importas | Importuojama oficiali statistika. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | owner: allow scheduled import |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.22 | Partnerio organizacijos sąsaja | Duomenys keičiasi su partnerio organizacija. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.23 | Agentūros pasiūlos srautas | Agentūros pasiūla patenka į platformą. — agentūra | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-24) | F (AI, MCP) | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 10.24 | Savo serverio vertimas | Vertimas veikia mūsų serveryje. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.25 | Debesų dirbtinis intelektas | Papildomas dirbtinio intelekto tiekėjas. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.26 | Programų konkursas | Dalyvavimas dirbtinio intelekto programų konkurse. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | F (AI, MCP) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.27 | Žemėlapiai | Matai vietas žemėlapyje. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41283989921, run 40215640433, build 38bfb9d93 (tikrinta 2026-11-01) | F (AI, MCP) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.1 | Mokymo įstaiga ir besimokantysis | Mokymo įstaiga susieja su savo besimokančiais. — mokymo įstaiga, besimokantis | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-21) | L (mokymasis) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.2 | Programos ir srautai | Mokymo įstaiga kuria programas ir grupes. — mokymo įstaiga | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | #2959, #2977, #2979, #2983, run 41611766407, run 40154033299 (tikrinta 2026-11-03) | L (mokymasis) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.3 | Mokymosi kompasas | Matai, ką mokytis toliau. — besimokantis, darbuotojas, ieškantis darbo | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40154033299 (tikrinta 2026-10-25) | L (mokymasis) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.4 | Praktikos vietos | Įmonė pasiūlo vietų praktikai. — įmonė, mokymo įstaiga, besimokantis | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40154033299 (tikrinta 2026-10-25) | L (mokymasis) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.5 | Besimokančiųjų rezultatai | Matai, kaip sekasi besimokantiems. — mokymo įstaiga, besimokantis | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40154033299 (tikrinta 2026-10-25) | L (mokymasis) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.6 | Mokymo įstaigos ataskaitos | Mokymo įstaiga gauna ataskaitas. — mokymo įstaiga | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40154033299 (tikrinta 2026-10-25) | L (mokymasis) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.7 | Praktika virsta gebėjimu | Atlikta praktika parodo įgytą gebėjimą. — besimokantis, mokymo įstaiga | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41617507405 (tikrinta 2026-11-03) | L (mokymasis) | Nereikia; kartoti tik po susijusio pakeitimo |
| 11.8 | Mokymų ir pažymėjimų sąrašas | Laikai mokymus ir pažymėjimus vienoje vietoje. — besimokantis, darbuotojas, mokymo įstaiga | taip | taip | taip | taip | nenustatyta | ne | ne | NEVEIKIA | engaged non-member workers cannot be assigned training (owner product decision, RED #2816) | #2857, run 40687308231 (tikrinta 2026-10-28) | L (mokymasis) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 11.9 | Mokymosi peržiūra žmogaus akimis | Žmogus peržiūri mokymosi rekomendacijas. — besimokantis, mokymo įstaiga | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | L (mokymasis) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 11.10 | Ankstesnio mokymosi pripažinimas | Pripažįstamas anksčiau įgytas mokymasis. — besimokantis, darbuotojas | taip | ne | ne | ne | ne | ne | ne | NEĮGYVENDINTA | owner, RED schema |  (tikrinta —) | L (mokymasis) | None now. Owner schedules it if wanted |
| 12.1 | Rinkos žemėlapis | Matai, kur yra darbo ir žmonių. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | koordinatorius | Nereikia; kartoti tik po susijusio pakeitimo |
| 12.2 | Darbo rinkos žinios | Skaitai apie darbo rinką. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | copy D-2 |  (tikrinta 2026-10-23) | koordinatorius | Coordinator: Chrome check; copy D-2 stays open |
| 12.3 | Žinių skydas | Žinias matai vienoje vietoje. — darbuotojas, įmonė, vadovas | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 41282258795, run 40182648408, build 38bfb9d93 (tikrinta 2026-11-01) | koordinatorius | Nereikia; kartoti tik po susijusio pakeitimo |
| 12.4 | Poreikio atpažinimas | Atpažįstamas rinkos poreikis. — administratorius, įmonė | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | duration-vs-headcount follow-up #2694 (auto-merge after regression tests); re-check after deploy; crews not representable yet (flagged) | #2690 (tikrinta 2026-10-23) | koordinatorius | Pašalinti likusį trūkumą |
| 12.5 | Viešieji rinkos faktai | Matai viešus rinkos faktus. — ieškantis darbo, darbuotojas, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | koordinatorius | Coordinator: Chrome check against the database figure |
| 12.6 | Administratoriaus rinkos puslapis | Administratorius mato rinkos vaizdą. — administratorius | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-25) | koordinatorius | Nereikia; kartoti tik po susijusio pakeitimo |
| 13.1 | Svetainės talpinimas ir atnaujinimas | Svetainė pasiekiama ir atnaujinama be pertraukų. — sistema | taip | taip | taip | ne | nenustatyta | ne | ne | NEVEIKIA | REGRESIJA. REGRESSION-class infra: GitHub-runner → VPS inbound loss now fails production walks; provider network fault probable, not proven; Hostinger ticket pending owner | #2911, #1226, run 40668817886, run 40678088257 (tikrinta 2026-11-01) | M / koordinatorius | Coordinator: private record |
| 13.2 | Veikimo stebėjimas | Pastebima, kai svetainė neatsako. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta —) | M / koordinatorius | Coordinator: name the monitor's production run |
| 13.3 | Paruoštas patikrinimo paketas | Automatiškai išbandomi pagrindiniai naudotojo žingsniai. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-22) | M / koordinatorius | Nereikia; kartoti tik po susijusio pakeitimo |
| 13.4 | Duomenų bazės talpa | Pasirūpinama, kad duomenys tilptų. — sistema | taip | taip | taip | nenustatyta | taip | ne | ne | TIK CI PATIKRINTA | Nėra produkcijos įrodymo |  (tikrinta 2026-10-25) | M / koordinatorius | Coordinator: read the plan and capacity, name the date |
| 13.5 | Atsarginės kopijos | Tavo duomenys turi atsarginę kopiją. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | Per part, 2026-11-05. PASS: start after Quality Gates on main, guard skip (41834401403, #3067); a backup started by a merge (41981561592); freshness job fresh path (41834401352); full backup + restore drill + shipping + stored grants (41824425911); grants proof and mismatch stop (41822877894, 41819279617); the failure issue closing (#3058). NOT VERIFIED: a backup started by the schedule (first slot since #3051 fired 2026-11-04 18:45 UTC, at least 3 h late, and the guard skipped it as it should, 41890262254; the 2026-11-05 00:28 UTC slot skipped too, 12 h after the last backup, 41941621226; measured over 7 days, frequent workflows lost 83-98% of slots and daily ones started 6-8 h late); the 26 h freshness job's stale path; the failure issue opening from a run on main; decrypting a stored file (last done 2026-11-03 on the VPS with its key; the check of today's file was refused to the agent session); the owner's offline key decrypting (never shown); a restore into a real Supabase project. VPS watchdog: NOT INSTALLED, on hold by the owner's order of 2026-11-05 (no root install; the 2026-11-04 approval no longer stands). A non-root variant is prepared for review only in draft #3104; installing it needs a separate owner approval. The owner approved an admin alert address; that it receives mail is not yet shown. Retention from the receiver, 2026-11-04: 4 dumps and 3 file bundles kept, 14-day rotation, 20,809 MB free, 366 MB a pair. No automatic off-site copy; a Backblaze plan is private and not activated (owner decision). Manual: encrypted files of 2026-11-03 on the owner's PC; Supabase managed backups (list not read). | #3058, #3061, #3005, run 41981561592, run 41982931958, run 41824425911, build af97d1b54 (tikrinta 2026-11-05) | M / koordinatorius | Pašalinti likusį trūkumą |
| 13.6 | Reguliarūs foniniai darbai | Reguliariai atliekami foniniai darbai. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | 1 erasure notice queued (no SMTP) |  (tikrinta 2026-10-23) | M / koordinatorius | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 13.7 | Duomenų bazės pakeitimų patikra | Prieš keičiant duomenų bazę tikrinama, ar saugu. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta 2026-10-23) | M / koordinatorius | Coordinator: name a production parity run |
| 13.8 | Pakeitimų žurnalo suderinimas | Pakeitimų žurnalas atitinka tikrą būseną. — sistema | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | record/merge #2410 | #2410 (tikrinta 2026-10-23) | M / koordinatorius | Coordinator: name a production parity run |
| 13.9 | Ryšys su kodo saugykla | Duomenų bazė susieta su kodo saugykla. — sistema | taip | nenustatyta | nenustatyta | nenustatyta | nenustatyta | ne | ne | BLOKUOTA | Nėra produkcijos įrodymo |  (tikrinta —) | M / koordinatorius | Coordinator: private record |
| 13.10 | Kokybės vartai | Prieš paskelbiant keitimą, jis tikrinamas. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | run 40175733431 (tikrinta 2026-10-25) | M / koordinatorius | None: CI by nature; DEL-2 tracks its stability |
| 13.11 | Automatinė naudotojo kelio patikra | Automatiškai išbandomi pagrindiniai žingsniai. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — | build 431385cf (tikrinta —) | M / koordinatorius | None: CI by nature |
| 13.12 | Produkto taisyklių patikra | Automatiškai tikrinama, ar laikomasi produkto taisyklių. — sistema | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta —) | M / koordinatorius | None: CI by nature |
| 13.13 | Funkcijų prieinamumo sąrašas | Aišku, kurios funkcijos jau paruoštos. — administratorius, sistema | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | Nėra produkcijos įrodymo |  (tikrinta 2026-11-01) | M / koordinatorius | Coordinator: Chrome check of the catalogue's surfaces |
| 13.14 | Išimčių valdymas | Savininkas leidžia išimtis kokybės vartams. — administratorius | taip | taip | taip | taip | taip | taip | dalinai | VEIKIA PRODUKCIJOJE | live parity gate skipped: CI role lacks USAGE on supabase_migrations (owner GOV-1) |  (tikrinta —) | M / koordinatorius | Coordinator: restore the live parity read for CI |
| 13.15 | Senų naršyklių palaikymas | Svetainė atsidaro ir senesnėje naršyklėje. — darbuotojas, ieškantis darbo, įmonė | taip | taip | taip | taip | taip | taip | taip | VEIKIA PRODUKCIJOJE | — |  (tikrinta —) | M / koordinatorius | Coordinator: a Chrome check on an old-browser profile |
| 13.16 | Naršyklės klaidų pranešimai | Sužinoma, kai tavo naršyklėje įvyko klaida. — sistema | taip | taip | taip | nenustatyta | nenustatyta | ne | ne | TIK KODE | Nėra produkcijos įrodymo |  (tikrinta —) | M / koordinatorius | Coordinator: find primary evidence or mark not built |
| 13.17 | Aplinkos suderinimas po perkėlimo | Po serverio keitimo viskas sulyginama. — sistema | taip | taip | taip | ne | nenustatyta | ne | ne | NEVEIKIA | OWNER+LEGAL: AI off coincides with owner 10-15 Gemini personal-data restriction (needs billed key + AI_GEMINI_PAID_TIER_CONFIRMED=1 / DPA). SMTP: LM_SMTP_PASS + INVITE_EMAIL_PROVIDER=smtp via lm-env-set.sh |  (tikrinta 2026-10-27) | M / koordinatorius | Owner: the decision in the Reason column. Then the coordinator applies or walks |


<!-- status-evidence-json
{"schema":1,"walks":{"profile-cv-history|phone":{"spec":"profile-cv-history","device":"phone","run":43705887379,"result":"success","build":"f862c524","at":"2026-11-15T10:58:55Z"},"profile-cv-history|phone-375":{"spec":"profile-cv-history","device":"phone-375","run":43713174624,"result":"success","build":"1fcff8a6","at":"2026-11-15T12:33:48Z"},"company-chain|phone":{"spec":"company-chain","device":"phone","run":43720771951,"result":"success","build":"1fcff8a6","at":"2026-11-15T13:51:55Z"},"company-chain|phone-375":{"spec":"company-chain","device":"phone-375","run":43722041470,"result":"success","build":"1fcff8a6","at":"2026-11-15T14:06:57Z"},"agency-chain|phone":{"spec":"agency-chain","device":"phone","run":43723431255,"result":"success","build":"1fcff8a6","at":"2026-11-15T14:19:40Z"},"agency-chain|phone-375":{"spec":"agency-chain","device":"phone-375","run":43743349514,"result":"success","build":"d225f58a","at":"2026-11-15T17:55:58Z"},"learning-practice|phone":{"spec":"learning-practice","device":"phone","run":43725773540,"result":"success","build":"1fcff8a6","at":"2026-11-15T14:46:04Z"},"learning-practice|phone-375":{"spec":"learning-practice","device":"phone-375","run":43726964928,"result":"success","build":"1fcff8a6","at":"2026-11-15T14:59:11Z"}}}
-->
