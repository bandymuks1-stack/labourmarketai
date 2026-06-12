# Labourmarket.ai — Pilna produkto apžvalga ir įgyvendinimo planas (human-first)

> **Statusas:** kanoninis produkto planas (v1, 2026-06-10).
> **Šaltiniai (privalomi, perskaityti prieš rašant):** `docs/PROJECT_VISION.md`,
> `docs/PROJECT_ROADMAP.md`, `docs/PLATFORM_DOCTRINE.md`,
> `docs/PHASE3_first_customer_plan.md`; papildomai `docs/PHASE3_value_and_sales.md`,
> `docs/product/labourmarketai-supergrand-vision-os-v1.md`,
> `docs/architecture/SCHEMA_INVENTORY.md`, `docs/design/premium-design-map-v1.md`.
> **Konfliktų taisyklė:** jei šis planas kur nors kertasi su repo doktrina /
> vizija / roadmap — repo dokumentai laimi iki owner sprendimo (žr. §21).
> **Tier:** GREEN. Šiame sprinte — jokių naujų lentelių, jokių DB migracijų.
> Visi funkcijų ryšiai žemėlapinami į ESAMĄ kanoninį modelį arba žymimi
> `vision only`.
>
> **EN summary:** This is the canonical full product overview for
> Labourmarket.ai — a universal labour-market operating system (not a job
> board, not construction-only). It merges all prior product direction into
> one human-first plan: profile → documents → skills → evidence → trust →
> demand → match → action → marketplace → live market → personal command
> center → (later) AI assistance. Every feature link maps to the EXISTING
> canonical data model or is explicitly marked `vision only`. No new tables,
> no migrations in this sprint. Sequencing: Phase 3 (human-run matching with a
> first real customer) → TASK 07 (living-arena UI after owner visual lock) →
> M4+ (AI as decision support on verified Work Proof data).

**Statusų žymos, naudojamos visame dokumente:**

- `now (Phase 3)` — veikia arba daroma dabar, ant esamo kanoninio modelio.
- `TASK 07` — laukia owner vizualinio užrakto (living-arena UI). Iki jo — tik
  low-fidelity preview, pažymėtas „low-fidelity preview, bus pakeistas TASK 07“.
- `M4+` — AI / automatizacijos sluoksnis, tik po realių klientų ir verified
  Work Proof duomenų.
- `vision only` — kryptis aprašyta, bet šiame sprinte jai nekuriama jokia DB
  struktūra ir joks veikiantis backend.

---

## 1. Produkto esmė

Labourmarket.ai — reali, **universali darbo rinkos operacinė sistema**. Ne
darbo skelbimų svetainė, ne worker-only CV puslapis, ne company-only ATS.
Statyba = pirmas vertikalas, ne visas produktas (VISION §2). Recruitment yra
pamatinė funkcija — produktas niekada nepozicionuojamas „prieš įdarbinimą“.

Penki ramsčiai:

1. **Recruitment (core)** — rasti, patikrinti, pasiūlyti, įdarbinti.
2. **Workforce management** — komandos, projektai, parengtis, sprendimų eilė.
3. **Skills verification** — 5 patvirtinimo lygiai (VISION §6): self-declared →
   work-journal-backed → manager-confirmed → client-confirmed → document-backed.
4. **Project planning** — poreikiai, žmonės, rizikos ant projektų.
5. **Market intelligence** — gyva pasiūlos/paklausos rinka, sluoksniuotas
   žemėlapis (VISION §11).

Pagrindinė seka (žmogui matoma kaip paprastas kelias, viduje — konkretūs
duomenų taškai):

> Žmogus → Profilis → Dokumentai → Įgūdžiai → Įrodymai → Pasitikėjimas →
> Įmonės poreikis → Match → Veiksmas → Marketplace → Gyva rinka → Asmeninė
> valdymo erdvė.

**Work Journal = centrinis stuburas.** Declared skills → manager-confirmed
entries (LIVE production) → verified Work Proofs → ratings → patikimas
recruitment/rental → realūs duomenys AI matching'ui (M4+). Be šio stuburo visa
kita — tuščia (ROADMAP Phase 1: „until it flows, the rest is hollow“).

Centrinis klausimas (VISION §3): **„Kas yra TINKAMAS žmogus TINKAMAM darbui
TINKAMU laiku — IR KODĖL?“** Pasitikėjimas ateina iš „kodėl“ — sistema
paaiškina sprendimus, ne tik juos rodo.

---

## 2. Human-first principas

Sistema palengvina žmogaus buvimą projekte. Viskas aišku, patogu, neprivaloma,
bet prieinama.

- **Visos funkcijos galimos, bet neprivalomos.** Vartotojas gali pradėti nuo
  minimalaus profilio (text-first / CV-first startas — jau veikia per
  confirmed-suggestions pipeline: tekstas → pasiūlymas → žmogus patvirtina →
  faktas).
- **Papildomi blokai atsiranda tada, kai jie naudingi** — feature-availability
  katalogas (`lib/config/feature-availability.ts`) jau valdo, kas `active`, kas
  `preparing`; nieko nerodome kaip veikiančio, kas neveikia.
- **Žmogui nerodoma techninė logika.** Vidiniai ryšiai (§3) — tik viduje;
  žmogus mato paprastą rezultatą ir aiškų statusą: ką turi, ko trūksta, ką gali
  daryti toliau (Next Action Engine — jau yra `DashboardNextAction` /
  `WorkCard` pavidalu).
- **Niekas neatrodo kaip klaida** vien dėl to, kad žmogus dar neužpildė visko.
  Tuščios būsenos — sąžiningos ir kviečiančios (doktrinos §18 „steigėjo
  momentas“), ne kaltinančios.
- **Mobile-first:** telefone viskas veikia kaip app (bottom nav, safe-area,
  kortelės), ne kaip suspaustas desktop. Jau yra: `BottomNav`, mobile-first
  guard testai.
- **Neapkrauti darbuotojo** (VISION §14.4): paprastumas = adopcijos sąlyga.
  Jokių privalomų 47 laukų.

---

## 3. Funkcijų sujungimo principas (vidiniai duomenų taškai)

Viduje konkretūs ryšiai, vartotojui nematomi. Kiekvienas ryšys žemėlapintas į
ESAMĄ kanoninį modelį arba pažymėtas `vision only`. **Naujos lentelės
nesiūlomos.**

| Ryšys | Kanoninis modelis šiandien | Statusas |
|---|---|---|
| Dokumentai ↔ worker readiness | Dokumentų lentelių DB dar NĖRA (patikrinta migracijose) | `vision only` |
| Readiness ↔ marketplace matomumas | `workers.availability_status`, `profile_completeness`, `trust_score`; visibility per RLS (doktrinos §4 default-closed) | `now (Phase 3)` (signalai), pilnas readiness skaičiavimas — `vision only` |
| Skills ↔ player card | `worker_skills` (+ `source`, `verified`), `profile_skill_claims` (owner-only laisvos etiketės), `lib/player-card/player-card.ts` | `now (Phase 3)` |
| Work journal ↔ evidence score | `journal_entries` + `journal_entry_confirmations` (append-only, hash-chain, §3 doktrina); confidence signalai per doktrinos §15 | `now (Phase 3)` (įrašai+patvirtinimai LIVE); aggregate score — `M4+` |
| Company need ↔ match cards | `customer_requests` (VIENINTELIS demand intake, §17) → žmogaus vykdomas matching Phase 3; dormant `job_demands`/`matches` schema — vėlesniam varikliui | `now (Phase 3)` žmogui; variklis — M3+/`M4+` |
| Country requirements ↔ compliance status | modelio nėra | `vision only` |
| Accommodation ↔ project readiness | `projects.housing_provided` (bool) — daugiau nieko | `vision only` |
| Communication ↔ follow-up / next action | `conversations` / `conversation_participants` / `conversation_messages` (kanoninis MESSAGING); next-action — UI logika | `now (Phase 3)` (žinutės); follow-up engine — `vision only` |
| Agency worker pool ↔ employer demand | `agency_workers` (N:M) + `customer_requests` (`kind='agency_offer'`) | `now (Phase 3)` (struktūra yra; rodymas — žmogaus matching) |
| Trust score ↔ visibility | `workers.trust_score`, `companies.trust_score` (M0 stub, dabar 0); JOKIO fake verified claim — rodoma tik tai, kas pagrįsta | dabar tik sąžiningi signalai; svertinis trust — `M4+` |

**Užrakintas kanoninis modelis (doktrinos §17 + konvergencija):**
DEMAND = tik `customer_requests` (`pilot_drafts` dormant/folded; `leads` =
atskiras anoniminis pre-auth funnel, NE demand path). ORG = `organizations` +
`engagement_contexts` + `relationship_types`. MESSAGING = `conversations*`.
`projects.organization_id` = kanoninis FK.

---

## 4. Profilis / Player Card

Sporto varžybų ir žaidėjo kortelės principas visam produktui: darbuotojas — ne
sausas CV, o aiški player card.

Kortelės turinys (kiekvienas laukas — su šaltiniu):

| Laukas | Šaltinis | Statusas |
|---|---|---|
| Avataras | profilis (storage) | `now` (jei įkelta) |
| Pagrindinė profesija (multi-profesijos, skills profession-scoped) | `worker_professions` (`is_primary`), `profession_skills` | `now (Phase 3)` |
| Šalys, kur gali dirbti | `workers.preferred_countries`, `current_location_country` | `now (Phase 3)` |
| Kalbos | `profiles.locale` + (pilnas kalbų sąrašas — modelio nėra) | dalinai; pilnas — `vision only` |
| Įgūdžiai (su patvirtinimo lygiu) | `worker_skills.source` + `verified`; `profile_skill_claims` (Level 0) | `now (Phase 3)` |
| Patirties lygis | `workers.experience_years` | `now (Phase 3)` |
| Dokumentų parengtis | modelio nėra | `vision only` |
| Darbo įrodymai | `journal_entries` + confirmations | `now (Phase 3)` |
| Availability | `workers.availability_status`, `available_from` | `now (Phase 3)` |
| Pageidaujamas įkainis | `workers.salary_min_eur` / `salary_max_eur` | `now (Phase 3)` |
| Trust/readiness signalas | tik pagrįsti signalai (patvirtinimų skaičius ir pan.) | sąžiningi skaitliukai `now`; svertinis — `M4+` |

**Sąžiningumo taisyklė (privaloma):** kiekvienas faktas pažymėtas, kas yra
**self-declared (Level 0, įsk. CV importą)**, kas **supported by evidence**,
kas **confirmed** (manager/client/document). Negalima fake score. Jei preview —
taip ir pažymėta (`preview` / `concept`, niekada „demo“). Esamas
`WorkerPlayerCard` (4 sąžiningi skaitliukai, 0 = paprastas 0) — teisingas
pagrindas; FIFA-stiliaus `PlayerCard` showcase su OVR žiedu = koncepcinis
preview, galutinė estetika — **TASK 07** po owner vizualinio užrakto.

---

## 5. Darbuotojo kelias

Landing → registracija/login → role pasirinkimas (person-first, multi-role:
worker/company/agency/customer; worker = universali bazė; rolės keičiamos ir
papildomos per `profile_roles`, niekas neužrakina „tu esi tik X“) → minimalus
profilis (text-first) → skills/patirtis (suggestions → patvirtinimas) →
dokumentai (`vision only`) → availability → work search status → work journal
(įrašai realiu laiku, telefonu, vietoje) → pasiūlymai → match kortelės (Phase 3
— žmogaus parinkti) → komunikacija (`conversations`) → darbo pradžia →
įrodymai po darbo (manager confirm) → reputacija (verified proofs kaupiasi) →
grįžimas į marketplace su stipresne kortele.

Visi žingsniai po minimalaus profilio — **neprivalomi**; kiekvienas atrakina
daugiau matomumo/vertės, ir tai žmogui parodoma kaip „ką gali daryti toliau“,
ne kaip klaida.

---

## 6. Įmonės kelias

Company profile (`companies`; verification ladder per
`admin_set_company_verification`, niekada nefabrikuojamas „verified“) →
poreikio sukūrimas per **`customer_requests`** (profesija/miestas/šalis/data/
trukmė, valandinis biudžetas, dokumentų reikalavimai, kalbos, urgency — per
`payload`; accommodation — `vision only`) → galimų darbuotojų/brigadų peržiūra
(Phase 3: žmogaus vykdomas matching — demand šalia verified workers, žmogus
sprendžia) → komunikacija → sutarties/kito veiksmo inicijavimas (offline,
DI-vedamas; ne fake checkout) → feedback po darbo (manager/client confirm →
worker reputacija).

Įmonės pažadas (VISION §15): „Padėsime greičiau rasti, patikrinti ir valdyti
reikalingus žmones.“ Pirmame pardavimo pokalbyje — konkreti vertė
(`PHASE3_value_and_sales.md`), niekada „pasaulio darbo rinkos AI OS“.

---

## 7. Agentūros kelias

Recruitment/staffing — **core pillar**, ne priešas; bet su kontroliuojamu
matomumu ir pasitikėjimo logika:

- **Agency worker pool:** `agency_workers` (N:M roster) — agentūra tiesiogiai
  mato tik SAVO pool, ne visą rinką. Platesnė rinka — per Labourmarket.ai
  pasitikėjimo logiką (doktrinos §4 default-closed).
- **Darbuotojų parengtis:** pool'o readiness vaizdas iš tų pačių signalų kaip
  §4 kortelė. `now (Phase 3)` — sąžiningi skaitliukai.
- **Bulk upload:** `vision only`.
- **Pozicionavimas įmonių poreikiams:** `customer_requests` su
  `kind='agency_offer'` — kanoninis kelias. `now (Phase 3)`.
- **Visibility control:** default-closed; grants kaip įrašai (doktrinos §4.3).
- **Score/readiness threshold** prieš siūlant: `vision only` (kol nėra
  svertinio readiness).
- **Komercinė kontrolė:** agentūra negali apeiti pasitikėjimo ir dokumentų
  sluoksnio — visi agentūros darbuotojai eina per tą patį proof spine.

---

## 8. Marketplace v1

Ne skelbimų lenta. Sudedamosios:

- worker supply (`workers` + kortelės §4),
- agency supply (`agency_workers`),
- company demand (`customer_requests`),
- project demand (`projects` + dormant `job_demands` — variklis vėliau),
- match cards (Phase 3 — žmogaus parinkti; dormant `matches` schema lieka
  varikliui M3+),
- filtrai: readiness/country/legal (`legal` — `vision only`), rate fit
  (`salary_*` vs biudžetas), availability fit, accommodation fit
  (`vision only`), document readiness (`vision only`), trust/risk indikatoriai
  (tik pagrįsti),
- **clear next action** prie kiekvienos kortelės.

**Marketplace v1 = Phase 3 žmogaus vykdomas matching: realus, mažesnis,
veikiantis.** Žmogus (DI/operatorius) mato demand šalia verified workers ir
sprendžia; kiekvienas rankinis match maitina feedback loop. Joks automatinis
„variklis“ nevaidina veikiančio.

---

## 9. Dokumentai ir compliance

Esmė: sistema padeda nepakliūti į problemas su institucijomis.

Dokumentų tipai (struktūra): CV; A1; employment contract; posted worker
package; certificates; ID/identity status; expiration dates. Statusai:
missing / ready / expiring / blocked. Audit trail — append-only (doktrinos §3).

**Būsena šiandien: dokumentų lentelių DB NĖRA → visas šis ramstis =
`vision only`** (išskyrus CV-as-text importą per confirmed-suggestions, kuris
jau veikia kaip Level 0 įgūdžių šaltinis). Kai bus kuriamas modelis (atskiras,
owner-patvirtintas sprintas su migracijomis) — privalomai pagal doktrinos §2.3
(original_text/original_language), §3 (append-only, server-side timestamps),
§4 (default-closed), §16 (migracijų konvencija).

Country-specific requirements — visoms 9 launch rinkoms kaip struktūra
(`vision only`); NL Wadi rizika — pavyzdys, kodėl šito reikia; Belgium —
`future`, neišstumia launch rinkų.

---

## 10. Work Journal / Evidence

Jau LIVE production (manager-confirm loop): ką dirbo, kada, kur, kokius
įgūdžius panaudojo (`journal_entries`, profession-templates, metrics); ar yra
vadovo/kliento patvirtinimas (`journal_entry_confirmations`); ar tik
self-declared (aiškiai pažymėta). Append-only + hash chain + default-closed —
proof spine šventas (ROADMAP guardrail).

Kaip papildo player card: patvirtinti įrašai → evidence skaitliukai → įgūdžio
lygis kyla self-declared → journal-backed → manager-confirmed. Kaip kelia
pasitikėjimą marketplace: verified proofs = vienintelis tikras trust šaltinis;
jokio nupirkto reitingo.

---

## 11. Trust / Reputation sluoksnis

Pasitikėjimo objektai: worker, company, agency, project, document
(`vision only`), evidence, communication. Payment/reliability status —
`vision only`. Scam-risk memory — `vision only`.

Privaloma: **negalima rodyti klaidinančio „verified“, jei nėra įrodymo**
(VISION §10 — spalvos negali meluoti; doktrinos §7 AI-never-lies). Trust
signalai šiandien = pagrįsti skaitliukai (patvirtinimų kiekis, evidence
kiekis, company verification ladder būsena). Svertinis trust score — `M4+`,
tik ant verified duomenų.

---

## 12. Gyva darbo rinkos vizualizacija

Live labor market map / command center vizija (VISION §11 — sluoksniuotas
žemėlapis): worker pools pagal šalį/profesiją/readiness; company demand;
urgent needs; available teams; assigned žmonės; missing documents
(`vision only`); risk areas (`vision only`); accommodation (`vision only`);
movement flows (pvz. LT→NL, LT→DK); rates/market heat; marketplace activity;
AI suggestions — aiškiai pažymėtos kaip suggestions (`M4+`).

**Privaloma:** real vs preview duomenų aiškus atskyrimas, be fake live
activity. Esamas landing `LiveMap` + `MarketCounters` + ticker — koncepcinis
preview su sąžiningu „PRE-ALPHA · Activity preview“ ženklinimu — teisinga
kryptis. Premium sporto/scouting/command-center energija — galutinė estetika
per **TASK 07** (čia tik low-fidelity preview).

---

## 13. Asmeninė valdymo erdvė

„Kosminio laivo“ / valdymo kabinos principas — **TASK 07 kryptis; čia tik
dokumentuojama + leidžiamas low-fidelity preview** („low-fidelity preview, bus
pakeistas TASK 07“).

Perstatomi blokai: Mano profilis / dokumentai (`vision only`) / pasirengimas /
darbai / pasiūlymai / marketplace / įmonė / darbuotojai / komunikacija /
rizikos (`vision only`) / AI asistentas (`M4+`) / kiti veiksmai.

- **Desktop** = platesnis command center (lanes, boards).
- **Mobile** = app kortelės, bottom nav (jau yra), aiškūs statusai, greiti
  veiksmai.
- **Layout preferences ateičiai:** saved layout, reorderable cards, hide/show —
  `vision only` (jokios DB struktūros dabar).

Šiandienos pagrindas: role-aware dashboard (`WorkCard`, `DashboardNextAction`,
`JourneyRail`, feature-availability katalogas) — tai pirmas sluoksnis, kurį
TASK 07 pakeis vizualiai, bet ne logiškai.

---

## 14. AI Assistant (M4+ scope)

AI = pagalbininkas, ne fake sprendimų priėmėjas (doktrinos §7 + §7.1, VISION
§9 — 6 agentų tipai, dokumentuoti, neimplementuoti):

**Gali (M4+):** padėti pildyti profilį; ištraukti skills iš teksto (per
suggestion → human confirm pipeline — rule-based versija jau veikia);
paaiškinti trūkstamus dokumentus; pasiūlyti match su „kodėl“; paruošti laišką
(NESIUNČIA be leidimo); padėti su paieška/calendar/follow-up.

**Negali (visada):** fake patvirtinti; fake verify; savarankiškai vykdyti
rizikingų veiksmų; kurti netikrų duomenų; siųsti masinių laiškų be leidimo.

Visi 6 agentų tipai — tik po to, kai platforma įrodyta su realiais klientais;
mokosi tik iš **verified Work Proof** duomenų.

---

## 15. Communication / Follow-up

Kanoninis MESSAGING = `conversations` / `conversation_participants` /
`conversation_messages` (`now (Phase 3)`). Worker↔company; agency↔company;
internal team; project communication; system notifications (tokens, ne
tekstas — doktrinos §2.2.3); follow-up engine ir next action virš žinučių —
`vision only`; chat/email/WhatsApp/SMS kanalai — `vision only`.

Multilingual komunikacija = safety + convenience: visas author-to-viewer
turinys rodomas žiūrinčiojo kalba, originalai saugomi (`original_text` +
`original_language`), vertimai NE DB (doktrinos §2). Legacy M0 `threads`/
`messages` — stub, nenaudoti (kanoninis kelias tik `conversations*`).

---

## 16. Visual / Brand kryptis

Premium sports/scouting/draft energija; tamsus navy/graphite/black pagrindas;
restrained neon/electric akcentai; gold/silver/blue/green statusai (spalvos
niekada nemeluoja — žalia tik kai realiai patvirtinta); no generic SaaS; no
boring admin tables kaip primary experience; cards, live boards, player
profiles, market maps; mobile app feel.

Remtis ESAMA design token sistema (token-first colors, dark/light, motion
tokens — `docs/DESIGN_TOKENS.md`, `premium-design-map-v1.md`) ir typefaces
pagal TYPOGRAPHY DECISION LOCK (DI, 2026-06-12, research-backed): Bricolage
Grotesque (display/headings), Inter (body/UI — ekrano įskaitomumo tyrimai
palaiko dedikuotą UI sans body tekstui), JetBrains Mono (skaičiai/etiketės),
Instrument Serif — TIK akcentas (hero antraštės, pull quotes, founder-moment
tuščios būsenos, min ~28px; niekada body/UI tekstui — single-weight condensed
display šriftas, skirtas tik dideliems dydžiams). Šaltinis:
`apps/web/tokens/typography.ts`; guard — `lib/guards/design-tokens.test.ts`.
**Brand lieka Labourmarket.ai** be atskiro owner patvirtinimo. Galutinis
living-arena look — TASK 07 po vizualinio užrakto.

---

## 17. Public website / išorė

Landing (yra); worker page (`/for-workers`); employer page (`/for-companies`);
agency page (`/for-agencies`); marketplace preview (`vision only` kaip atskiras
puslapis); live market preview (landing `LiveMap` — koncepcinis preview);
trust/documents explanation; how it works; pricing placeholder be fake payment
(`/pricing` — be checkout); contact/early access (`leads` pre-auth funnel —
vienintelis leistinas anoniminis kelias); legal honest copy (`/legal/*`).

**Privaloma:** no fake customers, no fake metrics, no fake live marketplace.
Visa copy per slug→JSON (`messages/{locale}.json`); žodis „demo“ —
draudžiamas; leidžiama `preview` / `concept` / `not live yet`.

---

## 18. Admin / control center

Users; companies (verification ladder — yra); agencies; documents overview
(`vision only`); marketplace needs (`customer_requests` peržiūra); reported
risks (`vision only`); content/copy controls; system health. Esami admin
routes (`/dashboard/admin/*`) — pagrindas.

**No overcomplicated manual approval by default** (doktrinos §18 + VISION
§14.1): manual controls tik kur reikia risk/legal/commercial saugumui
(pvz. company verification — jau owner-gated).

---

## 19. Unikalus funkcijų sąrašas (be dubliavimo)

| # | Funkcija | Kur priklauso | Statusas |
|---|---|---|---|
| 1 | Identity/profile (1 žmogus = 1 `profiles`) | §4, §5 | `now (Phase 3)` |
| 2 | Multi-role (worker/company/agency/customer, `profile_roles`) | §5 | `now (Phase 3)` |
| 3 | Text-first / CV-first startas (suggestions → confirm) | §5 | `now (Phase 3)` |
| 4 | Worker readiness (availability, completeness, sąžiningi signalai) | §4 | `now (Phase 3)`; svertinis readiness — `vision only` |
| 5 | Company readiness (verification ladder) | §6 | `now (Phase 3)` |
| 6 | Agency worker pool (`agency_workers`) | §7 | `now (Phase 3)` |
| 7 | Documents (tipai, statusai, expirations) | §9 | `vision only` |
| 8 | Compliance / country requirements (9 rinkos) | §9 | `vision only` |
| 9 | Skills (5 lygiai, profession-scoped) | §4, §10 | `now (Phase 3)` |
| 10 | Evidence / Work Journal (manager confirm) | §10 | `now (Phase 3)` — LIVE |
| 11 | Marketplace (supply+demand kortelės) | §8 | `now (Phase 3)` — žmogaus vykdomas |
| 12 | Matching variklis (score+reasons, dormant schema) | §8 | M3+; AI — `M4+` |
| 13 | Communication (`conversations*`) | §15 | `now (Phase 3)` |
| 14 | Notifications (event tokens) | §15 | dalinai; pilnas — `vision only` |
| 15 | Live market visualization (sluoksniuotas žemėlapis) | §12 | preview `now`; galutinis — `TASK 07` |
| 16 | Personal command center | §13 | pirmas sluoksnis `now`; galutinis — `TASK 07` |
| 17 | Player card / FIFA estetika | §4 | sąžiningas `WorkerPlayerCard` `now`; estetika — `TASK 07` |
| 18 | AI assistant (6 agentų tipai) | §14 | `M4+` |
| 19 | Calendar booking | §15 | `vision only` |
| 20 | Trust/reputation (svertinis) | §11 | signalai `now`; score — `M4+` |
| 21 | Search/discovery agents | §14 | `M4+` |
| 22 | Admin / control center | §18 | `now (Phase 3)` (esami routes) |
| 23 | Public website (landing + role pages + legal) | §17 | `now (Phase 3)` |
| 24 | Mobile app feel (bottom nav, kortelės) | §2, §13 | `now (Phase 3)` |
| 25 | Monetization (fee, plans — be checkout) | — | `future` (owner-gated; jokio billing be leidimo) |
| 26 | Integrations (email/WhatsApp/SMS, external boards) | §15 | `vision only` |
| 27 | Accommodation / mobilization | §9 | `vision only` |
| 28 | Payment reliability / scam-risk memory | §11 | `vision only` |
| 29 | Safety/honesty guards (copy + schema vitest guardai) | visur | `now (Phase 3)` — plečiama šiame sprinte |
| 30 | Multilingual author→viewer translation | §15 | infra `now`; pilnas vertimo sluoksnis — `vision only` |

---

## 20. Sequencing (privalomas skyrius)

1. **Phase 3 (dabar):** pirmas realus klientas per `customer_requests` →
   **žmogaus vykdomas matching** (demand šalia verified workers, žmogus
   sprendžia) → feedback loop iš kiekvieno rankinio match → greiti GREEN
   pataisymai. (Atitinka `PHASE3_first_customer_plan.md` slices 3.1–3.6.)
2. **Tada TASK 07:** living-arena UI (worker cockpit, manager super-league
   coach, FIFA-card estetika) — TIK po owner vizualinio užrakto. Iki tol —
   low-fidelity preview komponentai, kiekvienas pažymėtas „low-fidelity
   preview, bus pakeistas TASK 07“.
3. **Tada M4+:** AI agentai / automatizacija — tik kaip decision support, ant
   verified Work Proof duomenų, su žmogaus patvirtinimu visiems rizikingiems
   veiksmams.

Lygiagrečiai (iš ROADMAP, nekonfliktuoja): Phase 4 proof engine gilinimas
(CV import Level 0, 5-lygių ladder, skill auto-detect iš journal) ir Phase 5
matching variklis ant dormant schemos — abu eina po Phase 3 įrodymų, AI
sluoksnis visada paskutinis.

**Launch rinkos:** LT, LV, EE, NL, DE, DK, NO, SE, PL — devynios, lygia teise
(locale set užrakintas doktrinos §2.4; routing šiandien aktyvuotas lt+en —
owner P0 sprendimas, JSON failai visoms 10 yra). Belgium — `future`, neišstumia
launch rinkų iš jokios struktūros.

---

## 21. Open conflicts / owner decision needed

Žingsnio 0 metu rasti neatitikimai. **Nė vienas neblokuoja šio sprinto kodo
scope** (docs + saugus UI be migracijų). Repo dokumentai laimi iki owner
sprendimo.

| # | Konfliktas | Kas ką sako | Siūlymas | Blokuoja kodą? |
|---|---|---|---|---|
| C1 | Rolių sąrašas | VISION §7: 7 vaidmenys (su team_leader, hr_personnel); schema + doctrine §5.2: fiksuotas RBAC `worker/company/agency/customer/admin`, papildomos rolės — catalogue `preparing/hidden` eilutės | Palikti schema kaip yra; team_leader/hr — kaip org pozicijos (§5.4) arba catalogue rows vėliau; dokumentas seka schema | NE |
| C2 | „Demo“ žymėjimas | `CLAUDE.md` (Universal Architecture sekcija): placeholders „visually marked `Sample` / `Demo`“; doktrinos §18 + šis planas: „demo“ draudžiamas | Laikyti CLAUDE.md frazę pasenusia (§18 vėlesnis ir binding); markeriai — `preview` / `concept` / `not live yet`; live copy jau švari (patikrinta: „demo“ LT/EN messages nėra); vidinis failo vardas `demo-chip.tsx` → pervadintas į `preview-chip.tsx` šiame PR | NE |
| C3 | TASK 07 vieta sekoje | Šis handoff: Phase 3 → TASK 07 → M4+; ROADMAP: Phase 3 → Phase 4 (proof engine) → Phase 5 (matching) → Phase 6 (AI) | Suderinama: TASK 07 = UX sluoksnis, gali eiti lygiagrečiai Phase 4/5 po vizualinio užrakto; AI (M4+/Phase 6) visada paskutinis. Owner patvirtina, ar TASK 07 eina prieš Phase 4, ar šalia | NE |
| C4 | Doktrinos §13 nuoroda | `PHASE3_first_customer_plan.md` (slice 3.4) remiasi „PLATFORM_DOCTRINE §13“ (pricing principai), bet doktrinoje §13 NĖRA (sekcijos šoka 10→15) | Owner/architect įrašo §13 (pricing principus) į doktriną arba pataiso nuorodą; pricing sprendimai ir taip owner-gated | NE |
| C5 | Stale schema inventory | `SCHEMA_INVENTORY.md` (2026-05-21) sako „NO organizations table“; konvergencija (0013+) jau sukūrė `organizations`/`engagement_contexts`/`relationship_types` | Atnaujinti SCHEMA_INVENTORY atskiru docs PR (pažadas faile: „if schema changes, update this file in the same PR“ — nebuvo įvykdytas) | NE |
| C6 | „Pilot“ vidiniai pavadinimai | Doktrinos §18: jokio pilot framing produkte; kode likę vidiniai pavadinimai (`PilotRequestButton`, `/admin/pilot-telemetry`, `pilotBackboneNote`) — user-facing copy jau išvalyta | Hygiene: palaipsniui pervadinti vidinius identifikatorius; ne šio sprinto scope | NE |

**Missing sources:** nerasta NĖRA — visi 4 privalomi šaltiniai
(`PROJECT_VISION.md`, `PROJECT_ROADMAP.md`, `PLATFORM_DOCTRINE.md`,
`PHASE3_first_customer_plan.md`) rasti `docs/` ir perskaityti pilnai.

---

## Įgyvendinimo planas po šio dokumento (šio sprinto saugus scope)

Prioritetas: **dokumentas + Phase 3 aiškumas + no-fake/no-migration guardai >
bet koks UI perrašymas.**

1. ✅ Šis dokumentas (pirmas commit — tik docs).
2. Guard scriptas (vitest, `apps/web/lib/guards/`): draudžiami terminai
   produkto copy — „demo“, fake-verified/fake-live claims; LT/EN messages.
3. Public landing copy atnaujinimas į didžiosios vizijos kryptį — TIK per
   slug→JSON, be naujų hardcoded tekstų.
4. `LiveMarketPreview` — esamo `LiveMap` bloko sąžiningas low-fidelity
   įrėminimas (`preview` / `not live yet`).
5. `WorkerPlayerCard` sustiprinimas — low-fidelity, „bus pakeistas TASK 07“.
6. `PersonalCommandCenterPreview` — low-fidelity, „bus pakeistas TASK 07“.
7. Mobile-first kortelės — esamų blokų patikra, ne perrašymas.
8. Audit markdown: kas padaryta, kas liko (TASK 07 / `vision only` sąrašai).

Neliečiama šiame sprinte: DB (jokių migracijų), env/secrets, DNS, billing,
brand, senas repo/deployment, TASK 07 galutinis UI.
