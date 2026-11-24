# M1 Audit — 2026-05-20

Auditor: Claude Code (read-only pass). `docs/PROJECT_VISION.md` rastas ir
perskaitytas. `CLAUDE.md` / `AGENTS.md` neegzistuoja (nei repo šaknyje, nei
giliau). Branch'as: `main` (uncommitted darbas auth/onboarding/landing
slice'uose iš ankstesnio pokalbio yra patikrintas ir įtrauktas į audit'ą).

## Santrauka

- **M1 baseline ≈ 38 %.** Auth/profilio šerdis pristatyta (Slice 6 +
  šiandien'os landing slice). Visa **vertikalė `Profession → Skill → Work
  Journal → Verification → Match`** dar nesukurta — egzistuoja tik M0
  flat'as su boolean `worker_skills.verified` ir 5-level / journal /
  professions modeliai dar yra **schemos sketch'ai** `docs/DATA_MODEL.md`
  „Architectural sketches" bloke.
- **Top 3 findings:**
  1. **Work Journal'o nėra** nei schemos, nei UI lygmenyje. Tai panaikina
     PV §6 levels 2–4 (work-journal → manager → client) — visi pasitikėjimo
     signalai šiuo metu remiasi vien M0 `worker_skills.verified` boolean'u.
     ROADMAP'as šitą deda į M2, bet brief'as teigia, kad be Work Journal'o
     „visi kiti moduliai yra tik deklaracijos be įrodymų" — vadinasi
     prioritetas turi būti aiškiai sutartas su DI.
  2. **Profesijos kaip pirmos klasės objekto nėra.** `onboarding-form.tsx`
     renka `profession` lauką, bet jis tik kraunamas į
     `profile_roles.role_data` JSONB blob'ą — be FK, be normalizacijos, be
     enum'o, be admin UI. ADR 0006 (`professions` lentelė) numatyta M2.
  3. **5 verification levels** yra ADR 0009 (status: „schema M1"), bet
     `skill_verifications` lentelė **neegzistuoja migracijose**
     (`0001…0005`). Šiuo metu UI gali atvaizduoti tik „verified true/false",
     ne 5-level signalą.
- **3 didžiausi blokeriai:**
  1. Profesijos koncepcija turi būti pridėta **prieš** Work Journal'ą
     (journal'as susietas su profesija per `journal_templates` —
     `docs/PROFESSION_TEMPLATES.md`). Sekantis žingsnis turi prasidėti nuo
     `professions` migracijos, ne nuo Work Journal komponento.
  2. Reikia DI sprendimo dėl scope'o: ROADMAP.M1 dabar apima tik „skill
     verifications schema + UI" + „document statuses" + „profile gilesnis
     editing". Brief'as šiame pokalbyje plečia tai į pilną Profession +
     Work Journal + CV Import vertikalę, kuri **dabar** yra
     ROADMAP.M2. Be re-scope sprendimo komandui kils plan'avimo konfliktai.
  3. CV Import — visiškai greenfield (jokio parser'io, jokio file upload
     endpoint'o, jokios storage strategijos). Realiai tai atskira savaitė
     darbo plius LLM/parser sprendimai (vendor vs self-host).

---

## 1. Profile / Auth

### Kas yra
- **Schema:** `supabase/migrations/0001_initial_schema.sql` apibrėžia
  `public.profiles` (id=auth.users.id, locale, full_name, email, phone,
  country, onboarded, consent_marketing, consent_data_processing,
  created_at, updated_at). RLS enabled; policies `profiles_select/insert/
  update/delete` riboja self+admin (eil. 405–417). `handle_new_user()`
  trigger'is sukuria profilio eilutę po `auth.users` insert'o (eil. 360,
  patobulintas 0003 migracijoje, kad insert'intų ir `profile_roles`).
- **Multi-role:** `supabase/migrations/0003_multi_role.sql` įveda
  `profiles.active_role` (check: worker|company|agency|customer|admin),
  `profiles.onboarded_at`, ir naują `public.profile_roles` lentelę
  (`profile_id, role, is_active, role_data jsonb`, unique
  `(profile_id, role)`). RLS helpers (`profile_role()`, `is_admin()`,
  `is_employer()`) perkelti į `active_role`. ADR 0012.
- **Grants:** `0004_authenticated_grants.sql` patiekia
  `GRANT SELECT/INSERT/UPDATE/DELETE ON public.profiles, public.profile_roles
  TO authenticated` + `USAGE ON ALL SEQUENCES`.
- **Auth flow (frontend, magic-link, real):**
  - `apps/web/components/app/signup-form.tsx` — email + role picker
    (worker/company/agency/customer), `supabase.auth.signInWithOtp` su
    `data: { role, locale }`, magic link siunčiamas.
  - `apps/web/components/app/login-form.tsx` — tik email, magic link.
  - `apps/web/app/[locale]/auth/callback/route.ts` — `exchangeCodeForSession`,
    tada redirect į `/onboarding` arba `/dashboard` pagal `onboarded_at`.
  - `apps/web/components/app/onboarding-form.tsx` — common laukai
    (`display_name`, `country` iš 9-country sąrašo) + role-specific
    laukai (worker: profession/language/city; company: name/industry/
    headcount; agency: name/regions/focus; customer: city). Submit'as
    keliauja į server action `completeOnboarding`
    (`apps/web/lib/auth/actions.ts:12`).
  - **`completeOnboarding` IR YRA prijungtas prie `profiles` update'o:**
    rašo `full_name, country, active_role, onboarded_at, onboarded` +
    `profile_roles.upsert({ profile_id, role, is_active:true, role_data })`.
    Užfiksuoju aiškiai, nes brief'as nurodo, jog 2026-05-20 buvo
    identifikuota atjungimo problema — current main jau veikia.
  - Dashboard shell: `apps/web/app/[locale]/dashboard/layout.tsx` patikrina
    sesiją + onboarded_at, krauna roles ir paduoda į `AuthProvider`.
    `dashboard/page.tsx` (after šiandien'os patch'o) rodo coming-soon
    panel non-worker rolei, worker'iui — 3 sekcijų skeleton'as (Offer /
    Seek / Proofs) iš `DashboardSection` komponento.
- **Auth header widgets:** `RoleSwitcher`
  (`apps/web/components/app/role-switcher.tsx`) — perjungia/prideda role'es
  per `switchRole` / `addRole` server action'us
  (`apps/web/lib/auth/actions.ts:71, :96`). `NotificationPanel` — tuščia
  shell'as su honest empty state (notif. lentelės dar nėra, ji M2 — žr.
  DATA_MODEL.md eil. 310).
- **I18n:** auth namespace `auth.signup`, `auth.login`, `auth.callback`,
  `auth.onboarding`, `auth.roleSwitcher`, `auth.dashboard`,
  `auth.middleware`, `auth.notifications` — pilnai padengtos LT + EN.

### Kas trūksta
- **Tik 2 locale aktyvūs**, ne 6. `apps/web/lib/i18n/config.ts` deklaruoja
  `locales = ["lt","en"]` + `reservedLocales = ["nl","de","pl","ru"]`.
  Brief'as mini „6 lokalės" — tai planuojama, bet šiuo metu neimplementuota,
  ir `apps/web/messages/` turi tik `lt.json` + `en.json`.
- **Roles iš `docs/ROLES.md` 7 sąrašo ne visos enum'e.** Schema žino tik 5
  (`worker|company|agency|customer|admin`); brief'o §7 7 roles
  (`team_leader`, `company_manager`, `hr_personnel`) atsiranda M2+ (ROLES.md
  eil. 13–21). Bet kai jos atsiras, reikės naujos migracijos + RLS
  rewrite'o.
- **Granular per-worker matomumas.** PV §11 numato „matomumo sluoksnį", o
  DATA_MODEL.md (eil. 105–108) sako, kad `workers` lentelei dar nėra
  per-worker visibility column'o — visi authenticated employers mato pilną
  worker directory. Tai techniškai pažeidžia §10 honesty princpus, kai
  worker'iui sakoma „jūs valdote matomumą".
- **Per-role onboarding pagilinimas.** ROADMAP.M1 reikalauja „profile module
  deeper editing (worker profession/skills, company industry/headcount/
  projects, agency regions)". Šiuo metu onboarding'as renka po 3 laukus į
  JSONB blob'ą — papildomas profilio redagavimo UI dashboard'e neegzistuoja.
- **Audit log writes** — `audit_logs` lentelė yra, bet jokie kodo paths
  nerašo į ją. Visi server action'ai (completeOnboarding, switchRole,
  addRole) nepalieka audit pėdsako.
- **Document statuses module** — ROADMAP.M1 sako pristatyti. Schemos lygmenyje
  jokios `documents`/`document_statuses` lentelės nėra.

### Atjungta / neveikia
- **`profile_roles.role_data` nelinked'inta į normalizuotas lenteles.**
  Pvz. worker `profession` patenka į JSONB string'ą, bet
  `workers.profile_id` row'as **nėra kuriamas** onboarding metu — jokio
  `insert into public.workers` action'e (`completeOnboarding` rašo tik
  `profiles` ir `profile_roles`). Vadinasi worker'is, baigęs onboarding'ą,
  neturi `workers` row'o → negali turėti `worker_skills`, `agency_workers`
  ar matches. Tas pat su `companies` (company role) ir `agencies` (agency
  role). **Šis trūkstamas insert'as yra didelis atjungimas tarp auth'o ir
  worker/company/agency entity'ių.**
- **Worker dashboard'as rodo tik tuščius skeleton'us** — visos 3 sekcijos
  (`Offer`, `Seek`, `Proofs`) krauna tik `auth.dashboard.empty.worker.*`
  string'us, jokio realaus duomenų skaitymo iš `workers`/`worker_skills`.
  Tai sąžininga (PV §10) — bet pažymėtina, kad „profile module shipped"
  paradigmoje yra tik onboarding'as, ne dashboard'e matomas profilis.

---

## 2. Profession

### Kas yra
- **Dokumentacija detali.** `docs/PROFESSION_TEMPLATES.md` apibrėžia 5
  profession families (construction, hospitality, education, healthcare,
  generic) + journal field schemas. ADR 0006 (`docs/DECISIONS/0006-…`)
  patvirtina profession-specific journals architektūrą.
- **Onboarding renka `profession` lauką** worker rolei
  (`onboarding-form.tsx:14` → `FIELDS.worker = ["profession","language","city"]`).
  Patenka į `profile_roles.role_data.profession` (string).
- **Skills turi `category` lauką** kaip kvazi-profesijos signalą — pvz.
  `construction.steel`, `construction.welding`, `construction.electrical`
  (`reference-data.sql:35+`). 27 statybų skills sukurti LT+EN.

### Kas trūksta
- **`professions` lentelės nėra** (`grep` migracijose grąžina null). PV §6
  ir §8 modulis 3 (work-journal) reikalauja profesijų kaip pirmos klasės
  objekto.
- **Worker → profession many-to-many** neegzistuoja. PV §5 §6 ir
  PROFESSION_TEMPLATES architektūra suponuoja, kad žmogus gali turėti
  daugiau nei vieną profesiją (pvz. „statybininkas + virėjas" sezoniškai).
- **Primary/secondary distinction** nenumatyta net ADR'uose.
- **Profession extensibility** — ADR 0006 reikalauja, kad „pridėti naują
  profesiją = inserting a new `journal_template` row" (žr. § Extensibility
  PROFESSION_TEMPLATES.md), o tai galimas tik kai `professions` lentelė
  egzistuoja. Admin UI taip pat nesukurtas.

### Atjungta / neveikia
- Visa profession koncepcija praktiškai **„dokumentuota, nesukurta"**.
  Šiuo etapu žodis „profesija" gyvuoja tik `placeholder.id` string'uose ir
  vienos `role_data.profession` JSON eilutės pavidalu — be lookup'o, be
  validacijos, be cross-referencing'o su skills.

---

## 3. Skills

### Kas yra
- **`public.skills` master lentelė** (`0001_initial_schema.sql:66`): id,
  slug, category, name_lt, name_en. RLS: viešas read, admin write.
- **27 statybos skills** seedinami iš `supabase/reference-data.sql`
  (eil. 34–60+, kategorijos: steel/formwork/concrete/welding/electrical/
  plumbing/hvac/masonry/finishing/carpentry/roofing).
- **`public.worker_skills` junction** (`0001_initial_schema.sql:90`):
  worker_id, skill_id, self_rated_level (1–5), `verified` boolean,
  verified_by, verified_at, unique(worker_id, skill_id). RLS:
  owning worker + admin write; employers read.

### Kas trūksta
- **5 verification levels** (PV §6, ADR 0009). `skill_verifications`
  lentelė pasiūlyta DATA_MODEL.md eil. 254–265, bet **neegzistuoja jokioje
  migracijoje** (0001–0005). Šiuo metu `worker_skills.verified` yra binary
  boolean — tai eksplicitiškai pažymėta DATA_MODEL.md eil. 268: „Replaces
  the boolean-ish `worker_skills.verified`".
- **Skills profession-scoped'inimo nėra.** `skills` lentelė turi tik
  `category` text lauką — nėra FK į `professions`. Brief'as klausia „ar
  skills yra profession-scoped" — atsakymas: **ne**, jie global'ūs, su
  laisva tekstinio category konvencija.
- **Skills UI worker'iui — nėra.** Jokio komponento, kuris leistų
  worker'iui pasirinkti skills, savai įvertinti level'į (1–5), pridėti
  evidence'ą. Dashboard'e tik empty placeholder
  (`auth.dashboard.empty.worker.offer/proofs`).
- **Skills cross-language paieška, autosuggest'as** — neegzistuoja
  (planuojama M2).

### Atjungta / neveikia
- **Worker → skills** ryšys schemoje yra (`worker_skills`), bet kadangi
  `workers` eilutė per onboarding'ą **nekuriama** (žr. §1 atjungimas),
  realiai nė vienas worker'is dabar negali turėti `worker_skills` įrašo.

---

## 4. Work Journal

### Kas yra
- **Dokumentacija pilnai parengta:**
  - ADR 0006 (`docs/DECISIONS/0006-profession-specific-journals.md`):
    decision "Journals are profession-specific via data-driven
    journal_template (field_schema jsonb) per profession family".
  - `docs/PROFESSION_TEMPLATES.md` apibrėžia 5 šeimų field schemas:
    construction (site_arrival/hours/materials/incidents/weather/photos/
    task/skill_refs), hospitality (shift/dishes/customer_count/…),
    education, healthcare, generic.
  - `DATA_MODEL.md` eil. 271–278 architektūrinis sketch'as:
    `professions`, `journal_templates`, `work_journals`,
    `journal_entries`. **Status: schema M2** (ne M1).

### Kas trūksta
- **VISKAS schemoje:** nei `professions`, nei `journal_templates`, nei
  `work_journals`, nei `journal_entries` lentelių. ROADMAP.M2 sąrašas.
- **VISKAS UI:** jokio Work Journal komponento, jokio pildymo formos,
  jokio mobile-first input flow, jokio manager confirmation flow.
- **Auto-detect / manual skills** — nei vienas, nei kitas (nes Work
  Journal nesukurta).
- **Manager confirmation flow** — neegzistuoja; level 3 verification
  (`manager-confirmed`) negali įvykti.

### Atjungta / neveikia
- **`work-journal-chat.tsx` nerastas** — `grep`/`glob` po `apps/web`
  nieko negrąžina su pattern'u `work[-_]?journal|workJournal|WorkJournal`
  (tik docs failai). Galbūt buvo trumpalaikis ankstesnio session'o
  juodraštis, kuris niekada nepateko į main. Pažymėtina kaip greenfield.
- **Visa PV §3 grandinė** (`Profile → Skills → Work Journal → Manager
  confirm → Verification level up`) **niekur nesusijungia kode**, nes
  trūksta vidurinės grandies.

---

## 5. CV Import

### Kas yra
- **Nieko.** Nei migracijoje, nei kode (grep'as
  `cv[-_]?import|cvImport|resume|CV upload` po visam repo grąžina nulį).
- Doc'uose nepaminėta atskirai (galbūt implicit'iškai dalis „profile
  module deeper editing" ROADMAP.M1, bet eksplicitiškai nepriskirta).

### Kas trūksta
- **CV upload endpoint / komponentas** — PDF/DOCX/LinkedIn import'as.
- **Storage strategija** — Supabase Storage bucket `cv-uploads` nesukurtas
  (`supabase/migrations/` nieko apie storage neturi).
- **Parser logika** — auto-extract profesijų, įgūdžių, work history.
  Sprendimo reikia: vendor (Affinda, Sovren) vs. self-host (resume-parser
  + LLM post-processing) vs. LLM-only (Claude/OpenAI structured output).
- **Field mapping į esamas lenteles** — kaip parsed skill'as virsta
  `worker_skills` eilute su Level 0 (`self-declared`)?

### Atjungta / neveikia
- N/A — greenfield.

---

## 6. Project

### Kas yra
- **`public.projects` schema** (`0001_initial_schema.sql:140`): id,
  company_id (FK), title, country, city, start_date, end_date,
  housing_provided, status (draft/live/paused/closed). RLS: owning
  company + admin + live-and-authenticated read.
- **`public.job_demands` schema** (`0001_initial_schema.sql:155`):
  project_id (FK), role_title, headcount_needed, required_skills
  (uuid[] references skills), preferred_countries, salary_offered_eur,
  start_date, status, visibility (public/agencies_only/direct_only).
- **`public.matches`, `match_actions`, `threads`, `messages`** susiję per
  job_demand → project chain. RLS helper'is `can_access_match(m)`
  patikrina ar caller'is yra worker arba company-owner.
- **RLS visibility-gating** job_demands'uose veikia (DATA_MODEL.md
  eil. 140–145): `agencies_only` matomi tik agency rolei, `direct_only`
  — niekam (surfacing tik per matches).

### Kas trūksta
- **Jokio UI projektams kurti/peržiūrėti.** `grep`'as su pattern'u
  `from.*projects|insert.*projects` po `apps/web` grąžina tik
  `types.ts` (generated), `live-map.tsx` (vizualas), `placeholders.ts`
  ir `design/page.tsx` — niekur tikras CRUD. ROADMAP'e — M2 scope.
- **Project ↔ Work Journal ryšio nėra**, nes Work Journal'o nėra (žr. §4).
  Kai `work_journals` lentelė atsiras (DATA_MODEL.md eil. 276), bus
  `work_journals.project_id references projects` — ryšys jau numatytas
  schemoje, bet ne implementuotas.
- **Cross-organization projects (client + contractor + worker)** — schemoje
  `projects` priklauso vienai `companies` (FK), bet `job_demands.visibility`
  + `agency_workers` chain'e leidžia tarpininkavimo modelį. Tikras multi-
  party project (pvz. client_company + main_contractor + sub_contractor)
  būtų M3+ design.

### Atjungta / neveikia
- **Jokio projects CRUD UI** + jokio public read'o (net `live` projektams)
  šiuo metu app'e nėra. Schemos sluoksnis pasiruošęs, frontend'as ne.

---

## Rekomenduojamas implementacijos eiliškumas

1. **DI sprendimas dėl M1 scope re-baseline.** Prieš kodavimą reikia
   užfiksuoti: ar Work Journal vertikalė (Profession + Skill levels +
   Journal + Manager confirm) atsiranda M1, ar lieka M2 kaip ROADMAP'e?
   Mano rekomendacija: **iš dalies pertraukti** — perkelti `professions`
   + `skill_verifications` (5 levels) į M1, palikti `work_journals` ir
   `journal_entries` M2'ame. Pagrindimas: be 5-level UI'jaus dashboard'as
   negali sąžiningai rodyti pasitikėjimo signalų (PV §10), o be
   `work_journals` UI vis tiek galima level'ius 1, 3, 5 generuoti
   (self, manager-confirm, document).
2. **`completeOnboarding` patch'as.** Pridėti `workers` / `companies` /
   `agencies` eilutės sukūrimą atitinkamai role'ei. Vienas mažas
   migration'as nereikalingas — tik server action'o pataisymas + RLS
   sanity check'as. **Tai blokuoja visus tolimesnius profilio
   funkcionalumus** ir turi būti pirmas kodavimo žingsnis.
3. **`professions` lentelė + reference-data + admin seed.** Migration
   `0006_professions.sql`: 5 families pradžiai, slug + name_lt/en +
   family enum. FK iš `skills` (`skills.profession_id`). FK iš
   `profile_roles.role_data.profession_id` (per data migration arba paliekant
   JSONB blob).
4. **`skill_verifications` lentelė** (M1 per ADR 0009). Migration su
   `level` enum (`self|work_journal|manager|client|document`), `evidence_id`,
   `verified_by`, `verified_at`. Backfill iš `worker_skills.verified=true`
   → level=`manager` (defensive default, tai pažymėti audit'o eilutėje).
5. **Worker skills + profession picker UI** dashboard'e — Worker tab'e
   `Offer` sekcija pradžiai rodo profesijas + skills su level badge'ais
   (be galimybės pakelti level'į iki M2 Work Journal'o).
6. **Document statuses module** — paskutinis ROADMAP.M1 punktas. Atskira
   migracija + UI worker'iui įkelti pažymėjimus (level 5 evidence).
7. **(M2 start) Work Journal + Project CRUD** — kai schema iš §4 (`professions`,
   `journal_templates`, `work_journals`, `journal_entries`) yra.
8. **CV Import** — atskiras savaitės sprintas, reikalauja DI vendor sprendimo.
   Mano rekomendacija: pradėti nuo LLM structured output (Claude tool use,
   schema = skills + work history), Supabase Storage bucket, parser
   server action, manual confirm UI prieš commit'ą į `worker_skills`.

## Atviri klausimai product owner'iui (DI)

1. **Scope re-baseline:** ar M1 plečiamas iki pilnos Profession + Work
   Journal + CV Import vertikalės (versus ROADMAP'o split'as M1=skills/docs,
   M2=journals/teams)? Jei taip — ar verta perdėlioti ROADMAP.md prieš
   kodavimą?
2. **Onboarding scope:** ar šiuo metu sutinkama, kad onboarding'as turi
   automatiškai sukurti `workers/companies/agencies` eilutę, ar paliekame
   atskirą „setup profile" žingsnį dashboard'e?
3. **Skill ↔ profession granularumas:** ar 1 skill priklauso vienai
   profesijai (FK), ar daug-prie-daug (junction)? PV §6 ir
   PROFESSION_TEMPLATES neapibrėžia vienareikšmiškai (steel-fixing
   priklauso ir steel fixer, ir general construction supervisor).
4. **Multi-profession worker:** ar leidžiame worker'iui turėti N
   profesijų? Jei taip — ar yra primary (kuria atsidaro dashboard'as)
   vs secondary?
5. **Verification level upgrade triggers:** kas konkrečiai promote'ina
   worker_skill iš level 1 (self) į level 2 (work-journal-backed)?
   Threshold'as (N įrašų), manual confirm, ar auto?
6. **CV Import privacy:** ar parsed CV failas saugomas Storage'e (GDPR
   risk), ar tik extracted struktūra einant į DB? Jei saugomas — kiek
   ilgai (retention policy)?
7. **Manager confirmation flow:** kas yra „manager" sistemoje? Šiandien
   schemoje yra `team_leader` ir `company_manager` (ROLES.md), bet jų
   enum'e nėra. Reikia pridėti į `active_role` check constraint'ą prieš
   pradedant manager-confirm flow'ą, arba laikinai naudoti owner_id
   semantiką.
8. **i18n plan'as:** kada įjungiame nl/de/pl/ru locale'us, ir kas verčia
   (ChatGPT batch / DeepL / native speakers)? Šiuo metu yra reservedLocales
   kintamasis, bet nė vienas messages failas.
