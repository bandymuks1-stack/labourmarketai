# PLATFORM DOCTRINE — LABMA OS

> **Status:** Canonical. Permanent. Binding on all agents (Claude Code, Antigravity, Codex) and human contributors.
> **Location:** `docs/PLATFORM_DOCTRINE.md`
> **Last updated:** 2026-05-21
> **Owner:** DI (product owner)

This document captures architectural and product principles that outlive any single PR, task, or sprint. If a task spec contradicts this doctrine, **the doctrine wins** — flag the contradiction in the PR description and propose a reconciled approach.

`AGENTS.md` and `CLAUDE.md` govern HOW agents work day-to-day. This document governs WHAT the platform is, structurally and philosophically. Read this file before any change involving schema, user content, permissions, audit trails, translations, or chat-like features.

---

## Section 1 — Strategic framing (the WHY)

**Original intent (DI, in Lithuanian):**

> *"Žmonėms labai trūksta patikėjimo, kad galima apsiginti — ypač prieš didesnius rangovus, kurie gali sau leisti vilkinti procesus. Komunikacijos ir projekto palengvinimas sutaupys resursų visiems."*

**Translation & elaboration for engineers and agents:**

The platform exists to **level the playing field for the smaller party** in any work relationship — worker vs. company, subcontractor vs. main contractor, small company vs. enterprise customer, individual vs. institution.

Larger entities can afford to weaponize delays, process attrition, and legal cost. They win disputes not by being right but by outlasting the smaller side. The platform's job is to **make truth fast to find, evidence cheap to produce, and communication friction-free**, so the smaller party can defend themselves without hiring a lawyer to comb through a year of emails.

Every architectural decision passes this test:

> **Does this make it easier for the smaller party to defend themselves and prove what actually happened?**

Resource savings (time, money, stress) for both sides come from clarity — not from clever tricks. A platform where records are tamper-evident, communication is unambiguous, and responsibility is traceable is a platform where bad actors lose leverage and good actors get on with the work.

---

## Section 2 — Translation architecture

### 2.1 Two content layers, two storage methods

| Content type | Examples | Stored in DB | Translations live in |
|---|---|---|---|
| **Platform-curated** | Skill names, profession names, position names, document type names, UI labels, system event messages ("User joined"), status labels, category names | Stable slug only (e.g. `welding-mig`, `chat.event.user_joined`) | next-intl JSON files: `messages/{locale}/...json` |
| **User-authored** | Chat messages, journal entries, work proof descriptions, comments, custom position labels, file captions | `original_text` + `original_language` (ISO 639-1, e.g. 'lt') | **NEVER stored in DB.** Translated on read, cached in Redis/edge layer with TTL (typ. 30 days). |

### 2.2 Mandatory translation rules

1. **No translation columns on user-content tables.** Don't add `text_lt`, `text_en`, `body_translations`, etc. Use `original_text` + `original_language` only.
2. **No translation columns on platform taxonomy tables either.** Use slug → JSON file. Once shipped, **a slug is forever** — you may deprecate, never rename.
3. **System events are tokens, not text.** "User Jonas joined" is stored as `event_token='chat.event.user_joined'` + `params={"userName":"Jonas"}`. Renderer translates in viewer's locale.
4. **Construction / safety / legal glossaries translate 1:1.** No AI creativity in domain terms — manual or human-reviewed translations only. AI may suggest during seeding; human reviews before merge.
5. **Adding a new language = creating one new JSON file** with the same keys. No schema migration. No code change beyond locale registration.
6. **Fixing a translation = editing one line in one JSON file.** No SQL update. No migration.

### 2.3 Schema requirement for new user-content tables

If your migration creates a table where users write free-form text:

**REQUIRED columns from day 1:**
```sql
original_text       TEXT        NOT NULL,
original_language   CHAR(2)     NOT NULL,  -- ISO 639-1: 'lt','en','pl','de','nl','lv','et','da','no','sv'
```

**FORBIDDEN:** any column holding a translated copy (`text_en`, `body_translations`, etc.).

### 2.4 Locale set (binding)

> **§2.4 Locale set (binding).** The canonical locale set is 10: EN (source) + 9 launch markets (LT, LV, EE, NL, DE, DK, NO, SE, PL). All 10 JSON files must exist in the repo at all times. No PR may remove a locale. New i18n keys must be added to all 10 files in the same PR — placeholder values `[EN] <english>` are acceptable for non-Tier-1 locales until human or community translation lands. Translation completeness is tracked per-locale: Tier 1 = human-verified (EN, LT for M1); Tier 2 = baseline + moderation (the other 8). Tier promotion is independent of the locale set — the locale set never shrinks.

Implementation note (ISO 639-1 locale codes): `en, lt, lv, et, nl, de, da, no, sv, pl` (market → code: EE→et, DK→da, NO→no, SE→sv). The set lives in `apps/web/lib/i18n/config.ts`; routing + middleware derive from it; per-locale files are `messages/{locale}.json` plus the taxonomy layers `messages/{locale}/professions.json` and `messages/{locale}/skill-names.json`.

### 2.5 Why this matters

- Translations stored in DB = N× storage cost per record (1 message → 6 language copies).
- Translations in DB = stale when translation engine improves.
- Translations in DB = not the legal record; **original text is the legal record**.
- Translations in JSON files = version-controlled, reviewable in PRs, instantly editable.

---

## Section 3 — Legal proof & audit principles

Lithuanian construction-warranty law allows hidden-defect claims up to **10 years** after completion. EU consumer-protection and B2B contract disputes routinely surface years after the work. Every author-content record on this platform may need to function as **admissible evidence** in a future dispute. Build accordingly.

### 3.1 Append-only by default

For author-content tables (`chat_messages`, `journal_entries`, `work_proofs`, `comments`, `manager_confirmations`):

- **No UPDATE via API.** If editing is product-required, use a separate `edits` table with full history; never overwrite the original row.
- **No DELETE via API.** Soft-hide with `hidden_at`, `hidden_by`, `hidden_reason`; the original row stays forever.
- **RLS enforces this at the policy level** — UPDATE and DELETE blocked for all roles, including `platform_admin`. Admin actions go through audit-logged stored procedures, not direct table writes.

### 3.2 Server-side timestamps

- `created_at`, `sent_at` etc. always set by `DEFAULT now()` or trigger.
- Never accept client-supplied timestamps for legal-relevant records.
- Use `timestamptz` (with timezone), never `timestamp`.

### 3.3 Hash chain for chat & journal (schema requirement from day 1, even if verification is M2+)

For `chat_messages` and `journal_entries`:

```sql
prev_hash       TEXT,       -- content_hash of previous record in same conversation/journal
content_hash    TEXT NOT NULL  -- SHA-256(sender_id || sent_at || original_text || prev_hash)
```

Computed server-side on insert (trigger or RPC). If anyone tampers with a historic row, the chain breaks at that point and all subsequent rows fail verification — tampering is provably detectable.

The hash chain doesn't need verification UI in M1. The columns must exist **and be populated correctly** in M1 so the historical record is intact when verification ships in M3+.

### 3.4 Audit log

Sensitive actions write to `audit_log`:

```sql
audit_log:
  id, actor_id, action_type, target_table, target_id,
  before_state JSONB, after_state JSONB,
  ip_address INET, user_agent_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
```

Actions that MUST be audited: permission grants/revocations, position assignments/changes, manager confirmations, work proof acceptances, document approvals, role changes, organization membership changes.

---

## Section 4 — Default-closed visibility

### 4.1 The rule

**Conversations, journal entries, work proofs, and any sensitive author content are CLOSED by default.** Access requires an explicit grant row.

- No "public to org" shortcuts.
- No "everyone in this project sees everything" shortcuts.
- Workers see only conversations/entries/proofs they are explicitly part of.
- Outsiders (clients, customers) see only what's explicitly shared with them.

### 4.2 Per-participant scope

Each membership/grant row includes a scope:

- `full` — sees all content in the conversation/journal/project
- `reports_only` — sees only manager-curated reports (typical for clients/customers in M1–M2)
- `custom` (M4+) — manager picks which messages/entries the participant can see

### 4.3 Grants are records, not flags

Permission grants are rows with:
```
granted_by, granted_at, scope, revoked_by NULL, revoked_at NULL, reason TEXT
```

Revocation = setting `revoked_at`, not deleting the row. The history of who could see what, when, is itself legal evidence.

---

## Section 5 — Positions, roles, and engagements (amended)

> **§5 Positions, roles, and engagements (amended).** The platform separates four orthogonal layers of how a person relates to the world. Mixing them causes the recurring "what role am I?" confusion.
>
> **§5.1 Personhood — singular and root.** One human ↔ exactly one `profiles` row, always. There is no scenario in which a single person is split across multiple profile records, regardless of how many organizations, projects, or contexts they participate in.
>
> **§5.2 Platform authority (RBAC) — small, fixed, technical.** A short closed set of technical capability levels: `admin` (platform operations) and operational sub-roles assigned to platform staff. NOT for describing what someone does in the world. This is the only layer where a CHECK enum is appropriate; the enum reflects platform code paths, not market reality.
>
> **§5.3 Profession + skill identity — extensible.** What a person *does* professionally — the `professions` + `skills` registries — slug + JSON, freely extensible per §10. A person may carry several professions; skills accumulate across the lifetime.
>
> **§5.4 Organizational positions — assigned within an organization.** When a person is engaged within an organization, that organization may assign them a position (brigadininkas, prižiūrėtojas, vyr. specialistas, …) with responsibilities from an extensible registry. Mixed model: platform defaults + custom org-defined positions. Positions ≠ §5.2 authority.
>
> **§5.5 Engagement contexts — plural, open, first-class.** Each person-organization or person-project relationship is its own row in `engagement_contexts`, classified by a `relationship_types` slug (`owner`, `employee`, `consultant`, `collaborator`, `freelancer`, `unemployed`, `student`, …). The relationship registry is extensible per §10. A single profile may hold arbitrarily many engagements simultaneously across countries, with no constraint on combinations. Work Journal entries pin to an engagement context, never directly to an organization. This is the architectural expression of "level playing field" (§1): no person fits in a category; each person carries a portfolio of relationships, and the platform represents them honestly.

---

## Section 6 — Storage minimalism

### 6.1 Principles

- **Never store derived data** that can be recomputed (counts, sums, formatted strings, translations) unless explicitly cached with a TTL and invalidation strategy.
- **PostgreSQL TOAST handles compression automatically** for large `TEXT` columns — no app-level compression needed.
- **Files go to Supabase Storage**, not DB. DB stores file reference + metadata only.

### 6.2 Anti-bloat patterns

- Don't denormalize `sender_name`, `conversation_title` into chat messages — JOIN at read time.
- Don't pre-translate, don't pre-format. Render at read time. Cache in Redis/edge with TTL.
- Old data → partition tables by month → ready for cold-tier migration at scale.

### 6.3 Schema review checklist (before any migration merge)

- Is every column necessary?
- Is any column storing derivable data?
- Is any column duplicating data in another table?
- Does any author-content column duplicate a translation? (FORBIDDEN — see §2)

Failing any check → revise before merging.

---

## Section 7 — AI-never-lies

1. **AI drafts; humans approve.** AI never sends, approves, changes records, or commits actions without explicit human confirmation in the chat interface.
2. **AI-generated content shown to a customer must be reviewed by the manager first.** No direct AI-to-customer path.
3. **Verification decisions are human.** Skill verification, manager confirmations, work proof acceptance — AI can suggest, humans decide.
4. **Platform translations are curated, not AI-generated, in shipped builds.** AI may help during seeding; DI/admin reviews before merge.

### 7.1 AI as translator, not author

> **§7.1 AI as translator, not author.** AI MAY read user-authored content (freeform journal entries, voice transcripts, document uploads) and SUGGEST structure (candidate skills, candidate productivity values, candidate metadata). AI MUST NEVER persist these suggestions to verified records autonomously. The workflow is always: free text → AI suggests → human (worker for self-declared layer, manager for verified layer) confirms → entry persists at the appropriate trust level. All AI extraction runs are logged append-only with provider + model + raw response + worker's accepted subset, so the trust chain remains auditable indefinitely. This rule extends §7; it does not relax it.

---

## Section 8 — How agents apply this doctrine

When Claude Code, Antigravity, or Codex picks up any task involving schema, content, permissions, audit trails, translations, or chat-like features:

1. **Read this file first.** If your task touches any of the above areas and you didn't read this, stop and read it.
2. **If the task spec contradicts this doctrine** → do not silently override. Stop, document the contradiction in your PR description under a `## Doctrine conflict` heading, propose a reconciled approach, and ask DI to confirm before proceeding.
3. **If your task adds a new user-content table** → apply §2.3 + §3 requirements without being asked. They are not optional.
4. **If your task adds a chat-like, journal-like, or proof-like table** → apply §4 (default-closed) without being asked.
5. **If you are unsure whether content is "platform-curated" or "user-authored"** → ask in the PR description. Default assumption when ambiguous: user-authored (apply the stricter rules).

---

## Section 10 — Lego architecture

> **§10 Lego architecture (binding).** Any platform taxonomy (roles, professions, skills, positions, responsibilities, document types, notification types, work proof types, journal entry types, rating criteria, and any future taxonomy that may extend or be modified without a code deploy) must be stored as slugs in the database with a separate JSON label layer per locale. Hardcoded TypeScript enums or string constants in UI components are forbidden for any extensible taxonomy. A PR introducing a fixed list without a slug registry cannot be merged. Existing enums identified post-hoc must be migrated to slug registries before any feature using them ships.

**Boundary note.** §5 platform roles are a *fixed, RBAC-controlled* set (not extensible without a code deploy), so the `Role` union type is permitted — but role *labels* still follow the slug→JSON rule (`profile_roles.role` / `active_role` store slugs; labels resolve via `auth.signup.role.*` JSON). Genuinely extensible taxonomies (professions, skills, document types, …) must use the slug-registry shape.

---

## Section 15 — Skill trust signals & productivity

> **§15 Skill trust signals & productivity.** Every `worker_skill` carries a derived `confidence_score` (numeric) and `confidence_bin` (red / green / yellow), and may carry a `current_pace_value + unit_slug`. These signals are computed from append-only journal entries + manager confirmations — never user-editable. Platform-wide aggregates per skill are fed only by manager-confirmed entries, refreshed on a fixed cadence, and gated by a minimum sample size below which a curated industry-seed benchmark is shown with explicit "industry-typical, not platform-measured" framing. Productivity units live in a slug registry per §10 and may be created at platform, org, worker, or client scope; cross-unit aggregation normalizes to a declared base unit via `parent_unit_slug + conversion_factor` metadata. UI surfaces are gated by §4 visibility and §7 / §7.1 (AI may surface but never edit them). The numeric confidence score is hidden from external viewers by default; schema supports per-jurisdiction transparency exposure via config flag. Workers MAY see numeric counts of their own skills broken down by confidence bin as a self-progress motivator — private self-view, never used for peer comparison.

---

## Section 16 — Migration naming convention

> **§16 Migration naming convention (binding).** Going forward, every NEW
> migration file in `supabase/migrations/` is named
> **`YYYYMMDDHHMMSS_snake_case.sql`** (a 14-digit UTC timestamp prefix, an
> underscore, then a short snake_case description — e.g.
> `20260530141500_drop_legacy_threads_messages.sql`). The timestamp is the
> moment the migration is authored, in UTC.
>
> **§16.1 Never rename an already-applied migration.** The existing
> sequential `000N_*.sql` files (`0001`–`0036`) are historical and have been
> applied to production. They are **frozen**: never renamed, renumbered, or
> reformatted. Renaming an applied migration desynchronises the Supabase
> migration ledger and can cause a re-run or a "missing migration" error on
> deploy. The convention change is forward-only.
>
> **§16.2 Ordering is preserved.** A 14-digit timestamp prefix
> (`2026…`) sorts lexicographically *after* every `000N` prefix (`0` < `2`),
> so new timestamped migrations always run after the legacy sequential set —
> no collision, no reordering of history.
>
> **§16.3 Reversibility (restating §3 / auto-commit policy for migrations).**
> Every DB-touching migration must be reversible: include an explicit
> rollback path (a `-- DOWN` block or a paired down migration). Destructive
> operations (`DROP TABLE` / `DROP COLUMN`) are permitted ONLY after asserting
> the target holds zero rows, and must still ship a reversible recreate.

---

## Section 17 — Canonical demand intake

> **§17 Canonical demand intake (binding).** There is exactly ONE structured
> demand model: **`customer_requests`** (+ `customers`, `customer_request_attachments`).
> Any place a company / agency / buyer expresses a structured need or offer in
> the product writes `customer_requests` through an owner-scoped SECURITY DEFINER
> RPC (its INSERT RLS is admin-only by design, so neither path loosens RLS nor
> accepts a caller-supplied `profile_id`):
> the **draft form** writes via `save_demand_draft` (`status='draft'`), and the
> **pilot-request CTA** writes via `submit_demand_request` (`status='submitted'`).
> Both stamp `kind` (`company_request` / `agency_offer` / `buyer_request` /
> `customer_request`), with per-type extras in `payload` and the author's
> `original_language` (§2). The lifecycle runs through `status`
> (`draft → submitted → in_review → needs_followup → approved → closed`). Any new
> in-product demand surface routes to one of these RPCs — never a new table, never
> `/api/leads`.
>
> **§17.1 No third demand path.** `pilot_drafts` was a parallel draft store; it
> is **folded** into `customer_requests` (drafts = `status='draft'`) and no
> longer written. Do not re-introduce a second structured-demand table or path.
>
> **§17.2 `leads` is a DISTINCT anonymous pre-auth funnel — intentionally kept,
> NOT a demand path.** `leads` (`/api/leads`) captures top-of-funnel interest:
> **anonymous** email + intent + source (a landing/waitlist "request a pilot
> conversation" capture), with **no `profile_id` and no structured need**. It is a
> marketing/founder-review funnel that precedes a real authenticated request —
> fundamentally different in shape from `customer_requests`, and kept on purpose.
> It must not be merged into, or treated as, the canonical demand intake.
>
> **The line that matters:** *anonymous email capture* belongs in `leads`; *an
> authenticated structured need* belongs in `customer_requests`. The dashboard
> pilot-request CTA was previously POSTing an **authenticated** company's need to
> `/api/leads` — that was a second demand front door, now corrected: it submits a
> `customer_request` via `submit_demand_request` (Slice 3.1). As a result
> `/api/leads` currently has **no in-product caller** — it is retained, dormant,
> as the funnel for a future genuinely-anonymous landing/waitlist CTA. Retire it
> only if a real CRM replaces the funnel — never as "demand consolidation".

---

## Section 18 — Realumo principas (jokio demo/piloto/tarpinio sluoksnio)

> **§18 Realumo principas — jokio demo/piloto/tarpinio sluoksnio (binding).**
> labourmarket.ai yra realus produktas, daromas iš esmės, čia ir dabar.
> Produkte nėra demo, piloto, „bandomosios prieigos“, „Tier-2 rankinio
> aktyvavimo“ ar tarpinio / reprezentacinio modelio — nei kaip teksto, nei kaip
> koncepcijos architektūroje ar UX.
>
> Kiekvienas ekranas yra reali, išliekanti funkcija savo tikroje dabartinėje
> būsenoje. Jei duomenų dar nėra, rodoma tikra tuščia būsena be išgalvotų
> pavyzdžių, nes vartotojas yra pirmas — viskas, kas daroma dabar, yra realu ir
> išlieka.
>
> Pirmo atėjimo ir tuščių būsenų tonas turi suponuoti, kad žmogus atėjo į
> realios sėkmės istorijos pradžią ir yra jos dalyvis (steigėjo momentas), ne į
> tuščią demo.
>
> Leidžiamas tik sąžiningas roadmap'as („RUOŠIAMA“ / vėliau įjungiamos
> funkcijos) — jis nėra reprezentacinis modelis, o atviras pranešimas, kas
> artimiausiai ateina.
>
> **§18.1 Kaip tai taikoma kartu su kitomis sekcijomis.** §18 sustiprina §7
> („AI niekada nemeluoja“) ir „jokių nepaženklintų netikrų duomenų“ taisyklę:
> netikri pavyzdžiai, netikrai veikiantys mygtukai ir pardavimo wrapper'iai
> („ačiū — gavome jūsų užklausą ir susisieksime“) draudžiami. Sąžininga
> produkto tiesa (pvz. „įrašai privatūs“, „nėra automatinio atitikimo variklio“)
> NĖRA piloto framing'as ir lieka — pašalinamas tik „pilotas / bandomoji versija
> / Tier-2 / rankinis aktyvavimas“ sluoksnis virš realių funkcijų. Paklausos
> įvedimas yra viena tiesi reali funkcija per §17 kanoninį modelį
> (`customer_requests`): sukuri → išsaugoma → matoma. Pardavimas / pilotas yra
> offline, DI-vedamas procesas, o ne vartai produkte. §18 nekeičia §17
> (kanoninis paklausos modelis), §4 (default-closed) ar autentifikacijos.

---

## Section 19 — Atitikties principas (Fit, ne reitingas)

> **§19 Atitikties principas (binding; owner tekstas 2026-06-11, įrašytas 1:1).**
>
> „Žmonių mes niekada nereitinguojame. Reitingas atsiranda tik atitikties
> perspektyvoje: darbas X reikalauja įgūdžių Y; žmogus ar įmonė Z turi
> įgūdžius C, kurie atitinka N% Y — čia ir gaunasi reitingavimas.
> Termometras tik rodo išraišką, kiek atitinka paieškos kriterijus,
> numatytus darbus ar kainas."

**Techninės pasekmės (privalomos):**

- **(a) Jokio globalaus asmens ar įmonės balo** — jokioje lentelėje, API
  atsakyme ar UI. Laukai/raktai kaip `overall_score`, `person_score`,
  `worker_rating`, `trust_score`, `profile_strength`, OVR yra draudžiami.
  (Per-įgūdžio `confidence_score` pagal §15 lieka — jis yra įgūdžio, ne
  žmogaus, signalas ir išorėje pagal nutylėjimą nerodomas.)
- **(b) Bet koks atitikties % visada pririštas prie konkretaus poreikio
  konteksto ir rodomas SU PAGRINDU** — pavyzdinė privaloma forma:
  „atitinka 95% šio darbo įgūdžių: 19 iš 20, iš jų 14 patvirtinti".
  % be konteksto ir be pagrindo neegzistuoja.
- **(c) Patvirtintų vs deklaruotų įgūdžių dalis atitiktyje visada
  atskirta** — vartotojas visada mato, kiek atitikties remiasi
  manager-patvirtintais faktais, o kiek savideklaracija.
- **(d) Tas pats subjektas skirtinguose kontekstuose turi skirtingus %
  — tai principo esmė, ne klaida.** Niekada nekešuojamas ir nerodomas
  „bendras" subjekto %; kiekvienas skaičiavimas gyvena savo poreikio
  kontekste.

Sąsajos: §7 (AI niekada nemeluoja), §15 (įgūdžio trust signalai),
PRODUCT_CONSTITUTION §10 (jokios universalios žmogaus vertės) ir S4
termometro geležinė taisyklė (reikšmė tik su abiem komponentais). S6
matching dizainas privalo skaičiuoti atitiktį per ESCO kanoninius ID —
žr. `docs/product/s6-matching-fit-spec-note.md`.

---

## Section 20 — Privatumo bazė (visomis kryptimis)

> **§20 Privatumo bazė (binding; owner tekstas 2026-06-11, įrašytas 1:1).**

1. Privatūs žmogaus pasirinkimai ir veikla (pirkimai, būstas, kelionės,
   gyvenimo sluoksnis, asmeninis elgesys platformoje) NIEKADA nematomi
   darbdaviams, agentūroms ar užsakovams — jokia forma, jokiu agregatu,
   jokiu netiesioginiu keliu.
2. Simetrija: darbuotojai lygiai taip pat nemato įmonių ar kitų darbuotojų
   privačių duomenų. Privatumas galioja visiems vaidmenims vienodai — tai
   ne darbuotojo privilegija, o platformos fizika.
3. Tik pati sistema mato — statistikos ir mokslo pagrindu: agreguoti
   duomenys su mažos imties slenksčiu (n<5 šablonas). Individualių elgsenos
   dosjė neegzistuoja kaip duomenų struktūra.
4. MOKSLAS DIRBA TIK SU ANONIMINIAIS DUOMENIMIS — be išimčių. Tyrimų
   sluoksnis struktūriškai neturi prieigos prie vardų, pavardžių, kontaktų,
   tikslių adresų ar tiesioginių identifikatorių: anonimizacija
   (pseudonimizuoti ID + agregacija + k-slenkstis) įvyksta PRIEŠ duomenims
   pasiekiant tyrimų sluoksnį. Identifikuotų tyrimų kategorija platformoje
   neegzistuoja.
5. Tyrimų įžvalgos gerina produktą visiems, bet niekada nekeičia konkretaus
   žmogaus galimybių — matching, matomumo, kainų ar pasiūlymų — jo privačių
   elgsenos duomenų pagrindu.
6. Tyrimų tikslai skaidriai aprašomi privacy policy; duomenų minimalizmas
   (§6) galioja ir tyrimams.

Sąsajos: §4 (default-closed), §6 (storage minimalizmas), §19 (Atitikties
principas — 5 punktas yra jo privatumo pusė), S12 anti-company-store
pasiūlymas (1 punkto atvejis). Techniniai invariantai užrakinti
`apps/web/lib/guards/privacy-base.test.ts`.

---

## Section 9 — Changelog (doctrine evolution)

| Date | Section(s) | Change | Author |
|---|---|---|---|
| 2026-05-21 | All | Initial doctrine established from DI architecture conversation (translation tokens, legal proof, append-only, default-closed, storage minimalism, AI-never-lies). | DI + Chat Claude |
| 2026-05-21 | §2.4, §2.5, §10 | Add §2.4 Locale set (binding, 10-locale canonical set; existing "Why this matters" renumbered §2.5). Promote §10 Lego architecture (slug→JSON for all extensible taxonomy) from v1.1 pending to active. (PR #8 architect review B4/B6.) | DI + Architect (Chat Claude) |
| 2026-05-21 | §5, §7.1, §15 | Amend §5 to the four-layer person→world model (personhood / RBAC / profession+skill / positions / engagement contexts). Insert §7.1 (AI as translator, not author). Add §15 (skill trust signals & productivity). Bundled with the M1 Work Journal implementation (TASK-M1-WORK-JOURNAL). | DI + Architect (Chat Claude) |
| 2026-05-30 | §16 | Add §16 Migration naming convention (forward-only `YYYYMMDDHHMMSS_snake_case.sql`; never rename applied `000N` migrations; ordering preserved; reversibility restated). Bundled with the single-product convergence PR (`feat/cc/converge-single-product`). | DI + Claude Code |
| 2026-05-30 | §17 | Add §17 Canonical demand intake (one model: `customer_requests`; draft via `save_demand_draft`, submit via `submit_demand_request`; `pilot_drafts` folded §17.1; `leads` kept as a distinct anonymous pre-auth funnel §17.2). The authenticated dashboard pilot-request CTA was repointed off `/api/leads` onto the canonical intake. Phase 3 / Slice 3.1 — 🟡 migration queued for the gate. | DI + Claude Code |
| 2026-06-11 | §20 | Add §20 Privatumo bazė (visomis kryptimis) — owner text 1:1 (the ONLY sanctioned doctrine edit of this slice): private choices/activity never visible to employers/agencies/customers in any form or aggregate; privacy is symmetric across all roles (platform physics, not a worker privilege); only the system sees statistics-grade aggregates with the n<5 small-sample pattern and behavioral dossiers do not exist as a data structure; SCIENCE WORKS ONLY WITH ANONYMOUS DATA (pseudonymized IDs + aggregation + k-threshold BEFORE the research layer; no identified-research category); research insights never alter an individual's matching/visibility/prices/offers based on their private behavioral data; research purposes transparent in the privacy policy, §6 minimalism applies. Guarded by `lib/guards/privacy-base.test.ts` (technical invariants + §20 text pins). Supersedes `docs/proposals/privacy-base-v2-DRAFT.md`. | DI + Claude Code |
| 2026-06-11 | §19 | Add §19 Atitikties principas (Fit, ne reitingas) — owner text 1:1 (the ONLY sanctioned doctrine edit of the S5 slice): people are never rated; a percentage exists only inside a concrete need context, always with its basis ("19 of 20 skills, 14 confirmed"), confirmed-vs-declared share always separated, per-context values differ by design. Guarded by `lib/guards/fit-not-rating.test.ts`; S6 fit spec note added. | DI + Claude Code |
| 2026-05-31 | §18 | Add §18 Realumo principas (no demo/pilot/intermediate layer — neither as text nor as concept in architecture/UX; real persisting features + honest empty states framed as a founder moment; only an honest `RUOŠIAMA` roadmap is allowed; honest product truth like "records are private / no matching engine" is NOT pilot framing and stays). Reinforces §7 + "no unlabeled fake data". Applied in product: removed the "order a pilot / request trial access" CTA framing, the Tier-2 readiness card, the pilot-readiness / pilot-mode framing, and the "thank you — we'll contact you" wrapper; lifted empty / first-login states to the founder moment. GREEN / additive — no schema, RLS, or auth change. | DI + Claude Code |

---

*End of doctrine. Amendments require DI's explicit approval and a row in §9.*
