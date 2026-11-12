# LAUNCH COMPLETION ROADMAP — LabourMarket.ai (2026-11-12, 20:00 UTC)

Likusių darbų planas iki pirmojo viešo V2 leidimo ir iki pilno produkto. Būsenos ir įrodymai:
[`LAUNCH_EXECUTIVE_STATUS.md`](LAUNCH_EXECUTIVE_STATUS.md). Visos 288 funkcijos:
[`FULL_FUNCTION_READINESS.md`](FULL_FUNCTION_READINESS.md). Krypčių būsenos kasdien: GitHub įrašas #3265.

Terminai. Datos neišgalvojamos. „Iki 11-15“ rašoma tik darbams, kurių kodas jau parašytas ir peržiūrėtas.
Kitur nurodyta, nuo ko terminas priklauso. Pralaidumo riba: po kiekvieno sujungimo į `main` produkcijos
patikra trunka apie 2 val. 15 min., todėl per parą telpa apie 8–10 diegimų, kol nėra trumpojo testo.

Kryptys: A (dizaino sistema, vieša V2), A2 (prisijungusio naudotojo ekranas), B (asistentas), C (B2B),
D (planai ir mokėjimai), E (švedų kalba), F (CI, E2E, produkcijos patikros), G (darbuotojai, CV),
H (komandos, įmonės, projektai), S (SEO ir greitaveika), V1 (nepatvirtintų įmonių poreikiai),
M (funkcijų registras), R (nepriklausoma GREEN peržiūra), R2 (nepriklausoma RED peržiūra).

## Etapas A — vieša V2: pagrindinis puslapis, navigacija, registracija, pagrindinės kelionės

| Darbas | Kryptis | Rezultatas | Priklauso nuo | Apimtis | Terminas | Priėmimo kriterijus |
|---|---|---|---|---|---|---|
| Sujungti viešą V2 (#3266, `3cb865ecf`) | koordinatorius | V2 produkcijoje | patikros langas po #3255 | parašyta, peržiūrėta | iki 11-15 | produkcijoje šeši tikslai pirmame ekrane; maršrutų testas PASS |
| Sujungti prisijungusio naudotojo ekraną (#3270, `ef8195084`) | koordinatorius, A2 | pagrindinis ekranas pagal vaidmenį, prisegimas | #3266 | parašyta, peržiūrėta | iki 11-15 | prisegimas išlieka produkcijoje; 4 vaidmenys per ≤ 2 veiksmus |
| Suderinti prisijungusio naudotojo viršutinę juostą ir telefono pirmą ekraną su vieša dalimi | A2, A | viena navigacija abiejose dalyse | #3270 | neįvertinta, darbas nepradėtas | priklauso nuo apimties įvertinimo | tikslai telefone matomi be slinkimo; nėra antros kortelių juostos |
| Bendri sąsajos elementai (#3273, `475dcbc`) | A | laukai, lentelė, žymos, struktūros rodinys | #3266 | parašyta, CI žalias | iki 11-15 | sargas draudžia antrą juostos ar kortelės įgyvendinimą |
| Asistento laukelis vidiniuose puslapiuose | A | antraštėje ir telefono apačioje | #3266 | nepradėta | po V2 sujungimo | neuždengia formų; pasislepia rašant |
| Pagrindinio puslapio dalis žemiau pirmo ekrano | A | sutrumpintas turinys | #3266 | nepradėta | po V2 sujungimo | nėra pasikartojančių blokų |
| Prisijungimo puslapio LCP ir CLS (#3296, `82362f457`) | S, R | forma serverio HTML | peržiūra; klasės nustatymas | parašyta, CI žalias | iki 11-15, jei klasė GREEN | LCP ≤ 2,5 s, CLS ≤ 0,1 produkcijoje |
| Šriftų įkėlimas (#3294), pagrindinio puslapio kliento pusės turinio mažinimas | S, A | mažesnis LCP | #3266 | #3294 parašyta; likusi dalis neįvertinta | #3294 iki 11-15; likusi dalis neįrodyta | LCP ≤ 2,5 s trijų matavimų mediana |
| Slapukų juostos nuorodos tekstas (#3277, `bdc654a`) | F | SEO įvertis en ir de | – | parašyta, peržiūrėta be radinių | iki 11-15 | Lighthouse SEO ≥ 95 |
| Švedų kalba (#3261) | E, R | `/sv` veikia | galutinė versija, peržiūra | parašyta; laukia peržiūros | priklauso nuo peržiūros rezultato | švediška kelionė PASS; kitų kalbų atpažinimas nepakitęs |
| Trumpas testas po diegimo (#3263, #3271) | F | 15–20 min. patikra po kiekvieno diegimo | #3271 klasės sprendimas | parašyta | #3263 iki 11-15; #3271 po sprendimo | rezultatas su produkcijos versija kiekvienam diegimui |
| 14 scenarijų pakartojimas dabartinei versijai | F, J-2 | PASS arba FAIL su versija | testų paleidimas iš savininko kompiuterio | 1 iš 6 atlikta | priklauso nuo paleidimo leidimo J-2 sesijoje | kiekvienas scenarijus su paleidimo ID |
| 3 sekundžių testas, 40 žmonių | savininkas | supratimo procentas pagal grupę | įdiegta V2; dalyviai | nepradėta | po V2 diegimo | ≥ 90 % kiekvienoje grupėje |

## Etapas B — pagrindinės funkcijos: CV, įmonės, paieška, komandos, projektai, žurnalai, komunikacija

| Darbas | Kryptis | Rezultatas | Priklauso nuo | Apimtis | Terminas | Priėmimo kriterijus |
|---|---|---|---|---|---|---|
| Darbuotojo profilio, darbo kortelės, dokumentų formos ant bendrų elementų (#3278, #3281, #3283), dvi klaidų pataisos (#3274, #3280), kelionių testas (#3276) | G, R | suvienodintos formos | peržiūros eilė | parašyta, CI žalias | iki 11-15, jei telpa į diegimų langus | produkcijos testai `availability-save`, `documents-approvals` PASS po sujungimo |
| Dalinės darbuotojo funkcijos: patirties redagavimas, šalių pavadinimai, prieinamumo lauko išvalymas, asmens puslapio nuoroda iš paieškos | G | užbaigtos funkcijos | – | neįvertinta | nenustatyta | kiekviena su naršyklės testu |
| Projekto puslapis rodo komandas (#3275), komandų ekranai ant bendrų elementų (#3279) | H, R | suvienodinti ekranai | #3279: mygtukų aukščio pataisa | parašyta | iki 11-15, jei telpa | 3–9 ir 14 scenarijai PASS izoliuotoje aplinkoje ir produkcijoje |
| Septynios trūkstamos komandų ir projektų funkcijos | H, savininkas | vadovo žyma, struktūros rodinys be DB pakeitimų; likusios vienu RED juodraščiu | trys prieigos sprendimai | žyma ir rodinys: maža; likusios: RED, neįvertinta | po savininko sprendimų | kiekvienai funkcijai registro eilutė ir testas |
| B2B grandinė (#2946) | C, R2, savininkas | užklausa susieta su pasiūlymu | savininko RED sprendimas | parašyta, peržiūrėta | po sprendimo | produkcijos testas `orders-bookings` PASS |
| Asistento aprėptis: užsakymai, istorija, sutartys, mokėjimai, paieška | B | funkcijų aprėpties lentelė | – | nežinoma: krypties įrašo registre nėra | nenustatyta | kiekvienam įrankiui teisių ir izoliacijos testai |
| Nepatvirtintų įmonių poreikių viešinimas (#3256) | V1, R2, savininkas | įmonės pasirinktas viešas poreikis | du stabdantys radiniai; galutinis RED sprendimas | parašyta; taisoma | po pataisų ir sprendimo | devynios savininko sąlygos PASS, vieša užklausa greita esant daug poreikių |
| Pokalbių pataisos (#3244, #3238, #3240, #3243) ir kiti paruošti GREEN PR | koordinatorius | įdiegta | diegimų langai | parašyta, peržiūrėta | pagal eilę po Etapo A | CI žalias, produkcijos testas po diegimo |

## Etapas C — planai ir mokėjimai

| Darbas | Kryptis | Rezultatas | Priklauso nuo | Apimtis | Terminas | Priėmimo kriterijus |
|---|---|---|---|---|---|---|
| Izoliuotas planų prieigos testas (#3284, `768dbeba0`) | D, R2, savininkas | 10–13 scenarijų programos dalis | RED sprendimas | parašyta; 5 iš 5 PASS, paleidimas 43280938446 | po sprendimo | testas vykdomas kiekvienam mokėjimų pakeitimui |
| Mokėjimų pataisa (#3252) ir tekstai (#3250) | D, R2, savininkas | teisinga prieiga sustabdžius prenumeratą; teisingi tekstai | RED sprendimai | parašyta, peržiūrėta | po sprendimų | mokėjimų testai 535 iš 535; viešuose puslapiuose nėra neveikiančių pažadų |
| Antrasis etapas: Stripe testinė aplinka | D, savininkas | apmokėjimas, portalas, grąžinimas, nepavykęs mokėjimas | testinės aplinkos raktai GitHub paslaptyse | nepradėta | po raktų įrašymo | kiekvienas žingsnis PASS prieš Stripe TEST |
| Planų matrica ir bandomasis laikotarpis | savininkas, D | kuri funkcija kuriam planui | privatus pasiūlymas | sprendimas | nenustatyta | matrica įrašyta kode ir registre |
| Premium ir bandomųjų funkcijų ribojimas pagal matricą | D | serverio ribojimai | matrica | neįvertinta | po matricos | 10–13 scenarijai PASS visoms ribojamoms funkcijoms |
| Stripe Tax ir LIVE paleidimas (#2441) | savininkas | realus apmokestinimas | atskiri sprendimai | – | atskiras sprendimas | du savininko veiksmai pagal MKT-7 |

## Etapas D — pilnas funkcijų užbaigimas

| Darbas | Kryptis | Rezultatas | Priklauso nuo | Apimtis | Terminas | Priėmimo kriterijus |
|---|---|---|---|---|---|---|
| Registro atnaujinimas: planas, dizainas, kryptis, trūkstami darbai (šaka `docs/cc/function-register-launch-state`) | M | registras `main` šakoje | peržiūra | parašyta, nesujungta | iki 11-15 | 288 eilutės su visais stulpeliais |
| 8 FAIL funkcijos | pagal modulį | pataisyta arba pagrįsta | – | žr. registro eilutes | nenustatyta | produkcijos įrodymas |
| 39 BLOCKED funkcijos | savininkas, pagal modulį | sprendimai, paskyros, konfigūracija | savininko veiksmai | daugiausia sprendimai | priklauso nuo sprendimų | būsena pakeista su įrodymu |
| 16 NOT TESTED funkcijų | F, pagal modulį | testas | – | testų rašymas | nenustatyta | produkcijos arba izoliuotas testas |
| 22 NOT IMPLEMENTED funkcijos | pagal modulį | įgyvendinta arba išbraukta savininko sprendimu | dalis RED | neįvertinta | nenustatyta | registro eilutė PASS |
| Dizaino suvienodinimas: 61 įvertinta funkcija mišri arba sena, 221 neįvertinta | A, G, H, C, D, B | visi P0 ekranai ant vienos sistemos | #3273 | didelė | nenustatyta | A krypties sąrašas (#3272) be „mišrus“ ir „senas“ |
| Mobilus veikimas: 285 funkcijos be mobilaus testo | F, pagal modulį | testai 320–1440 px | – | didelė | nenustatyta | nėra perpildymo, veiksmai pasiekiami lietimu |
| Kitos kalbos: da 30 %, no, et, lv apie 22 %, fi be sąsajos katalogo | E | pagal savininko prioritetą | švedų kalba | didelė | nenustatyta | kalbos kelionė PASS |
| Realių naudotojų greitaveikos matavimas | S | LCP, CLS, INP tik su sutikimu | – | maža | po V2 | 75-asis procentilis ≤ tikslų |

## Seka

1. Etapas A jungiamas pirmas: #3266, #3270, tada #3277, #3294, #3296, #3273, #3261.
2. Etapo B paruošti GREEN PR jungiami likusiuose diegimų languose.
3. RED sprendimai (#2946, #3252, #3250, #3284, #3214) nepriklauso nuo diegimų eilės: jų laukia tik
   savininko sprendimas ir migracijos taikymas.
4. Etapai C ir D vyksta lygiagrečiai; jų terminai priklauso nuo planų matricos ir prieigos sprendimų.

## Priedas — visi atviri PR (2026-11-12 19:36 UTC)

Finished: 2026-11-12 19:36 UTC. Source: GitHub MCP (`list_pull_requests`, `pull_request_read` get_check_runs / get_comments). Read-only.

Notes on the columns:
- **class**: RED = label `needs-human-gate` or title contains "RED" / "[owner gate]"; otherwise "GREEN (by label/title only)", shortened to GREEN in the tables.
- **CI**: "green" = every check run on the head completed, none failed (skipped ignored). No check run was in progress on any PR at read time.
- **review on head**: Codex = the `codex-review-state:v1` summary comment (its `commit_sha` compared with the head). "Codex findings (state on head: status failed, has_unresolved_findings=true)" = the state comment names the head sha but its status is `failed` (the bot's usage-limit message follows in those threads). Lane R = comments starting "Independent review (Codex substitute" / "Independent security review (RED", with their "Reviewed commit" and "Result" lines.
- **mergeable**: `mergeable_state` is NOT returned by the list endpoint through this tool (requested, absent from every row), and was not fetched per PR. Column reads "n/a".

## Updated 2026-11-11/12 (84)

| PR | title | draft | class | head | base | CI | review on head | mergeable |
|---|---|---|---|---|---|---|---|---|
| 3296 | perf(auth): the login form is in the server HTML [needs-human-gate] | yes | RED | 82362f457 | main | green | none | n/a |
| 3295 | RED draft: structure for a team's company, a role in a team, a role on a project… | yes | RED | 8c9b04d27 | main | green | none | n/a |
| 3294 | perf(fonts): preload 4 font files instead of 13 | yes | GREEN | ae903d57f | main | green | none | n/a |
| 3293 | ci(signup-isolated): give both builds the heap the other build jobs use | yes | GREEN | 393335fd7 | main | green | Codex clean on head | n/a |
| 3292 | feat(invitations): decline an invitation from your own list (RED draft, not applied) | yes | RED | 116266309 | main | green | none | n/a |
| 3291 | feat(journal): the review queue can be narrowed to one project (Lane H, PR 4) | yes | GREEN | f67da1782 | feat/cc/ui-primitives (stacked) | green | none | n/a |
| 3290 | feat(scouting): a search result's name opens the person page | yes | GREEN | ddf65065f | main | green | none | n/a |
| 3289 | feat(teams): team structure views on the shared StructureTree; name search… (Lane H, PR 3) | yes | GREEN | 71d586771 | feat/cc/ui-primitives (stacked) | green | none | n/a |
| 3288 | fix(documents): the document form names countries instead of codes | yes | GREEN | 25ebe9d4f | main | green | none | n/a |
| 3287 | fix(commercial): page intro no longer claims links the panel cannot make | yes | GREEN | c7b8b813a | main | green | none | n/a |
| 3286 | fix(seo): marketplace rules page gets its own meta description | yes | GREEN | f5d4b4c37 | main | green | none | n/a |
| 3285 | fix(onboarding): fields use the one guarded auth field class (44px floor) | yes | GREEN | 6ead5d004 | main | red: signup-isolated | Codex clean on head | n/a |
| 3284 | test(billing): plan-access walk on an isolated stack, no Stripe credential | yes | RED | 768dbeba0 | main | green | none | n/a |
| 3283 | refactor(documents): the worker document form uses the shared controls | yes | GREEN | a1e6ce605 | main | green | Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3282 | docs(register): launch state per function, keyed by row ID | yes | GREEN | 11ac4dbb1 | main | green | none | n/a |
| 3281 | refactor(profile): the work card editor uses the shared controls | yes | GREEN | 43d6c8a4b | main | green | Lane R on head: NO FINDINGS | n/a |
| 3280 | fix(cv): the CV names a language instead of printing its code | yes | GREEN | c562701ef | main | green | Lane R on head: NO FINDINGS | n/a |
| 3279 | refactor(teams): team and team-assignment controls use the shared primitives (Lane H, PR 2) | yes | GREEN | 66391700f | feat/cc/lane-h-project-teams (stacked) | green | Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3278 | refactor(profile): experience and skill forms use the shared controls | yes | GREEN | cbe865d20 | main | green | Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3277 | fix(a11y): the cookie banner link says where it leads | yes | GREEN | bdc654a59 | main | green | Codex clean on head; Lane R on head: NO FINDINGS | n/a |
| 3276 | test(e2e): worker fills profile and CV, employer search, CV isolation | yes | GREEN | dc68c310e | main | green | Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3275 | feat(projects): the project page names the teams working on it (Lane H, PR 1 + module audit) | yes | GREEN | 7c5d71d82 | main | green | Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3274 | fix(people): an unread record is not shown as an empty one | yes | GREEN | af6ee8eb1 | main | green | Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3273 | feat(ui): shared primitives for every module + DESIGN.md how-to | yes | GREEN | 475dcbcb1 | feat/cc/nav-v2 (stacked) | green | Codex clean on head; Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3272 | docs(design): one UX/UI discrepancy list and rollout plan (tracking) | yes | GREEN | aa3f2cc9a | main | green | Lane R on head: FINDINGS (P3 only; nothing blocks the merge) (comment gives short SHA aa3f2cc9a) | n/a |
| 3271 | ci(smoke): a short check of the main journeys after every production deploy | yes | GREEN | 46a9ab1d5 | main | red: lighthouse (en), lighthouse (lt) | Codex on older sha (bc29cc5, unresolved findings); Lane R on older sha (ec00145; result line: "RED: outside the substitute review; owner approval required") | n/a |
| 3270 | feat(nav): signed-in home on the shared goal navigator (Lane A2 on Lane A's components) | yes | GREEN | ef8195084 | feat/cc/nav-v2 (stacked) | green | Codex clean on head; Lane R on head: FINDINGS (P3 only in the two areas checked) (comment states scope "TARGETED, not a full review") | n/a |
| 3269 | feat(nav): quick access to active projects and open needs on the org home | yes | GREEN | fb307f133 | feat/cc/app-ask-assistant (stacked) | green | Codex on older sha (46d5096, unresolved findings) | n/a |
| 3268 | test(nav): walk the signed-in home by role and count navigation actions | yes | GREEN | ffab21f68 | feat/cc/app-ask-assistant (stacked) | green | Codex on older sha (61eae57) | n/a |
| 3267 | feat(nav): a visible "Ask the assistant" entry on the home | yes | GREEN | 3216689e3 | feat/cc/app-pin-home (stacked) | green | Codex on older sha (8309b03) | n/a |
| 3266 | feat(nav): V2 first-visitor navigation — one goal bar, goal navigator, short first screen | yes | GREEN | 3cb865ecf | main | green | Codex clean on head; Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3264 | feat(nav): pin shortcuts to the home, edited in place, never a way in | yes | GREEN | 1d15eddd1 | feat/cc/app-goal-nav (stacked) | green | Codex clean on head | n/a |
| 3263 | test(e2e): public CTA crawl and a citable release check | yes | GREEN | 3149a241e | main | red: lighthouse (lt), lighthouse (en) | Codex on older sha (d394a00, unresolved findings); Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3262 | test(e2e): production walks for pin to home and a Swedish visitor | yes | GREEN | 43a3bf30c | main | green | Codex on older sha (e85963d, unresolved findings); Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3261 | feat(i18n): activate Swedish (sv) as a routed locale across the whole journey | yes | GREEN | e5d52b659 | main | only 2 check runs on head: orphans success, Supabase Preview skipped (no quality / migration-safety run present) | Codex on older sha (c01a9ab, unresolved findings); Lane R on head: FINDINGS (P3 only; no blocking finding) | n/a |
| 3260 | fix(marketplace): a sent service request links to its answer | yes | GREEN | f320132e2 | main | green | none | n/a |
| 3259 | feat(nav): signed-in home leads with goal cards for each role | yes | GREEN | fa616d0e7 | main | green | Codex clean on head | n/a |
| 3258 | fix(commercial): accepted proposal becomes a contract in one step | yes | GREEN | 67f3a01c6 | main | green | none | n/a |
| 3256 | feat(demand): unconfirmed companies' needs public only by explicit consent (RED, principle C) | yes | RED | e35a196e0 | main | green | Codex on older sha (530b84e, status failed); Lane R on head: FINDINGS — 0 × P1, 2 × P2, 5 × P3. P2 blocks. | n/a |
| 3254 | feat(chat): work history, plan and search reads for assistants | yes | GREEN | 33b5fb5bb | main | green | Codex on older sha (b91ea89, status failed) | n/a |
| 3252 | fix(billing): paused grants no grace; prove the test-mode lifecycle | yes | RED | 2e8fce16b | main | green | Codex on older sha (4c4a289) | n/a |
| 3251 | feat(nav): the six public intents are the header's first level (A1) | yes | GREEN | e25118532 | main | green | Codex on older sha (3c6dcb0); Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3250 | fix(pricing): public pages show only what works while payment is closed | yes | RED | 702c85d1b | main | green | Codex on older sha (93546c9, status failed) | n/a |
| 3249 | fix(chat): attachment links work for 60 s instead of 300 s | yes | GREEN | 346edc850 | main | green | Codex clean on head | n/a |
| 3248 | feat(db): save_customer_request_v2, a buyer request records kind and language (RED) | yes | RED | b0b119712 | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 3247 | fix(demand): a need's pay currency starts as its country's | yes | GREEN | 6254130d5 | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true); Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3245 | fix(scouting): a country filter never silently becomes everyone | yes | GREEN | a390c2127 | main | green | Codex clean on head | n/a |
| 3244 | fix(mcp): an assistant-sent message keeps its real language, or none | yes | GREEN | fb83b40f4 | main | green | Codex clean on head | n/a |
| 3243 | fix(mcp): messaging refusals reach the model in English, by code | yes | GREEN | 613af2492 | main | green | Codex clean on head | n/a |
| 3241 | fix(projects): a project with a place carries its country | yes | GREEN | 43ac6fdc5 | main | green | Codex clean on head | n/a |
| 3240 | fix(chat): reply boxes use the composer's one error-key system | yes | GREEN | 165671a71 | main | green | Codex on older sha (226aae3); Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3239 | test(chat): A-B-C chat-revocation production walk and attachment proof | yes | GREEN | 0152049a8 | main | green | Codex clean on head | n/a |
| 3238 | docs(security): chat alert race, one-line status in the register | yes | GREEN | 914920d87 | main | green | Codex clean on head | n/a |
| 3237 | fix(company): setup copy says when workers see a company's needs | yes | GREEN | 18090b17e | main | green | Codex on older sha (abac137) | n/a |
| 3236 | docs(presentations): LT decks, product audit and P0 plan | yes | GREEN | 694278d5d | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 3235 | fix(agency): an agency-drafted need carries an ISO country | yes | GREEN | 2762f4a38 | main | green | Codex clean on head | n/a |
| 3234 | fix(buyer): a buyer request carries an ISO country | yes | GREEN | 57c6708d0 | main | green | Codex clean on head | n/a |
| 3233 | fix(company): claiming a public intake keeps its country | yes | GREEN | 6ba3882cf | main | green | Codex clean on head | n/a |
| 3232 | feat(privacy): Swedish consent texts with the RED hash re-pin (draft, not applied) | yes | RED | 5966917da | main | green | Codex clean on head | n/a |
| 3231 | feat(db): team_offer_counterpart_v1, the gated recipient of a team offer (RED) | yes | RED | d129c4d05 | main | green | Codex clean on head | n/a |
| 3230 | feat(ops): operator alerts for waiting company applications (RED draft) | yes | RED | 78cf9131e | main | red: signup-isolated | Codex clean on head | n/a |
| 3227 | fix(notifications): B2B offers tell the other side | yes | GREEN | aad7accb6 | main | green | Codex clean on head | n/a |
| 3226 | feat(chat): new-message e-mail on by default, with opt-out | yes | RED | aba22e1b8 | fix/cc/chat-revoked-no-alerts (stacked) | green | none | n/a |
| 3225 | fix(demand): the company-need wizard asks for the work country | yes | GREEN | 8a03857c8 | main | green | Codex clean on head | n/a |
| 3223 | docs(launch): ChatGPT submission section for the curated door | yes | GREEN | bd4ebff94 | main | green | Codex clean on head | n/a |
| 3222 | feat(mcp): job-list widget for the ChatGPT door (Apps SDK) | yes | GREEN | 7e6de17fb | feat/cc/chatgpt-public-jobs (stacked) | green | Codex clean on head | n/a |
| 3221 | feat(mcp): public job search without sign-in on the ChatGPT door [owner gate] | yes | RED | 133c3f89f | feat/cc/chatgpt-tool-profile (stacked) | green | Codex clean on head | n/a |
| 3220 | feat(auth): bearer tokens admitted only for their audience (C-3) [owner gate] | yes | RED | 42f1d3d55 | main | green | Codex clean on head | n/a |
| 3219 | feat(mcp): curated ChatGPT tool profile at /api/mcp/chatgpt | yes | GREEN | aa0efc2d6 | main | green | Codex clean on head | n/a |
| 3218 | feat(mobile): offers screen answers job proposals and invitations | yes | GREEN | 6d2ef72dc | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true); Lane R on head: FINDINGS (P3 only; nothing blocks the merge) | n/a |
| 3217 | ci(mobile): owner-started EAS release build that skips without secrets | yes | GREEN | d7315f9ef | main | green | Codex clean on head | n/a |
| 3216 | docs(launch): shortest path to TestFlight and Play internal testing | yes | GREEN | 5c0aa041b | main | green | Codex clean on head | n/a |
| 3215 | feat(seo): B2B intent versions of for-companies (subcontractors, agencies) | yes | GREEN | 1119b37b9 | main | green | Codex on older sha (914fe12, status failed) | n/a |
| 3214 | feat(company): signed-in company search, unconfirmed companies marked (RED draft, D2) | yes | RED | 3f463af0e | main | green | Codex on older sha (7ed26bf) | n/a |
| 3202 | feat(company-need): an inquiry records which public button opened it | no | GREEN | 9f6e24b50 | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 3167 | test(ai): Lithuanian evals for every registered agent | no | GREEN | 22bc45b08 | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 3166 | feat(ai): monthly euro cap on AI vendor runs | no | GREEN | 6415fb612 | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 3099 | docs(register): critical scenarios against the seven questions | no | GREEN | f5042932f | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 3008 | fix(reports): documents tile says unavailable, not a false 0 | no | GREEN | 5a89f80a7 | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 2970 | fix(ops): ai-failing counts technical failures over attempted runs | no | GREEN | 74351fc94 | main | green | Codex findings (state on head: status failed, has_unresolved_findings=true) | n/a |
| 2946 | feat(db): RED-1 link an accepted service request to a proposal [RED] | yes | RED | eb45557b3 | main | green | Codex clean on head | n/a |
| 2886 | feat(agentai): daily aggregate growth export (registrations by utm, active + completed Living CVs) [RED] | yes | RED | a5695481e | main | green | none | n/a |
| 2746 | feat(db): listing closed outcome + discarded draft never reopens [RED, NOT applied] | yes | RED | 630f58fd3 | main | green | none | n/a |
| 1622 | chore(deps-dev): Bump the dev-tooling group across 1 directory with 2 updates | no | GREEN | eeac46fc5 | main | green | none | n/a |

## Stale — last updated before 2026-11-11 (68)

CI and review: not checked (stale since the date shown). Base is `main` unless noted.

| PR | title | draft | class | last updated |
|---|---|---|---|---|
| 3208 | fix(company-need): an answer the company did not give is stored as unknown (RED) | yes | RED | 2026-11-10 |
| 3207 | fix(company-need): say how a sent inquiry reaches an account, and that it is not automatic | no | GREEN | 2026-11-10 |
| 3206 | fix(pricing): no payment promise while online payment is closed | no | GREEN | 2026-11-10 |
| 3203 | fix(worker-intake): say the form saves nothing and the details go into the profile | no | GREEN | 2026-11-10 |
| 3181 | fix(seo): each job page gets its own meta description | yes | GREEN | 2026-11-09 |
| 3178 | feat(seo): RU and TR worker guides for ten European countries | yes | GREEN | 2026-11-09 |
| 3173 | feat(jobs): country filter on the one public search [needs-human-gate] (base: feat/cc/jobs-narrow-search-table, stacked) | yes | RED | 2026-11-09 |
| 3168 | fix(communication): refuse unfaithful message translations | no | GREEN | 2026-11-09 |
| 3164 | feat(mcp): read-only profile at /api/mcp/read | yes | GREEN | 2026-11-09 |
| 3111 | feat(db): one CV statement once, at the database [RED] | yes | RED | 2026-11-06 |
| 3047 | fix(billing): checkout route refuses a recurring order during the pilot pass [RED] | yes | RED | 2026-11-04 |
| 3041 | ci(quality): typecheck gets enough heap, so main stops going red | no | GREEN | 2026-11-04 |
| 3021 | chore(db): drop the exact-duplicate vacancy board index [RED, not applied] | yes | RED | 2026-11-03 |
| 3019 | perf(db): row-independent policy calls run once per statement [RED] | yes | RED | 2026-11-03 |
| 2996 | feat(seo): keyset sitemap paging [RED, not applied] | yes | RED | 2026-11-03 |
| 2993 | feat(jobs): country + city for signed-out visitors [RED, not applied] | yes | RED | 2026-11-03 |
| 2924 | fix(oauth): consent screen names each permission in plain words + revoke path | yes | GREEN | 2026-11-01 |
| 2923 | feat(mcp): curated assistant toolset for OAuth clients (10.4, RED draft, X-2) (base: fix/cc/mcp-c3-audience, stacked) | yes | RED | 2026-11-02 |
| 2918 | fix(auth): bind bearer tokens to the resource they were issued for (C-3, RED) | yes | RED | 2026-11-02 |
| 2842 | docs(legal): paid-services terms draft v2 + EN + checkout checklist (for legal review, not published) | yes | GREEN | 2026-11-03 |
| 2816 | fix(training): an organization can assign training to its active employees (11.8, RED) | yes | RED | 2026-10-26 |
| 2812 | feat(auth): user-controlled OAuth permissions — choose, review, change, revoke (B3, RED) (base: feat/cc/mcp-scopes, stacked) | yes | RED | 2026-10-26 |
| 2811 | feat(db): OAuth door gate for direct database access (B1b, RED, ships off) (base: fix/cc/oauth-token-door-only, stacked) | yes | RED | 2026-10-26 |
| 2809 | ci(oauth): isolated OAuth test job on a local Supabase stack (B5a, RED) | yes | RED | 2026-10-26 |
| 2806 | fix(auth): third-party OAuth tokens are accepted only at the connector door (RED) | yes | RED | 2026-10-26 |
| 2795 | feat(db): let an acknowledged booking clash be recorded (RED #5 end) | yes | RED | 2026-10-28 |
| 2752 | docs(legal): name the free-tier AI processors before activation [RED] | yes | RED | 2026-10-25 |
| 2747 | feat(privacy): free workers discoverable by default — one ledger, notice first, one-tap objection [RED] | yes | RED | 2026-10-28 |
| 2713 | feat(marketplace): goods purchase requests on listings, delivery fields [RED] | yes | RED | 2026-10-28 |
| 2707 | feat(mcp): OAuth permission scopes behind MCP_SCOPE_ENFORCEMENT (RED) | yes | RED | 2026-10-26 |
| 2704 | feat(billing): organization invoices inside the account billing section (RED) | yes | RED | 2026-10-23 |
| 2701 | fix(billing): drop unproven VAT promise; record Stripe Tax decision | yes | RED | 2026-10-23 |
| 2693 | feat(db): vacancy retention reads protected ids; pin sentinel search_path [RED] | yes | RED | 2026-10-28 |
| 2685 | feat(billing): Stripe Tax evidence + review routing, switched OFF (RED) | yes | RED | 2026-10-25 |
| 2682 | fix(billing): the pilot pass shows its plan name, fixed term and amount | yes | RED | 2026-10-23 |
| 2647 | feat(lmc): Stripe TEST top-ups credit once per payment [RED] | yes | RED | 2026-10-21 |
| 2642 | fix(jobs): the saved-jobs view never says nothing saved when it is not (owner waiver needed) | no | GREEN | 2026-10-26 |
| 2474 | feat(billing): free plan opens 3 unique worker profiles per organization [RED] | yes | RED | 2026-10-25 |
| 2471 | feat(privacy): external profile links shared only through the worker's per-company grant [RED] | yes | RED | 2026-10-19 |
| 2463 | feat(db): ESCO cold locales archived on the VPS, hot set = UI locales [RED, not applied] (decision 0026) | yes | RED | 2026-10-19 |
| 2454 | test(e2e): external MCP client conformance walk — DCR, PKCE, consent, token, use, refresh, revoke | yes | RED | 2026-11-02 |
| 2441 | feat(billing): the second owner act — live checkouts need live_payments_enabled [RED: billing, no migration] | yes | RED | 2026-10-16 |
| 2440 | fix(db): null-safe owner check in append_assistant_message [RED, NOT applied] | yes | RED | 2026-10-16 |
| 2420 | perf(db): supply-count cron skips the full scan when nothing changed [RED, not applied] | yes | RED | 2026-10-25 |
| 2418 | perf(spine): team-offer badge counts in one read [RED, not applied] | yes | RED | 2026-10-15 |
| 2403 | fix(jobs): a title word no longer overrules a publisher's non-catalogue occupation (G-16 waiver needed) | yes | GREEN | 2026-10-15 |
| 2377 | docs(design): Future Experience 2030 — three concepts for owner choice | yes | GREEN | 2026-10-14 |
| 2370 | feat(identity): one identity family — re-port of the frozen design class (D2) | no | GREEN | 2026-11-03 |
| 2362 | feat(db): historical date correction v1 — 165 dates [RED] | yes | RED | 2026-10-14 |
| 2356 | chore(deps-dev): Bump eslint-config-next from 15.5.24 to 15.5.29 in the next-framework group… | no | GREEN | 2026-11-09 |
| 2235 | feat(db): RED draft — service_role-only expiry sweeps (needs-human-gate, NOT applied) | yes | RED | 2026-10-10 |
| 2227 | feat(ingestion): vacancy scheduler watchdog migration (RED - human gate) | yes | RED | 2026-10-09 |
| 2209 | feat(jobs): country filter on the public board (Norway vs Sweden) [needs-human-gate] | yes | RED | 2026-10-08 |
| 2203 | feat(finance): project-to-invoice lifecycle v1 [RED, needs-human-gate, NOT applied] | yes | RED | 2026-10-09 |
| 2198 | feat(voice): transcription production deploy bundle + runbook (COM-6) | no | GREEN | 2026-10-08 |
| 2165 | feat(worker-activation): Nonstop inbound worker -> signup -> existing consent + supply-declaration screen (REVIEW ONLY…) | yes | RED | 2026-10-23 |
| 1835 | test(global-access): production walk + local spec for LT SE DE IE VN US SA GE PH… | no | GREEN | 2026-09-22 |
| 1816 | feat(i18n): COMM-1 RED draft — profiles.communication_locale + the read side (needs-human-gate) | yes | RED | 2026-09-20 |
| 1625 | chore(deps): Bump @expo/metro-runtime from 57.0.14 to 57.0.16 | no | GREEN | 2026-10-10 |
| 1624 | chore(deps): bump @supabase/supabase-js from 2.106.0 to 2.115.0 | no | GREEN | 2026-10-10 |
| 1623 | chore(deps): Bump expo from 57.0.18 to 57.0.26 | no | GREEN | 2026-10-10 |
| 1620 | chore(ci): bump actions/upload-artifact from 4 to 7 | no | GREEN | 2026-10-09 |
| 1619 | chore(ci): bump github/codeql-action/init from 4.37.3 to 4.37.9 | no | GREEN | 2026-10-09 |
| 1617 | chore(ci): bump github/codeql-action/analyze from 4.37.3 to 4.37.9 | no | GREEN | 2026-10-09 |
| 1577 | feat(catalogue): office & professional professions — seed, mirror, lexicon (W6 G-D2, RED draft) | yes | RED | 2026-09-06 |
| 1211 | design(visual): art direction spec + pipeline audit — PARKED for owner decision | yes | GREEN | 2026-08-19 |
| 1166 | feat(design-rd): Living Opportunity World R5 — real 3D world + Göteborg cinematic journey | no | GREEN | 2026-08-16 |
| 1045 | fix(admin): repair the founder admin-grant path — narrow service_role column grants (owner-gated, UNAPPLIED) | yes | RED | 2026-08-06 |

## Facts

- Total open PRs: 152 (84 updated on 2026-11-11/12, 68 stale).
- RED by label/title: 61, all carrying the `needs-human-gate` label (18 among the 84 recent, 43 among the 68 stale). No PR is RED by title alone.
- GREEN (by label/title only) with green CI and a review on the current head (Codex clean on head and/or a Lane R comment on head): 38 — #3293, #3283, #3281, #3280, #3279, #3278, #3277, #3276, #3275, #3274, #3273, #3272, #3270, #3266, #3264, #3262, #3259, #3251, #3249, #3247, #3245, #3244, #3243, #3241, #3240, #3239, #3238, #3235, #3234, #3233, #3227, #3225, #3223, #3222, #3219, #3218, #3217, #3216.
  - Of these, the Lane R result on head is "NO FINDINGS" for #3281, #3280, #3277; every other Lane R result on head reads "FINDINGS (P3 only …)". #3270's Lane R comment states it is targeted, not a full review.
  - Not counted: #3261 (Lane R on head, but only 2 check runs exist on its head: orphans success, Supabase Preview skipped).
- CI red on head (recent set): #3285 (signup-isolated), #3271 (lighthouse en, lt), #3263 (lighthouse lt, en), #3230 (signup-isolated). No check run was in progress on any recent PR.
- GREEN recent PRs with green CI and no Codex/Lane R comment at all: #3294, #3291, #3290, #3289, #3288, #3287, #3286, #3282, #3260, #3258, #1622.
- Stacked on a non-main base: 16 — #3291 and #3289 (feat/cc/ui-primitives), #3279 (feat/cc/lane-h-project-teams), #3273 and #3270 (feat/cc/nav-v2), #3269 and #3268 (feat/cc/app-ask-assistant), #3267 (feat/cc/app-pin-home), #3264 (feat/cc/app-goal-nav), #3226 (fix/cc/chat-revoked-no-alerts), #3222 (feat/cc/chatgpt-public-jobs), #3221 (feat/cc/chatgpt-tool-profile), #3173 (feat/cc/jobs-narrow-search-table), #2923 (fix/cc/mcp-c3-audience), #2812 (feat/cc/mcp-scopes), #2811 (fix/cc/oauth-token-door-only).
- Not obtained: `mergeable_state` for any PR (absent from the list response; not fetched per PR). Stale PRs: CI and review not checked, as instructed.
