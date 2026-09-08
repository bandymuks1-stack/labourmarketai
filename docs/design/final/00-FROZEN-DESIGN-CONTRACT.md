# LABOURMARKET.AI — FROZEN DESIGN CONTRACT (implementation design contract)
Data: 2026-09-05. Statusas: **UŽŠALDYTA.** Draft 2 kryptis patvirtinta savininko; čia — tik faktiniai/valdymo pataisymai. Draft 3 nėra. Nekoduota. Vykdytojui neperduota — kontraktą MASTER orkestratoriui perduoda savininkas.

Autoritetų tvarka: `OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04` (§1, §1a, §1b) → `WORLD_STATE_UX_ARCHITECTURE_V1` → `PLATFORM_DOCTRINE` (saugumas/teisė) → **šis kontraktas** → `00-GALUTINE-DIZAINO-SISTEMA.md` (A–Y) → vizualinis rinkinys `01–27` + `A1–A4`. Esant neatitikimui, galioja aukštesnis.

Faktinė būsena kontrakto užšaldymo metu (nespėliota): `main` = `e7964b8` (#1517); gamyba serviruoja `fc579348` (#1511); `main` yra 6 squash'ais priekyje (#1512 Gemini proposer, #1513 confirmation, #1515, #1516, #1517 — visi PENDING_PROD_PROOF pagal RESUME_CHECKPOINT_2026-09-04).

---

## 1. Pataisymai, pritaikyti Draft 2

1.1 **Aštuoni lęšiai**, ne septyni: Conversation · World · Field · Context · Attention · Marketplace · My Space · Time. `27-architecture.png` pergeneruotas; dokumentas B pataisytas.

1.2 **LLM proposer — faktinė būsena, ne dizaino sprendimas.** Runtime (`lib/ai/runtime`, Gemini adapteris, modelis `gemini-3.5-flash-lite`, `AI_PROVIDER_MODE=live`) — **PRESENT, LIVE gamyboje** (checkpoint'o savininko patikra 2026-09-05, mokamos `ai_runs` eilutės). Pokalbio proposer'is — **PARTIAL**: savininko architektūrinis patvirtinimas įrašytas, `data-egress.ts` grant'as `propose_conversation_intent` kode, #1512 merged 05:37 UTC, **PENDING_PROD_PROOF** (`walk-gemini-proposer-prod.cjs`, laukia deploy'aus). Deterministinis router'is lieka grindys. Dizainas veikia abiem atvejais; iš savininko sprendimų sąrašo išbraukta.

1.3 **Billing — patvirtintas komercinis kontraktas:** PERSON €0 · ORGANIZATION FREE = 1 aktyvus poreikis/pozicija vienu metu · ORGANIZATION €99/mėn. = iki 10 · >10 = „Susisiekite" / individualus planas. Kodo būsena: `lib/billing/plans.ts` vis dar pre-payment lentelė (`free_worker`, `worker_plus`, `company_pilot` 5 poreikiai, `agency_pilot` 25, `admin_internal`); Stripe test režimas; `no-live-payments` guard blokuoja live raktus. Suderinimas su kontraktu ir Stripe LIVE užbaigimas — **įgyvendinimo juosta** (paketas P9), ne dizaino sprendimas. Gamybos env būsena nespėliojama.

1.4 **„Paketas = PR" pašalinta.** Paketas = **įgyvendinimo vienetas / dizaino kontraktas**. Kelionių grupavimą, šakų/worktree nuosavybę ir PR ribas sprendžia MASTER orkestratorius. Optimizuojama pilnoms sujungtoms kelionėms, ne PR skaičiui.

1.5 **Jokio destruktyvaus esamų paviršių keitimo.** `/dashboard/projects/[id]/operations` ir panašūs paviršiai lieka; Laukas tampa pagrindine patirtimi tik kai kanoninė funkcija, pasiekiamumas, priklausomi srautai ir gamybos elgsena išsaugoti ir įrodyti. Jokio trynimo/redirect'o vien dizainui atkurti. Dokumento W ir P4 punktai atitinkamai pakeisti.

1.6 **Marketplace paleidimo aprėptis.** P0/P1: žmonės/komandos/darbo jėga (kur kanoniška); mokymai/sertifikatai/pasiruošimo sprendimai; realios esamos paslaugos, uždarančios tikrą spragą. Būstas, transportas, įranga/įrankiai, platesni resursai — **TARGET**, suderinami, lieka objektų kalboje (`14`, `15`, `16` rodo juos kaip ilgalaikę kalbą), į paleidimą įtraukiami tik orkestratoriui įrodžius, kad kanoniniai duomenys, leidimai ir veiksmų keliai jau egzistuoja ir nevėlina.

1.7 **Prognozės / privatumo taisyklė.** Žmogui rodoma naudinga, paaiškinama asmeninė prognozė: ko trūksta, ką ugdo, kurios galimybės taps pasiekiamos įvykdžius reikalavimą (`06` „Tampu", `18` „Po praktikos"). Organizacijos vidinės darbo jėgos rizikos, pakeitimo/perkėlimo ir kitos jautrios organizacinės prognozės (`09` „Jei nieko nedarysim", `12` rizikos stulpelis) — **tik organizacijos kontekste**, darbuotojui neatskleidžiamos automatiškai. FAKTAS / IŠVESTA / PROGNOZĖ visada vizualiai skirtingi ir su kilme.

1.8 **Numeracija.** Nuoroda „30 (CSV yra)" pakeista į „22 (ataskaita/CSV — PRESENT)". Rinkinys lieka 01–27 + A1–A4; papildomų nuorodų nepridėta.

1.9 **Laikas — tik su įrodymais.** Istorija, išvesta ir prognozė rodomos tik ten, kur yra kanoniniai įrodymai (žurnalas, patvirtinimai, priskyrimai, dokumentai). Istorijos ar prognozių duomenys niekada nefabrikuojami; nesant duomenų — tuščia būsena su veiksmu.

1.10 **Mastelis.** World/Field statiniai mockup'ai nėra mastelio įrodymas. Prototipo/apkrovos/elgsenos validacija pažymėta §7 kaip privaloma prieš PUBLIC COMMERCIAL V1.

---

## 2. Patvirtinti sprendimai (nekeičiami be naujo savininko teksto)

| # | Sprendimas |
|---|---|
| 2.1 | Conversation = pagal poreikį iškviečiamas pirmos klasės valdymo paviršius, ne nuolatinis dominuojantis stulpelis |
| 2.2 | Erdvinis modelis: WORLD → FIELD → CONTEXT/OBJECT |
| 2.3 | Mobile V1 prototipas: ŠIANDIEN · PASAULIS · PAKLAUSK; Field/Context — kontekstiniai; tikslūs skirtukų pavadinimai — hipotezė, ne negrįžtama architektūra |
| 2.4 | Player: K1 „Pasas su kraštu" šeima (compact / standard / expanded / project / opportunity / team / mobile) |
| 2.5 | Field: F1 laikas/zonos operacinis laukas — pagrindinis; F2 tik kur yra reali geometrija |
| 2.6 | Company: C1 projektai laike × pajėgumas |
| 2.7 | Marketplace: M1 sprendimas prie poreikio/spragos |
| 2.8 | Landing: ta pati premium produkto šeima — ne mechaniškai „viskas tamsu" |
| 2.9 | Kilmė: medžiaga (kraštas/tekstūra/kontūras) + aiškus semantinis/tekstinis ekvivalentas |
| 2.10 | Pasiruošimas: kontekstinė reikalavimų knyga |
| 2.11 | Laikas: rodomos tik kanoniniais įrodymais paremtos būsenos |
| 2.12 | Tiesioginė manipuliacija: tik autorizuoti kanoniniai veiksmai su įrašu ir readback |
| 2.13 | Prognozės/privatumas: §1.7 |
| 2.14 | Marketplace aprėptis: §1.6 |

---

## 3. Nekintantys apribojimai (perkelti iš Draft 2 be pakeitimų)

1M+ taisyklės (T): jokių pilnų sąrašų, visų-naudotojų pasirinkimų, klientinės filtracijos, >60 objektų ekrane, begalinių juostų, dashboard'ų; visada intent + kontekstas → ribotas rezultatas, „kodėl šie / kiek atmesta", semantinis mastelis, viewport, serverinė paieška po composer'iu ir sluoksniais; filtrų juosta kaip pagrindinė patirtis — draudžiama.
Prieinamumas (S): klaviatūra visai scenai; Field/World sąrašo ekvivalentai; būsena niekada tik spalva; AA abiejose temose; ≥44 px web / ≥56 px objekte; 200 % tekstas be overflow; fokusas visur; screen reader objektas = vardas · būsena · kilmė · kitas veiksmas; žemėlapio alternatyva — skaičius + sąrašas.
Doktrina (A 1–10), objektų kalba (C), web (D), mobile (E), judesys (R), scorecard 1–29 (X) — galioja be pakeitimų.

---

## 4. Paketo formatas (privalomas kiekvienam)

PACKAGE · USER JOURNEY · P0/P1/P2 · EXISTING CANONICAL READS · EXISTING CANONICAL ACTIONS · PRESENT/PARTIAL/TARGET · WRITE DOMAIN · DEPENDENCIES · SAFE PARALLELIZATION · DO-NOT-DUPLICATE BOUNDARY · ACCEPTANCE CRITERIA · PRODUCTION PROOF.

Rašymo domenų žodynas (vienas rašymo savininkas per domeną vienu metu): `CONV` (`lib/conversation/*`, `components/app/conversation/*`) · `PUBLIC` (`app/[locale]/(marketing)/*`, `lib/auth/redirect.ts`) · `OBJ-UI` (bendri objektų komponentai `components/visual/*`, `tokens/*`) · `READINESS` (`lib/player-card/*`, `lib/documents/*`, readiness/gap modelis) · `PROJECT` (`lib/projects/*`, `lib/company/project-context-actions.ts`, `project_*` migracijos) · `SHELL` (`app/[locale]/dashboard/layout.tsx`, top bar, panelės) · `IDENTITY` (`lib/trust/*`, `journal_entry_confirmations`, provenance) · `MOBILE` (mobile shell, PWA, `/dashboard/journal/*`) · `WORLD` (`lib/market-map/*`, spatial) · `TEAM` (`team_*`) · `EDU` (`education_*`, `lib/conversation/education-*`) · `BILLING` (`lib/billing/*`, Stripe) · `MKT` (`marketplace_listings`, `service_offerings`, `training_*`) · `MYSPACE` (`workspace_pins`).

---

## 5. Paketai

### P1 · Viešas įėjimas su tikru intent'u
USER JOURNEY: A (viešas darbdavys / darbuotojas) — sakinys → supratimas → auth → išsaugotas poreikis → pirmas veiksmas. Vizualas `01`.
PRIORITETAS: **P0 (SAFE PILOT)** — dabartinis hero atsako suvaidintu scenarijumi (audito FUN-1).
READS: `routeIntent()` (pure), public skaičiai (`count_public_vacancies_v1`, employer count). ACTIONS: nėra rašymo; `next` per `lib/auth/redirect.ts`; po login — pirmas chat pranešimas per esamą dispatch.
STATUS: TARGET (UI), router PRESENT. WRITE DOMAIN: `PUBLIC` (+ vienas read-only hook `CONV`). DEPENDENCIES: nėra. PARALLEL: **TAIP**.
DO-NOT-DUPLICATE: neatkurti antro intent'ų sąrašo; nekopijuoti chat komponento į landing.
ACCEPTANCE: 3 skirtingi sakiniai → 3 skirtingi atpažinimai; neatpažintas → klausimas su 2 chip'ais; po signup pokalbis prasideda sakiniu; jokio scenarijaus/„iliustracinių"; skaičiai iš DB arba blokas nerodomas; `check:public-seo-indexing` žalias.
PROD PROOF: prod walk 3 sakiniais + `pilot_events` `landing_intent` eilutė; ekrano kopija be „iliustracinis".

### P2 · Objektų kalba ir atsakymo forma
USER JOURNEY: visos (B, C, H) — kiekvienas chat rezultatas ir kiekvienas sąrašas kalba ta pačia objektų kalba. Vizualas `04` (compact/standard), `05` juosta, `11` Resolution, `21` medžiaga.
PRIORITETAS: **P0 (SAFE PILOT)**.
READS: esami chat rezultatų modeliai (`find-work`, `worker-projects`, `capacity`, `documents-gap`, `client-offers`). ACTIONS: nėra naujų — tie patys chip'ai/veiksmai.
STATUS: PARTIAL (yra `components/visual/job-demand-card.tsx`, player card; nėra kilmės krašto, kontekstinės juostos, Resolution, Demand lizdo, laiko medžiagos). WRITE DOMAIN: `OBJ-UI` (+ `CONV` render vietos). DEPENDENCIES: nėra. PARALLEL: **TAIP** su P1, P3 (P3 tiekia knygos modelį; kol jo nėra, juosta rodo esamus `documents-gap`/`skill-gap`).
DO-NOT-DUPLICATE: vienas `Person` komponentas visoms vietoms; `Resolution`, `Demand`, `Document` — po vieną; jokių lokalių kopijų chat'e.
ACCEPTANCE: V1–V10; kilmės kraštas + tekstinis ekvivalentas; nėra 10–11 px; nėra balų/žvaigždučių; snapshot tas pats asmuo chat/Context/sąraše.
PROD PROOF: esami walk skriptai su ekrano kopijomis pagal scorecard X.

### P3 · Kontekstinė pasiruošimo knyga + spraga → sprendimas
USER JOURNEY: B (darbuotojas), N (readiness), G (marketplace P0 aprėptis). Vizualas `05`, `11`, `15` (tik P0 aprėptis).
PRIORITETAS: **P0 (SAFE PILOT)** — „spraga niekada nėra pabaiga".
READS: `documents-gap`, `skill-gap`, `readiness-status`, projekto/galimybės reikalavimai (`customer_requests`, projekto laukai), `training_programs`, `service_offerings`, `marketplace_listings` (tik P0 kategorijos). ACTIONS: esami — `express-interest`, dokumento įkėlimas, `training_assignments`, `service_offering_requests`.
STATUS: PARTIAL (spraga PRESENT; kontekstinė knyga ir „kas gali padėti" jungtis — TARGET). WRITE DOMAIN: `READINESS` (+ read-only `MKT`). DEPENDENCIES: P2 (juostos komponentas). PARALLEL: **TAIP** su P1, P4, P6 (skirtingi domenai).
DO-NOT-DUPLICATE: viena reikalavimų knyga naudojama Player, Context, Field lizdui ir Attention; nekurti antro readiness modelio šalia `lib/player-card/readiness.ts` — jį išplėsti kontekstu.
ACCEPTANCE: tas pats asmuo → 3 kontekstai → 3 skirtingos knygos; kiekviena „trūksta" eilutė turi ≥1 sprendimą arba sąžiningą „sprendimų dar nėra" su veiksmu „paprašyti"; po sprendimo — perskaičiavimas ir readback.
PROD PROOF: walk: E2E darbuotojas, spraga → sprendimas → dokumentas → 3/5→4/5 readback DB.

### P4 · Laukas (Field) — vizualus operacinis rodinys
USER JOURNEY: C, E (darbdavys be chat), H. Vizualas `08`, `09`, `10`.
PRIORITETAS: **P1 (PUBLIC COMMERCIAL V1)**; SAFE PILOT gali vykti sakiniu + esamu `/operations`.
READS: `project_stages`, `work_tasks`, `project_worker_assignments`, `capacity`, `project-risk`. ACTIONS: esami — `assign-worker`/`end-assignment`, `project-move` (what-if + confirm), `stage-status`, `task-status`, `create-project`.
STATUS: TARGET (UI); veiksmai PRESENT. WRITE DOMAIN: `PROJECT` (UI sluoksnis), be naujų migracijų. DEPENDENCIES: P2. PARALLEL: **TAIP** su P3, P5-shell (jei shell tiekia tik konteinerį), P6.
DO-NOT-DUPLICATE: Laukas naudoja tuos pačius executor'ius kaip chat; `/operations` **lieka** ir veikia lygiagrečiai, kol Laukas įrodytas gamyboje (readiness, pasiekiamumas, priklausomi srautai); jokio redirect'o vien dizainui.
ACCEPTANCE: tempimas → kas-jei abiem projektams → patvirtinimas → DB įrašas ir readback abiejuose; lizdas → tinkami (≤12, „kodėl šie"); užblokuotas → knyga; klaviatūra ir sąrašo ekvivalentas; be sporto terminų duomenyse.
PROD PROOF: walk `move` per Lauką sutampa su `walk-what-if-move-prod.cjs` rezultatu tame pačiame SHA.

### P5 · Web erdvė (shell) ir įmonės projektų laukas laike
USER JOURNEY: C, E, H. Vizualas `02`, `12`, `13`.
PRIORITETAS: **P1** (shell) / **P1** (C1 įmonės rodinys).
READS: `employer-workspace`, `capacity`, `attention-brief`, aktyvus kontekstas (`switch-active-organization`), `listMyEngagements`. ACTIONS: esami.
STATUS: PARTIAL (dashboard = chat-first su 5 skirtukų simple shell; Context panelė, laiko skruberis, Pasaulis|Laukas perjungiklis — TARGET). WRITE DOMAIN: `SHELL`. DEPENDENCIES: P2; P4 (Laukas kaip scena) — shell gali būti paleistas su chat + Context anksčiau. PARALLEL: **DALINAI** — shell konteineris taip; C1 eilutės priklauso nuo `PROJECT` read modelių (read-only, ne konfliktas).
DO-NOT-DUPLICATE: Conversation lieka viena (`conversation-chat.tsx`) — tik perkeliama į skydelį; nekurti antro dashboard'o; `/dashboard` lieka įėjimas.
ACCEPTANCE: vizualus įėjimas be chat (`22` 1–5 žingsniai); objektas → Context be URL keitimo; deep link į objektą veikia; klaviatūra; V9/V10.
PROD PROOF: walk be composer'io: įmonė → projektas → lizdas → Context → veiksmas.

### P6 · Tapatybė ir kilmė (provenance)
USER JOURNEY: B pabaiga, L, M. Vizualas `04` expanded, `06`, `19`.
PRIORITETAS: **P1**; SAFE PILOT reikia tik `EMPLOYER_CONFIRMED` etiketės (jau yra patvirtinimai #1513).
READS: `journal_entries`, `journal_entry_confirmations`, `review_evidence_links`, `worker_documents`, `worker_skills`. ACTIONS: esami `confirm-work`, `quick-confirm`.
STATUS: PARTIAL (patvirtinimai PRESENT; kode tik `SELF_DECLARED`; EVIDENCE/EMPLOYER/THIRD/SYSTEM žymėjimas ir tapatybės rodinys — TARGET). WRITE DOMAIN: `IDENTITY` (+ galimai 1 aditinė migracija provenance stulpeliui — GREEN klasė). DEPENDENCIES: P2. PARALLEL: **TAIP**.
DO-NOT-DUPLICATE: viena provenance funkcija naudojama Player, Context, tapatybėje, Attention; lygis kyla tik iš patvirtintų įrašų (nekurti antros lygio logikos).
ACCEPTANCE: kraštas + tekstas pagal klasę; auksas tik EMPLOYER/THIRD; „Tampu" ir „AI darbe" rodomi tik su įrodymais arba kaip sąžininga tuščia būsena (§1.9); §1.7 privatumas.
PROD PROOF: walk `confirm-work` → kortelė rodo aukso kraštą + „patvirtino <vardas> <laikas>".

### P7 · Mobile V1 (PWA) — Šiandien · Pasaulis · Paklausk + žurnalas objekte
USER JOURNEY: B, F (darbuotojas be chat), I. Vizualas `03`, `24`, `25`, `26`.
PRIORITETAS: **P1** (PUBLIC COMMERCIAL V1); SAFE PILOT — responsive dabartinis shell + P2/P3 užtenka.
READS: `attention-brief`, `worker-projects`, dabartinis priskyrimas, galimybės. ACTIONS: esami `log-work`, foto (`journal_entry_photos`), balsas (`/dashboard/journal/voice`, `services/transcribe`).
STATUS: PARTIAL (žurnalas, balsas PRESENT; Šiandien namai, sheet'ai, offline juodraštis — TARGET). WRITE DOMAIN: `MOBILE`. DEPENDENCIES: P2, P3. PARALLEL: **TAIP** su P4/P5/P6.
DO-NOT-DUPLICATE: ne atskiras mobile produktas — tie patys komponentai ir veiksmai; skirtukų pavadinimai keičiami be architektūros pokyčio.
ACCEPTANCE: 390 px be overflow; vienas veiksmas ekrane; taikiniai ≥56 px objekte; žurnalas išsaugomas kaip nepatvirtinta ir sukelia Attention; offline juodraštis (kur techniškai galima) — pažymėtas PARTIAL jei ne.
PROD PROOF: walk mobile viewport'u: Šiandien → žurnalas → Attention brigadininkui.

### P8 · World sluoksniai, klasteriai, viewport
USER JOURNEY: C, E, G (map-first). Vizualas `16`, `20`.
PRIORITETAS: **P1** (PUBLIC COMMERCIAL V1) su privaloma mastelio validacija.
READS: `lib/market-map/*` (`spatial-entities`, `signals`, `demand-locations`, `project-results`), `search_public_vacancy_previews_v1`. ACTIONS: nėra naujų; sluoksnių valdymas — World State.
STATUS: PARTIAL (market-map PRESENT; klasteriai/viewport/sluoksniai — TARGET). WRITE DOMAIN: `WORLD`. DEPENDENCIES: P2, P5 (scena). PARALLEL: **TAIP**.
DO-NOT-DUPLICATE: nėra atskiro Map ekrano (WORLD_STATE §1) — World yra scena shell'e; `/dashboard/market-map` lieka iki įrodymo (§1.5).
ACCEPTANCE: ≤60 objektų ekrane, viewport-bounded užklausos, klasteriai su skaičiais, sąrašo ekvivalentas; sluoksnis keičiamas sakiniu ir ranka.
PROD PROOF: **prototipo/apkrovos validacija su 1M sintetinių taškų** (viewport užklausų laikas, klasterių tikslumas) — statiniai mockup'ai neįrodo; be šio įrodymo P8 lieka NOT_PROVEN.

### P9 · Billing suderinimas su komerciniu kontraktu + Stripe LIVE juosta
USER JOURNEY: C komercinis užbaigimas. Vizualas — nėra (copy ir esami planų puslapiai).
PRIORITETAS: **P1 (PUBLIC COMMERCIAL V1)**; SAFE PILOT — nemokama.
READS/ACTIONS: `lib/billing/plans.ts`, `api/billing/*`, Stripe test checkout, webhook. STATUS: PARTIAL (§1.3). WRITE DOMAIN: `BILLING`. DEPENDENCIES: nėra dizaino; savininko Stripe LIVE aktyvavimas — real-money gate lieka. PARALLEL: **TAIP** (izoliuotas domenas).
DO-NOT-DUPLICATE: nekurti naujų kainų; entitlement `company_create_needs` = 1 / 10 / contact; „Contact us" per esamą `customer_requests`/inquiry, ne naują formą.
ACCEPTANCE: FREE org negali atidaryti 2-o aktyvaus poreikio (aiškus paaiškinimas + kelias į €99); €99 = 10; >10 → susisiekite; test-mode checkout žalias; live guard nepaliestas iki savininko aktyvavimo.
PROD PROOF: Stripe test įvykiai ir `subscriptions` readback; LIVE — tik po savininko aktyvavimo.

### P10 · Komanda kaip objektas
USER JOURNEY: C, E (komandų perkėlimas), G. Vizualas `07`. PRIORITETAS: **P2** (FULL VISION), nebent SAFE PILOT klientas perkelia komandas — tada P1 subset (komandos kortelė + perkėlimas kaip grupė esamais `assign` veiksmais).
READS: `team_details`, `team_enquiries`, narių įgūdžiai/dokumentai. ACTIONS: esami `assign` per narius; `team_enquiry_events`. STATUS: PARTIAL. WRITE DOMAIN: `TEAM`. DEPENDENCIES: P2, P3 (aprėptis = knyga per narius), P4 (tempimas). PARALLEL: **TAIP**.
DO-NOT-DUPLICATE: aprėptis išvedama iš narių, ne saugoma atskirai; komanda nėra „mini įmonė".
ACCEPTANCE: komandos kortelė ta pati World/Laukas/atitikimas/Marketplace; trūkstama aprėptis → spraga → sprendimas.
PROD PROOF: walk: komanda → lizdas → priskyrimas 4 nariams vienu veiksmu → readback.

### P11 · Mokymas → darbas (institucijos laukas, mokinys)
USER JOURNEY: D. Vizualas `17`, `18`. PRIORITETAS: **P2** (FULL VISION); institucijos grandinė sakiniu jau PRESENT (E2E), realaus kliento nėra.
READS: `education_programs`, `education_cohorts`, `education_cohort_members`, `training_programs`, paklausa iš `customer_requests`/`public_vacancies`. ACTIONS: esami education intents. STATUS: PARTIAL. WRITE DOMAIN: `EDU`. DEPENDENCIES: P2, P3, P6. PARALLEL: **TAIP**.
DO-NOT-DUPLICATE: mokinys = tas pats Person; nėra LMS (kursų katalogo, pažymių).
ACCEPTANCE: rinkos paklausa iš tikrų poreikių; praktikos spraga → darbdaviai su atvirais poreikiais; rezultatai tik iš patvirtinimų.
PROD PROOF: walk su E2E institucija + realios paklausos agregatu.

### P12 · Marketplace TARGET aprėptis (būstas, transportas, įranga, kiti resursai)
PRIORITETAS: **P2 / TARGET** (§1.6). WRITE DOMAIN: `MKT`. Įtraukiama tik orkestratoriui įrodžius kanoninius duomenis, leidimus ir veiksmų kelius. Objektų kalba išlieka (`14`–`16`).

### P13 · My Space
PRIORITETAS: **P2**; owner gate #1475. WRITE DOMAIN: `MYSPACE`. Neblokuoja jokios kelionės (`03`/`24` My Space — prisegtos kortelės, neprivalomos).

### P14 · Natyvios programėlės (iOS/Android), offline, push, biometrija
PRIORITETAS: **FULL VISION / LATER**; tie patys veiksmai per esamą bearer resolver (`lib/api/external-client-auth.ts`, `/api/mcp` modelis). Neblokuoja SAFE PILOT nei PUBLIC V1.

### P15 · Laiko skruberis ir prognozių medžiaga
PRIORITETAS: **P2** kaip atskiras paketas; **P0 dalis** — tik „faktas / išvesta" žymėjimas (šviežumas + „išvesta iš…") įeina į P2. Prognozės — tik su įrodymais ir §1.7. WRITE DOMAIN: `OBJ-UI` (+ `PROJECT` read modeliai).

---

## 6. Prioritetų peržiūra pagal tris horizontus

**SAFE PILOT** (pirmas realus LT statybos klientas, nemokama, E2E → realūs naudotojai): P1, P2, P3, P6-subset (EMPLOYER_CONFIRMED etiketė), P15-subset (faktas/išvesta). Chat + esami `/operations`, `/journal`, `/documents` paviršiai lieka veikti; Laukas, Pasaulis, mobile shell — ne blokatoriai.

**PUBLIC COMMERCIAL V1**: + P4, P5, P7, P8 (su mastelio validacija), P9, P6 pilnai, P10-subset jei klientas perkelia komandas.

**FULL CURRENT CANONICAL VISION / LATER**: P10 pilnai, P11, P12, P13, P14, P15 pilnai.

Neblokuoja SAFE PILOT: natyvios programėlės, Marketplace plotis, prognozės, My Space, grynai vizualiniai patobulinimai — nebent reali dabartinė P0 kelionė nuo jų priklauso (šiandien — ne).

---

## 7. Mastelio ir elgsenos validacija (sąžiningai, dar neatlikta)

| Kas | Būsena | Kada privaloma |
|---|---|---|
| World klasteriai/viewport 1M taškų | NOT_PROVEN — statiniai mockup'ai | prieš P8 acceptance |
| Laukas su ≥12 žmonių / ≥8 zonų / klaviatūra | NOT_PROVEN | prieš P4 acceptance |
| Kontekstinė knyga su 10+ reikalavimų mobile | NOT_PROVEN | prieš P3 mobile (P7) |
| Attention tūris (>20 įrašų) — grupavimas | NOT_DESIGNED (tuščia/maža būsena parodyta) | prieš PUBLIC V1 |
| a11y: sąrašo ekvivalentai Field/World, screen reader objektas | APRAŠYTA, nenupiešta | P4/P8 acceptance |
| Offline žurnalo juodraštis | TARGET, techninis įrodymas reikalingas | P7 |

---

## 8. Lygiagretumas ir priklausomybės

**PARALLEL_SAFE_GROUPS** (vienas rašymo savininkas per domeną):
- G1: P1 (`PUBLIC`) ∥ P2 (`OBJ-UI`) ∥ P3 (`READINESS`) ∥ P9 (`BILLING`) — visi nepriklausomi domenai; P3 gali startuoti su esama juosta ir prisijungti prie P2 komponento vėliau.
- G2 (po P2): P4 (`PROJECT` UI) ∥ P6 (`IDENTITY`) ∥ P8 (`WORLD`) ∥ P7 (`MOBILE`, po P3).
- G3 (po P2+P4 read modelių): P5 (`SHELL`) ∥ P10 (`TEAM`) ∥ P11 (`EDU`).
- Bet kada, izoliuota: P13 (`MYSPACE`, po #1475), P12 (`MKT`, po įrodymo).

**SERIAL_DEPENDENCIES:** P2 → {P3 juosta, P4, P5, P6, P7, P8, P10, P11}; P3 → P7 (mobile knyga), P10 (aprėptis); P4 read modeliai → P5 C1 eilutės; P5 scena → P8 World kaip scena (P8 gali būti kuriamas esamame `market-map` konteineryje ir perkeltas); P6 → P11 rezultatai; #1475 → P13; Stripe LIVE savininko aktyvavimas → P9 live dalis.

**WRITE_DOMAIN_CONFLICTS** (orkestratoriui skirti vieną savininką arba serializuoti):
- `CONV` liečiamas P1 (read-only hook), P2 (render vietos), P5 (perkėlimas į skydelį) — **vienas savininkas `conversation-chat.tsx` failui** visą laiką; P2/P5 ten rašo paeiliui.
- `OBJ-UI` ↔ `READINESS`: juostos komponentas (P2) ir knygos modelis (P3) — sutarti sąsają pirmiausia (`RequirementLedger[]` tipas), tada rašo atskirai.
- `PROJECT` ↔ `TEAM`: komandos perkėlimas kaip grupė (P10) naudoja P4 tempimą — P10 po P4.
- `SHELL` ↔ `MOBILE`: bendras layout — P7 ir P5 nerašo į tą patį `layout.tsx` vienu metu; mobile shell kaip atskiras komponentas, layout keičia tik P5.
- `IDENTITY` migracija (provenance stulpelis) ↔ bet kuri kita migracija tuo pačiu laiku — aditinė, GREEN, bet vienas migracijų savininkas per langą.

---

## 9. Kanoninių veiksmų spragos (be jų dizainas neįgyvendinamas pilnai)

| Spraga | Reikia | Paketas |
|---|---|---|
| Kontekstinė reikalavimų knyga kaip kanoninis read (projekto/galimybės/vaidmens reikalavimai vienoje struktūroje) | read modelis virš `customer_requests` + projekto laukų + `documents-gap` + `skill-gap` | P3 |
| „Kas gali padėti" jungtis spraga → `training_programs` / `service_offerings` / `marketplace_listings` su „kodėl tinka / atmesta N" | read + rangavimas | P3 |
| Grupinis priskyrimas (komanda → lizdas) vienu veiksmu su readback | veiksmas virš esamų `assign-worker` (batch, idempotent) | P10 |
| Provenance klasės kanoniškai (ne tik `SELF_DECLARED`) | išvesta iš `journal_entry_confirmations` / sertifikatų; galimas aditinis stulpelis | P6 |
| World viewport-bounded užklausa su klasteriais | RPC su bbox + zoom lygiu | P8 |
| Landing intent event (anon) | `pilot_events` metadata (anon insert jau leidžiamas) | P1 |
| Attention grupavimas dideliam tūriui | read modelis | prieš PUBLIC V1 |
| Billing entitlement 1 / 10 / contact | `plans.ts` + Stripe kainos | P9 |
| Organizacinės prognozės matomumo taisyklė (§1.7) darbuotojo kontekste | policy read'e (ne UI) | P6/P15 |

---

## 10. Savininko sprendimai, kurių dar reikia (tik tikri)

1. **Stripe LIVE aktyvavimas** — real-money gate (ne dizainas; P9 live dalis).
2. **#1475 My Space apply** — owner gate (P13).
3. **Transactional e-mail env** — owner gate (kvietimai/instrukcijos siunčiamos); dizainas jį rodo kaip „išsiųsta" tik įjungus.
4. **SAFE PILOT klientas: ar perkelia komandas** — lemia P10-subset įtraukimą į V1.
5. **Marketplace TARGET kategorijų įtraukimas** — tik orkestratoriaus įrodymo pagrindu (§1.6); sprendimas savininkui tik jei įrodymas pateiktas.

Nebeliko: pokalbio skydelis, mobile skirtukai, K1/F1/C1/M1, landing tema, kilmės medžiaga, LLM proposer — patvirtinta / uždaryta.

---

## FINAL_DESIGN_STATUS
**READY_FOR_IMPLEMENTATION**

Pataisymai pritaikyti be tikro prieštaravimo. Vienintelis faktinis neatitikimas — billing kodas (pre-payment planai 5/25) vs patvirtintas kontraktas (1/10/contact) — yra įgyvendinimo juosta P9, ne dizaino prieštaravimas.

## SAFE_PILOT_PACKAGES
P1 (viešas įėjimas) · P2 (objektų kalba + atsakymo forma, įsk. faktas/išvesta žymėjimą) · P3 (kontekstinė knyga + spraga→sprendimas, P0 Marketplace aprėptis) · P6-subset (EMPLOYER_CONFIRMED etiketė virš #1513).

## PUBLIC_COMMERCIAL_V1_PACKAGES
P4 (Laukas) · P5 (web shell + C1) · P6 (pilna kilmė ir tapatybė) · P7 (mobile V1 PWA) · P8 (World sluoksniai — su mastelio validacija) · P9 (billing 0 / 1 / €99=10 / contact + Stripe LIVE juosta) · P10-subset (jei pilotas perkelia komandas) · Attention grupavimas.

## FULL_VISION/LATER_PACKAGES
P10 (komanda pilnai) · P11 (mokymas→darbas) · P12 (Marketplace TARGET aprėptis) · P13 (My Space) · P14 (natyvios programėlės, offline, push, biometrija) · P15 (laiko skruberis, prognozės).

## PARALLEL_SAFE_GROUPS
G1: P1 ∥ P2 ∥ P3 ∥ P9 · G2 (po P2): P4 ∥ P6 ∥ P8 ∥ P7 (po P3) · G3 (po P2+P4 read): P5 ∥ P10 ∥ P11 · izoliuoti: P13 (po #1475), P12 (po įrodymo).

## SERIAL_DEPENDENCIES
P2 → P3-juosta / P4 / P5 / P6 / P7 / P8 / P10 / P11 · P3 → P7, P10 · P4-read → P5-C1 · P5-scena → P8-kaip-scena · P6 → P11 · #1475 → P13 · Stripe LIVE gate → P9-live.

## WRITE_DOMAIN_CONFLICTS
`conversation-chat.tsx` (P1 hook / P2 render / P5 skydelis) — vienas savininkas · `OBJ-UI`↔`READINESS` sąsaja `RequirementLedger[]` prieš lygiagretų darbą · `PROJECT`↔`TEAM` (P10 po P4) · `SHELL`↔`MOBILE` (`layout.tsx` tik P5) · migracijos — vienas savininkas per langą.

## CANONICAL_ACTION_GAPS
Kontekstinė knyga (read) · spraga→sprendimas jungtis su rangavimu · grupinis priskyrimas (batch, idempotent) · provenance klasės kanoniškai · World bbox/zoom RPC · landing intent event · Attention grupavimas · billing entitlement 1/10/contact · organizacinių prognozių matomumo policy.

## OWNER_DECISIONS_REMAINING
Stripe LIVE aktyvavimas · #1475 apply · transactional e-mail env · ar pilotas perkelia komandas (P10-subset) · Marketplace TARGET kategorijos tik pateikus įrodymą.

**KONTRAKTAS UŽŠALDYTAS. Vykdytojui nesiunčiama. Perduoda savininkas MASTER užbaigimo orkestratoriui.**
