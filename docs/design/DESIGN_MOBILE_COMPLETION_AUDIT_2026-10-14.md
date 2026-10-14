# Dizaino ir programėlių užbaigimo auditas — 2026-10-14

Statusas: **auditas + evoliucijos planas** pagal savininko direktyvą „Dizaino ir programėlių užbaigimo direktyva" (2026-10-14). Tai NE nauja dizaino sistema: planas tęsia esamą liniją. Autoritetų tvarka nekeičiama: `final/00-FROZEN-DESIGN-CONTRACT.md` → `final/00-GALUTINE-DIZAINO-SISTEMA.md` → savininko 2026-10-05 užšaldyta dizaino klasė → savininko 2026-10-09/10 santūrumo direktyvos (#2233, #2249) → šis dokumentas.

## 1. Kas peržiūrėta (ir kas ne)

| Šaltinis | Būsena |
|---|---|
| Gamybos tokenai, `components/ui`, `components/app/premium`, `work-world/primitives`, 10 prioritetinių ekranų kodas | peržiūrėta |
| Užšaldyta dizaino klasė `4e695e261` (šaka `feat/cc/visual-language-proof`, tip `23192832c`, 27 komitai, iš jų 18 — realių duomenų perkėlimas po užšaldymo) | peržiūrėta (git), **į main neperkelta** |
| Dizaino PR nuo 09-22: sujungti #2228 #2232 #2233 #2234 #2237 #2238 #2242 #2245 #2248 #2249 #2250 #2255; uždaryti #2156 (pakeistas 4e695e261), #2092; atviri seni #2110, #2125 | peržiūrėta |
| `docs/design/*` (frozen contract, galutinė sistema A–Y, 01–04, visual-contract, premium-design-map, next-slices, DESIGN_BASELINE) | peržiūrėta |
| `design-lab/`, `design-sprint/` (tik pagrindiniame checkout, untracked) | turinys inventorizuotas; LabourMarket koncepcijos „laukia savininko peržiūros" |
| Mobilioji: `apps/mobile` (Expo/RN), `packages/client-core`, PWA, `.well-known`, `docs/mobile/*` | peržiūrėta |
| Gamybos ekranai: viešas puslapis 1280 / 375 (2026-10-14) | užfiksuota |
| **NEPASIEKIAMA iš repo:** savininko vaizdo įrašai ir paveikslai `Downloads/` (10-04 `*.webm` sekos, 09-30 desktop/mobile vaizdo įrašai, 10-09 penki `.jpg`, logotipo specifikacijos PDF, „Labourmarket.ai oficial start.png") | **NEPERŽIŪRĖTA** — reikia savininko patvirtinimo, kurie iš jų yra galiojanti medžiaga |
| Prisijungę ekranai gamyboje (darbuotojo, darbdavio) | ne šiame etape — QA sesijos tik per `prod-qa-walk.yml` (be ekrano nuotraukų, viešas repo) |

## 2. Pagrindinė išvada

Dizaino klasė **jau sukurta ir savininko užšaldyta** (2026-10-05). Gamyboje iš jos yra tik gramatika (#2228 `premium/grammar.tsx`), Living CV (#2228/#2245) ir vienas `PageTitle` (#2232). Kas NĖRA gamyboje, bet egzistuoja šakoje su realiais skaitytuvais:
keturių būsenų darbo namai (Laukia tavęs / Vyksta dabar / Dėl to, kas įvyko / Už tavo sienų), tapatybės šeima (plokštelės be nuotraukų), komandos formavimas, projekto ekranas, projekto pokalbis, atskirai sukomponuotas mobilusis vaizdas, UNKNOWN būsenos skaitytuvai (`*Result`).

Po 10-05 savininkas pridėjo santūrumo taisykles: jokių spalvotų kursyvų (`Accented` rodo paprastą tekstą), vienas auksinis veiksmas ekrane, struktūra svarbiau už spalvą. Todėl perkėlimas = **pakartotinis perkėlimas (re-port) per esamus skaitytuvus**, ne rebase (17 konfliktų, 5 trūkstamos lokalės), suderintas su santūrumo taisyklėmis.

## 3. IŠSAUGOTI / PATOBULINTI / PERKURTI / PAŠALINTI DUBLIAVIMĄ

### IŠSAUGOTI
- Tokenų grandinė `tokens/*.ts → tailwind-preset → globals.css` (obsidian/ivory/auksas, AA abiejose temose), tipografija (Bricolage display, Inter, JetBrains Mono skaičiams), radius/z/motion skalės ir jų guard'ai.
- `ui/Button`, `ui/Card`, `ui/Input/Label/Select/DarkListbox`, `ui/InlineConfirm`, `premium/page-title`, `premium/grammar`, `work-world/primitives` (EvidenceState, WorkSpine…), `player-card/identity-stage`.
- Spalvų semantika: žalia = patvirtino antra šalis; auksas = prekės ženklas/veiksmas/laukiama, niekada patvirtinimas; būsena = žodis + forma.
- Living CV (#2228/#2245), darbo žurnalo mėnesio tinklelis (floor), `BottomNav`, `ConversationHeader` kaip vienintelė prisijungusio produkto juosta, pokalbis kaip namai (sprendimas 0017).
- Mobilioji architektūra: Expo/RN + `packages/client-core` + `/api/mcp` (žr. §6).

### PATOBULINTI
- Viešas puslapis: po stipraus hero — vienodų tamsių dėžučių juosta, smulkus mažo kontrasto tekstas, dvi pasikartojančios „žingsnių" juostos (`two-sides-lifecycle` ir „Darbas tampa įrodymu"); telefone hero nuotrauka atsiranda tik po ~3–6 s, visi 6 hero kadrai kraunami iš karto; ~50 px tuščia juosta po antrašte. Puslapis 4 860 px (desktop) / 8 545 px (375).
- Darbo žurnalas (2 329 eil. vienas puslapis), galimybės (2 229 eil.), CV puslapis (1 422 eil.) — per ilgi, per daug lygiaverčių blokų.
- Projektų sąrašas/detalė — sulankstomų sekcijų krūva be aiškaus vieno veiksmo.

### PERKURTI KONKRETŲ KOMPONENTĄ
- Darbuotojo namų atidarymo kontekstas `today/today-*-section.tsx` → užšaldytos klasės keturių regionų namai (`home-regions`, `lib/home/home-state.ts`, šakos komitas `487d3b5b9`), per realius skaitytuvus.
- Tapatybė: `identity/person-identity-card` + `person-portrait` + `player-card` variantai → viena tapatybės šeima (plokštelė, kuri pilna ir be nuotraukos).
- Projekto ekranas ir projekto pokalbis → užšaldytos klasės `project-screen` / `conversation` gramatika ant esamų projekto skaitytuvų.
- Komandos formavimas (brigados) → užšaldyta `team-formation` gramatika.

### PAŠALINTI DUBLIAVIMĄ
| Sąvoka | Dabar | Tikslas |
|---|---|---|
| Kortelė | `ui/Card` (62 failai) + `card-border` (~168) + ad-hoc `rounded bg-surface` (~70) + `.wow-card` | `ui/Card`; ratchet mažinti |
| Būsenos žymė | `ui/Badge` (1 naudotojas), `app/status-chip` (0), ~15 vietinių kopijų | viena `StatusChip` (5 variantai, žodis+forma) |
| Skaičiaus plytelė | 9 vietinės `Stat/Figure/MetricTile/Counter/Metric` | viena `Stat` primityve |
| Tuščia būsena | `app/empty-state` + 4 vietinės | `app/empty-state` |
| Kalendorius | žurnalo mėnuo, planavimo savaitė/diena, `historical-calendar` (743 eil.), `week-strip` | žurnalo mėnuo + `WorkWeek/WorkDay`; kiti — ant jų |
| Rezultato apvalkalas | `ui/ResultShell` (0) vs `workspace/*-result` | `workspace/*-result` |
| Nenaudojami primityvai | `ui/Placeholder`, `app/dashboard-section`, `app/preview-chip` | pašalinti (guard pin'ai atnaujinami) |

## 4. Evoliucijos planas (eilė)

| # | Paketas | Pagrindas | Rizika / koordinacija |
|---|---|---|---|
| D0 | Bendri primityvai: `StatusChip`, `Stat`, `EmptyState` sujungti; nenaudojami pašalinti; ekranų nuotraukų bazė (390/1280) prisijungusiems ekranams | auditas §3 | `components/ui` laisvas (jokio atviro PR) |
| D1 | Darbuotojo namai: keturi regionai per realius skaitytuvus | `487d3b5b9`, `lib/home/*` | `today/*` liečia seni #2110/#2125 — juos uždaryti kaip pakeistus arba sujungti |
| D2 | Tapatybės šeima | `identity-family.tsx`, `ea0e77f13`, `30ccdfe94` | |
| D3 | Darbo žurnalas: vienas pagrindinis veiksmas, trumpesnė struktūra, telefonas pirmiausia | žurnalo floor (#1727/#1954/#1957/#1975) | |
| D4 | Projektai ir istorija; projekto pokalbis | `project-screen`, `conversation` | istorijos juosta aktyvi (#2362) — po jos |
| D5 | Įmonės darbo erdvė | `CompanyHomeFieldSection`, #2249 | `company/page.tsx` aktyviai keičiamas |
| D6 | Viešas puslapis: viena „žingsnių" kalba, skaitomumas, mobilusis hero | landing freeze (savininko išimtis reikalinga) | **savininko leidimas**: landing failai užšaldyti hash'u |
| D7 | Prekyvietė/galimybės, kalendorius, registracija ir vaidmens keitimas | — | |

Kiekvienam: A dabartinė būsena (ekrano nuotraukos 390/1280) → B tikslinė → C įgyvendinimas per esamus skaitytuvus → D palyginimas (prieš/po) PR'e → E veiksmų, navigacijos, duomenų, LT/EN/RU, teisių patikra ir produkcijos walk.

## 5. Kokybės apsauga
- Kiekvienas paketas — atskiras PR; grįžimas = revert vieno PR.
- Neleidžiama: nauja dizaino sistema, antri primityvai, fiksuoti/dekoratyvūs skaičiai, spalva kaip vienintelis būsenos ženklas, vizualinis pakeitimas, keičiantis AI/MCP sutartį (`/api/mcp` įrankiai, pokalbio veiksmai).
- Esami guard'ai lieka teisėjai (design-tokens, visual-contract, premium-design-pass, visual-system-black-gold, landing-freeze, product-vocabulary taisyklės).

## 6. Mobiliosios programėlės — inventorius

| Elementas | Būsena | Įrodymas |
|---|---|---|
| PWA manifestas, ikonos, įdiegimas | VEIKIA | `app/manifest.ts`, `pwa-*` guard'ai |
| Service worker / offline | NĖRA (sąmoningai) | `pwa-baseline.test.ts` draudžia, kol savininkas nepatvirtins talpinimo politikos |
| Mobilioji svetainė (apatinė navigacija, 390 px specs) | VEIKIA | `bottom-nav.tsx`, `prod-mobile-surfaces` |
| Android (Expo prebuild) | NEUŽBAIGTA | `apps/mobile/app.json`, `eas.json`; debug build įrodytas 08-30; nėra testuojamo APK, parašo, Play |
| iOS (Expo) | NEUŽBAIGTA | `ios.yml`: simuliatoriaus build + Maestro žalias; nėra įrenginio build, parašo, TestFlight |
| Bendra logika | VEIKIA | `packages/client-core`; duomenys tik per `/api/mcp` |
| Autentifikacija programėlėje | REIKIA PATOBULINTI | tik el. paštas + slaptažodis (savininko sprendimas); App/Universal Links kodas yra, laukia `ANDROID_CERT_FINGERPRINTS`, `APPLE_TEAM_ID` |
| Pranešimai: web in-app | VEIKIA | `notification_events` + `notification-panel` |
| Pranešimai: push (web/native) | NĖRA | sąmoningai uždrausta guard'ais |
| Kamera / failai | REIKIA PATOBULINTI (web), NĖRA (native) | web `<input type=file>` be `capture`; native — sąmoningai be kameros |
| Žurnalas mobiliajame | greitas įrašas VEIKIA; balsas NEUŽBAIGTA; offline juodraščiai NĖRA | `log-work.tsx`; `VOICE_FIRST = NOT_GREEN` |
| Sinchronizacija / silpnas ryšys | NĖRA (sąžiningas klaidos + „bandyti dar" ekranas) | `capability-failure.tsx` |
| Parduotuvių konfigūracija | NEUŽBAIGTA | trūksta ikonų/splash, parašo, EAS projekto, store CI |

**Kelias (tęsti esamą, ne naują):** Expo lieka abiem platformoms; Capacitor/TWA nepridedami.
1. M1 — Android testuojamas leidimas: CI darbas, kuris daro `expo prebuild` + `assembleRelease` (preview parašas) ir paskelbia APK kaip artefaktą + emuliatoriaus Maestro kelionė (kaip `ios.yml`).
2. M2 — programėlės ikonos/splash iš `public/app-icon.svg` (savininko ikonos patvirtinimas).
3. M3 — iOS: įrenginio build ir TestFlight — **reikia savininko**: Apple Developer paskyra, Team ID.
4. M4 — Play Internal Testing — **reikia savininko**: Play Console paskyra, upload raktas.
5. Vėliau, tik savininkui nusprendus: push, native kamera, offline žurnalo eilė, Google prisijungimas programėlėje.

## 7. Savininko sprendimai, reikalingi tęsti
1. Ar `Downloads/` medžiaga (10-04 vaizdo įrašai, 10-09 paveikslai, logotipo specifikacija) yra galiojanti dizaino medžiaga? Jei taip — perkelti į repo (`docs/owner-input/`), kad agentai ją matytų.
2. Seni atviri dizaino PR #2110 ir #2125 — uždaryti kaip pakeistus šio plano (rekomenduojama), nes liečia tuos pačius ~60 komponentų.
3. Viešas puslapis užšaldytas hash'u: leidimas keisti D6 apimtyje.
4. Apple Developer / Play Console paskyros ir parašo raktai (M3, M4).
