# LabourMarket.ai — pilnas UX / IA / Workflow auditas v1 (real-user-workflow-rebuild)

**Data:** 2026-07-28 · **Šaka:** `feat/real-user-workflow-rebuild-v1` · **Bazė:** `main@41992904`
**Metodas:** 5 lygiagretūs architektūros auditai (chat/AI, navigacija/IA, laikas/kalendorius,
org/workspace kontekstas, darbo moduliai) + realaus naudotojo testo grįžtamasis ryšys +
ankstesnių auditų (LOOP 0–8) ir kanoninės vizijos sugretinimas.

**Verdiktas vienu sakiniu:** naudotojo testo pastabos nėra pavienės UX klaidos — jos visos
kyla iš šešių sisteminių priežasčių, kurių bendra šaknis: **duomenų sluoksnis jau yra
vientisas ir multi-tenant, o naudotojo sluoksnis vis dar suskaidytas į modulius be aktyvaus
darbo konteksto.**

---

## 1. Naudotojo testo pastabų → sisteminių priežasčių žemėlapis

| Naudotojo pastaba | Sisteminė priežastis (žr. §2) |
|---|---|
| „Darbo planavimas nėra natūralus" | RC-4 (laikas suskaidytas), RC-5 (moduliai nesujungti) |
| „Funkcijos per daug išmėtytos" | RC-2 (modulinė IA: ~40+ paskirties taškų, 2 shell'ai) |
| „Galvoju apie darbą, sistema verčia galvoti apie modulius" | RC-2 + RC-5 |
| „Neaišku, kur ieškoti funkcijų" | RC-2 (asimetriškas pasiekiamumas tarp shell'ų) |
| „Dirbant su keliomis įmonėmis lengva pasimesti" | RC-1 (nėra aktyvaus workspace konteksto) |
| „Nėra aiškaus aktyvios darbo aplinkos konteksto" | RC-1 + RC-6 (pranešimai be org dimensijos) |
| „Sistema turi neleisti planuoti neįmanomo darbo" | RC-4 (konfliktų aptikimas — fasadas) |
| „Pokalbis turi tapti pagrindiniu darbo centru" | RC-3 (chat aptarnauja tik darbuotoją) |

---

## 2. Šešios sisteminės priežastys (root causes)

### RC-1 — Frontend'as neturi aktyvaus workspace konteksto, nors DB jau multi-tenant

DB sluoksnis teisingas: `organizations` + `engagement_contexts` + `relationship_types`
(doktrina §5.5) pilnai išreiškia „vienas žmogus ↔ kelios organizacijos". Bet:

- `profiles.active_organization_id` migracija (`20260714210000_company_memberships_v1.sql`)
  **NEAPLIKUOTA** (`docs/APPLIED_LEDGER.md` „Deferred") → `pointerAvailable=false` →
  org switcher'is (`components/app/role-switcher.tsx:267-325`) **niekada nerenderinamas**.
- `activeOrganizationId` skaito **0 duomenų kelių** — tik 9 failai, visi arba switcher'io
  vidus, arba guard testai. Joks puslapis, joks server action jo nenaudoja.
- Kontekstas resolvinamas **tik company identity** (`app/[locale]/dashboard/layout.tsx:113-134`);
  darbuotojas, dirbantis 3 įmonėse, nemato jokio org pavadinimo niekur.
- Legacy trumpinys `companies.profile_id UNIQUE` (`getOwnCompany()`,
  `lib/company/company-setup.ts:147-157`; `callerCompanyId()`, `lib/projects/projects.ts:99-111`)
  struktūriškai užrakina „viena įmonė vienam žmogui": profilio puslapyje N valdomų įmonių
  **visos** veda į tą patį `/dashboard/company`, kuris visada resolvina seniausią legacy įrašą
  (`profile/page.tsx:544-556`).
- Visi sąrašai rodo **RLS uniją be org žymių**: žurnalas (`journal/page.tsx:383` — visi
  engagement'ai viename sraute, `journal-entry-row.tsx` be jokios org nuorodos), užduotys
  (`lib/tasks/tasks.ts:118-129`, `work_tasks` net neturi org stulpelio), projektai
  (`lib/projects/projects.ts:39-58` be org filtro ir be org žymės kortelėje), žinutės
  (`conversations` be org stulpelio), pranešimai, bookings, assets, review queue.
- Per-org teminio akcento nėra; egzistuojantis šablonas — `AdminContextBanner`
  (`components/app/admin-context-banner.tsx`) — vienintelis realus „režimo" indikatorius.

### RC-2 — Modulinė IA: ~40+ paskirties taškų, 2 navigacijos sistemos, asimetriškas pasiekiamumas

- **44 realūs dashboard paviršiai** (guard `lib/guards/route-truth-map.test.ts`), ~19-21
  modulio kortelė, 2 shell'ai (conversation vs Advanced), 2 nav sistemos —
  `SIMPLE_SHELL_OWNED_NAV_IDS` (`lib/config/navigation.ts:153-164`) pačiame kode pripažįsta
  „two navigation systems bolted together".
- Asimetrija: Žinutės+Kalendorius pasiekiami 1 paspaudimu simple shell'e, bet **0 nav vietų**
  Advanced; Žurnalas+Žemėlapis+Tinklas yra Advanced nav'e, bet **0 vietų** simple shell'e.
  Pokalbio ekranas (numatytasis po login) **neturi nuolatinės nuorodos į žurnalą** —
  pagrindinį darbuotojo veiksmą.
- `/dashboard/advanced` — privaloma tarpinė stotelė daugumai funkcijų (grid arba Ctrl+K).
  Užduoties sukūrimas darbuotojui: 3 puslapiai + 2 disclosure paspaudimai.
- 5 agregatoriai sumuoja tą patį spine (activity, assist, reports, status strip, bell).
- Gyvi inbound link'ai į DUPLICATE_DRIFT/stub maršrutus: `current-space-header.tsx:37-38`
  → `/dashboard/agency` (stub) ir `/dashboard/buyer` (drift); `/dashboard/assistant`
  klasifikuotas REAL, nors yra redirect'as; `marketplace_hub.primaryRoute` rodo į stub'ą.

### RC-3 — Pokalbis yra darbo centras tik darbuotojui, ir tik iš dalies

- **Visi 10 `company.*`/`agency.*` vykdiklių** (PR-E #886) turi schemas, executor'ius ir
  375 eilučių testų — bet **0 UI iškvietimų**. Darbdavys chate gauna darbuotojo chip'us
  ir `blockedNoWorker`.
- Dispatch grandinė nežino org konteksto: `ExecCtx = {locale}` (`executor-contract.ts`),
  jokio workspace parametro; org resolvinamas kiekviename server action atskirai per
  legacy vieno įrašo trumpinį.
- `calendar-view`, `reminder`, `translate`, `write-employer` intent'ai — tik tekstinės
  užuominos be jokio realaus skaitymo/veiksmo.
- Nėra `log-work` starter chip'o — pagrindinis srautas atrandamas tik įspėjus teisingą sakinį.
- Pokalbio persistencija — neaplikuota RED migracija (`docs/proposals/assistant-transcript-v1/`);
  perkrovimas = viskas dingsta.

### RC-4 — Laikas suskaidytas, konfliktų prevencija — fasadas

- Kanoninis kalendorius (`/dashboard/planning`) yra teisinga architektūra (gryna projekcija,
  guard'as draudžia antrą kalendorių), bet **aplikuotos W6/W7 lentelės — `worker_absences`
  ir `project_stages` — į jį neįjungtos** (6 šaltiniai iš ~11 datuotų). Kalendoriaus
  kontrakto dokumentas (`docs/launch/canonical-calendar-contract-v1.md`) pasenęs — teigia,
  kad šių modelių „nėra".
- **Žurnalo `work_date` — EAV tekstas** (`journal_entry_metrics.value_text`), o kalendorius
  žymi įrašus pagal `created_at` — t. y. rodo, KADA įrašyta, ne KADA dirbta.
- Konfliktų aptikimas: vienintelis realus mechanizmas — `if exists` guard'as booking-accept
  RPC viduje (tik booking×booking, tik accept metu, be EXCLUDE constraint'o, lenktyniaujantis).
  Kliento pusės `detectConflicts` **struktūriškai nepasiekiamas**: `project` šakai reikia
  `roleContext:"assigned"`, kurio serveris niekada negamina (`planning.ts:211` hardcode
  `"managed"`); `booking` šaką užbėga DB guard'as.
- **Patvirtintos atostogos neblokuoja booking'o** (ir atvirkščiai) — labiausiai matoma
  korektiškumo skylė.
- Nėra darbuotojo pusės datuoto priskirtų projektų skaitymo; nėra „kas kur dirba šią
  savaitę" vaizdo; visi šaltiniai — tik datos (be valandų).

### RC-5 — Moduliai nesujungti į vieną darbo eigą

- **Žurnalas ↔ projektas nematomas**: `journal_entries.project_id` egzistuoja ir
  auto-link'inasi, bet niekur nerodomas, neredaguojamas, neeksportuojamas; composer'is
  neturi projekto pasirinkimo (tik engagement).
- **Commercial ↔ projektas miręs UI**: `lib/commercial/commercial.ts:41` net neselect'ina
  `project_id`; UI niekada jo neužpildo.
- **Asmens puslapis — aklavietė** (`people/[workerId]/page.tsx` — 0 `Link` importų).
- **Du nepriklausomi projekto kūrimo keliai** su skirtinga validacija
  (`lib/projects/actions.ts:63-74` vs `lib/company/project-context-actions.ts:60-90`).
- **4 rašymo idiomos, 4 filtrų idiomos, 3 „unavailable" copy šeimos, 74 skirtingi empty
  state** — kiekvienas modulis elgiasi savaip.
- Užduotys: tik self-assign (RPC neturi `p_assignee`), be priklausomybių, be stage ryšio.
- „Pirkimai" kaip modulis neegzistuoja — stand-in yra `finance_records` be eilučių,
  tiekėjo, patvirtinimo ar žurnalo ryšio.

### RC-6 — Pranešimai ir paieška be konteksto dimensijos

- Spine (8 signalai, `lib/notifications/spine-signals.ts`) neturi org dimensijos; yra
  „Switch to {role}" CTA, bet nėra „Switch to {org}".
- Skaitymo būsena — tik „aplankei href → dingo"; per-org filtravimo nėra.

---

## 3. Kas jau TEISINGA ir ką privaloma išsaugoti

1. **Kanoninis kalendorius kaip gryna projekcija** + guard'as prieš antrą kalendorių —
   Time Engine bus jo plėtinys, ne pakaitalas.
2. **Kanoninė dispatch grandinė** (registry → authorize → schema → confirm → executor) —
   chat plėtra eina TIK per ją.
3. **`organizations` + `engagement_contexts` spine** — Workspace = plonas sluoksnis virš jo.
4. **Route truth map guard'as** ir DUPLICATE_DRIFT „gali tik mažėti" taisyklė.
5. **Vienas globalus AuthContext, server-authoritative** — workspace būsena jungiasi čia,
   ne į naują store'ą.
6. **Sąžiningo degradavimo šablonas** (`ok|unavailable|managers-only|error`) — visi nauji
   skaitymai jį paveldi.
7. **Guard testų kultūra** — kiekviena nauja taisyklė gauna vitest guard'ą tame pačiame PR.

---

## 4. Analogiškų spragų sąrašas (tų pačių principų pažeidimai kitur)

| # | Spraga | Vieta | Priežastis |
|---|---|---|---|
| A1 | Owned-orgs sąrašas grąžina `agency`+`team` tipo org kaip „įmones" | `lib/company/owned-organizations.ts:57-61` | RC-1 |
| A2 | Assets sąrašas turi `organizationId` modelyje, bet niekada nerodo | `components/app/assets-panel.tsx` | RC-1 |
| A3 | Review queue kortelės be org | `lib/journal/review-queue.ts:52-58` | RC-1 |
| A4 | Workforce planning sąmoningai cross-org be per-row atribucijos | `lib/workforce/workforce.ts:156-190` | RC-1 |
| A5 | `team_enquiries` dubliuoja booking datų formą be guard'o ir be kalendoriaus | `20260716131000_team_enquiries_v1.sql` | RC-4 |
| A6 | `customer_requests` laikas — laisvas tekstas + JSONB, neprijungiamas prie kalendoriaus | `0028:39-40`, `structured-demand-v2.ts` | RC-4 |
| A7 | Booking pasiūlymai be galiojimo scheduler'io — `proposed` amžinai | `docs/APPLIED_LEDGER.md:305` | RC-4 |
| A8 | `project_stages.responsible_engagement_id` — miręs stulpelis | `20260718140000:33` | RC-5 |
| A9 | `work_tasks.source_type/source_id` — niekada nerašomi | `20260711210000:81-84` | RC-5 |
| A10 | Org dokumentų vaizdas — tik skaičiai, `Link` į projektus vietoj turinio | `documents/page.tsx:145-177` | RC-5 |
| A11 | `MyAssignedAssetsPanel` tuščias → `return null` (prieš sąžiningo empty state doktriną) | `assets-panel.tsx:238` | RC-5 |
| A12 | Journal tab rodomas org rolėms, kurios gauna aklavietę | `navigation.ts:160` vs `dashboard-module-registry.ts:150` | RC-2 |

---

## 5. Būsenų suvestinė (vizijos §20 formatu)

| Gebėjimas | Būsena prieš šaką | Būsena po šios šakos (2026-07-28) |
|---|---|---|
| Multi-tenant DB spine (org + engagement_contexts) | IMPLEMENTED | IMPLEMENTED |
| Aktyvus workspace kontekstas frontend'e | NOT_IMPLEMENTED | PARTIAL — `getWorkspaceContext()` resolvina VISOMS tapatybėms (owned + engagement narystės), AuthProvider gauna workspace laukus; duomenų skaitymo scoping'as — kita banga |
| Workspace switcher / indikatorius UI | PARTIAL (tamsus) | PARTIAL — `WorkspaceChip` ŠALIA pokalbio lango (header), deterministinis akcentas iš esamų brand tokenų; perjungimas sąžiningai išjungtas iki pointer migracijos (owner gate) |
| Org žymės mišriuose sąrašuose | NOT_IMPLEMENTED | PARTIAL — žurnalo srautas žymi kiekvieno įrašo engagement kontekstą (kelių engagement atveju) tuo pačiu akcentu; tasks/assets/review-queue — kita banga |
| Kanoninis kalendorius | IMPLEMENTED (6/11) | IMPLEMENTED (8 šaltiniai) |
| Absences/stages kalendoriuje | NOT_IMPLEMENTED | IMPLEMENTED — `absence` + `stage` šaltiniai, actual-overrides-planned kaip gantt'e; kontrakto dokumentas atnaujintas |
| Darbuotojo assigned-project skaitymas | NOT_IMPLEMENTED | IMPLEMENTED — `readAssignedProjectItems`, `assigned` konfliktų šaka pagaliau pasiekiama |
| Konfliktų prevencija | PARTIAL (fasadas) | PARTIAL — kliento sluoksnis realiai veikia (approved atostogos × accepted booking, assigned×assigned/booking); DB EXCLUDE constraint + RPC kryžminiai guard'ai = RED follow-up (owner gate) |
| Chat kaip darbo centras darbuotojui | PARTIAL | PARTIAL — + „Užfiksuoti darbą" starter chip; + realus kalendoriaus readback su konfliktų įspėjimu |
| Chat kalendoriaus intent | NOT_IMPLEMENTED (užuomina) | IMPLEMENTED — `loadAgendaSummary` per kanoninį `getPlanning`/`buildAgenda` (guard'as praplėstas: adapteris, ne antras kalendorius) |
| Chat kaip darbo centras darbdaviui/agentūrai | NOT_IMPLEMENTED | NOT_IMPLEMENTED — kita banga (W3 tęsinys: company-forms per kanoninį dispatch) |
| Priminimų/vertimo intent'ai | NOT_IMPLEMENTED | NOT_IMPLEMENTED (roadmap PR-P / PR-O) |
| Pokalbio persistencija | BLOCKED (RED) | BLOCKED (RED migracija, owner gate) |

## 5a. Fazė 2 (W4–W6, 2026-07-28, šaka feat/real-user-workflow-rebuild-phase2)

| Gebėjimas | Būsena po 2 fazės |
|---|---|
| ExecCtx.workspace (aktyvus kontekstas dispatch grandinėje) | IMPLEMENTED — dispatcher'is resolvina per `getWorkspaceContext` serveryje, niekada iš kliento |
| Darbdavio poreikio intake pokalbyje | IMPLEMENTED — `company.create-demand` per tą pačią `InlineActionForm` + kanoninį dispatch, IMPORTANT tier su vienkartiniu confirmation token |
| Role-aware pokalbis | IMPLEMENTED — darbdavio starter chips, `need-workers` intent (LT/EN/RU; „ieškau darbuotojų" ≠ „ieškau darbo"), `link:` kontekstinės nuorodos tik į kanoninius paviršius |
| Kiti company/agency vykdikliai pokalbyje | PARTIAL — shortlist/contact/propose-booking/assign reikalauja request/worker id picker'ių (read-model follow-up); registruoti ir pasiekiami per kanonines scouting sąsajas |
| Vienas nav abiejuose shell'uose | IMPLEMENTED — `CORE_NAV_IDS` (pokalbis → žurnalas → kalendorius → žinutės) iš vieno šaltinio; Advanced prideda map/network PO to paties branduolio; žurnalas renderinasi simple shell'e |
| Negyvos nuorodos | IMPLEMENTED — space header/chain actions nebeveda į stub/drift (`/dashboard/agency`, `/dashboard/buyer`); `assistant` perklasifikuotas REDIRECT_STUB; `marketplace_hub` route → realus žemėlapis |
| Vienas projekto kūrimo kelias | IMPLEMENTED — abu entry point'ai per `insertProjectForCompany` core (viena validacija, vienas W10 org binding) |
| Workspace žymės mišriuose sąrašuose | PARTIAL — žurnalas (W1) + projektų žemėlapis + assets registras (tas pats deterministinis akcentas); tasks (nėra org stulpelio), žinutės, review queue, spine — dokumentuoti follow-up |
| Automatinis duomenų SCOPING pagal aktyvų workspace | BLOCKED — reikalauja pointer migracijos 20260714210000 (owner gate); iki tol sąžiningas kelias yra ŽYMĖJIMAS, ne filtravimas (multi-org owner'is neprarastų matomumo be galimybės persijungti) |
| Aktyvus projektas/objektas kaip pointer'is | NOT_IMPLEMENTED — nėra kanoninės saugyklos (owner-gated preferencijų migracija); kontekstas šiandien ateina iš engagement/žurnalo srautų |

## 6. Likusios bangos (šioje šakoje NEĮGYVENDINTA — sekantys PR)

1. **W3 tęsinys:** company/agency pokalbio formos per kanoninį dispatch (10 vykdiklių jau parašyti);
   role-aware starter chips; workspace kontekstas `ExecCtx`.
2. **W4 IA konsolidacija:** nav simetrija (žurnalas simple shell'e, kalendorius Advanced);
   negyvų nuorodų valymas (current-space-header → stub/drift, assistant → REDIRECT_STUB,
   marketplace_hub route); vieno projekto kūrimo kelio konsolidacija; org žymės
   tasks/assets/review-queue/žinutėse; spine org dimensija.
3. **RED follow-up (owner gate):** pointer migracija 20260714210000 apply; btree_gist EXCLUDE
   accepted booking'ams; absence↔booking kryžminis RPC guard'as; žurnalo `work_date` stulpelio
   promotion + backfill; pokalbio persistencijos migracija (#883).
4. **Duomenų scoping pagal aktyvų workspace** (kai pointer aplikuotas): projektai, užduotys,
   žinutės, pranešimai filtruojami/žymimi pagal aktyvų kontekstą be rankinio filtravimo.
