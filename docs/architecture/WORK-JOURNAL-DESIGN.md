# Work Journal — Architecture Design

> ⚠️ SUPERSEDED WHERE CONFLICTING WITH UNIVERSAL ARCHITECTURE.
> The PR #9 universal architecture direction is now the execution compass.
> Tiler-specific M1 patterns in this document must not be implemented after PR #9.
> Keep this document for historical/architectural context only.
>
> Compass: `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`

**Version:** v1.0 (commit-ready baseline)
**Status:** Architect-approved. Ready for commit to `docs/architecture/`. Companion doctrine PR adds §5 four-layer amendment, §7.1, §15.
**Author:** Architect (Chat Claude)
**Audience:** DI (decision-maker), Claude Code / Antigravity / Codex (executors).
**Related docs:** `docs/PLATFORM_DOCTRINE.md`, `docs/PROJECT_VISION.md`, `docs/architecture/SCHEMA_INVENTORY.md`, `docs/TASK_HANDOFF_TEMPLATE.md`.

**History:**
- v0.1: initial design.
- v0.2: integrated DI sign-off on the first six open questions (tiler seed, provider-agnostic AI, doctrine PR sequence, no public score, scaffold client_report, §15 numbering).
- v1.0 (this): integrated DI decisions on `organizations` strategy (D3 → variant B scaffolded), engagement contexts as first-class entity (D4 → variant d), latent errors corrected against `SCHEMA_INVENTORY.md` (worker_id FK target, no Prisma, profession_id convention, language CHAR(2)).

DI noted: *"jei dar bus netobulai kada nors papildysim ar pakeisim bet šiai dienai tinka taip"* — this design is fit-for-purpose for M1–M3, not a permanent contract. Every layer is designed to be revisable per the Recovery & rollback principle (handoff template, PR #9).

---

## 0. Purpose

Work Journal is the **spine** of the platform (`docs/PROJECT_VISION.md` and §8 doctrine spirit). Without it, §7 (AI-never-lies) has nothing trustworthy to recommend from, and §1 (level-playing-field mission) stays rhetorical.

This document specifies the full Work Journal architecture so that schema choices made for **M1** (3–4 weeks, structured journal for tiler + manager confirm + closed loop + scaffolded organizations + engagement contexts as anchor) leave **no schema work** to be redone in M2 (freeform + AI extraction + custom unit UI + explicit engagement context management) or M3 (productivity dashboard + confidence UI + skill icons + client reports).

Implementation is phased — design is not.

---

## 1. Core principles

1. **Append-only.** Journal entries are never edited or deleted. Corrections are new entries linked via `superseded_by`. (§3)
2. **Server-side timestamps + hash chain.** Every entry carries `created_at` (DB default), `hash_prev`, `hash_self`. (§3)
3. **Default-closed visibility.** No outsider sees entries without explicit grant via project / team / org / engagement membership. (§4)
4. **Polymorphic by entry type.** Three entry types share one table: `freeform`, `structured`, `hybrid`. Type-specific data lives in a normalized metrics child + JSONB envelope, not in N separate tables.
5. **Profession-scoped structure.** Structured entry fields come from `profession_templates` registry, not hardcoded forms. Extensible per §10 (Lego).
6. **Author content language rule.** Every entry stores `original_text + original_language`. Viewers see translations rendered on read; no translations stored in DB. (§2)
7. **AI as translator, not author.** AI extracts candidate skills and metrics from freeform text and *suggests*; the worker confirms before anything persists. AI never auto-creates `worker_skills` records. (proposed §7.1, see §11.1)
8. **Two confirmation layers.** Worker confirms AI suggestions → entry exists as self-declared. Manager confirms entry → skills upgrade to verified, productivity data points become trustworthy.
9. **Provider-agnostic AI.** No vendor lock-in. AI extraction goes through an abstraction layer; Anthropic is the default, alternatives slot in. (§4.2)
10. **Custom measurement units per scope.** Workers, orgs, clients can define their own units; aggregation reconciles to base units via metadata. (§3.7 + §7.3)
11. **Personhood is singular; engagements are plural and open.** One person = one `profiles` row. Each engagement (with an organization, project, or as free-floating status) is its own row in `engagement_contexts`, classified by an extensible `relationship_types` slug registry. (proposed §5 four-layer amendment, §11.2)
12. **Work entries anchor to engagement context, not directly to organization.** The journal entry knows which engagement it belongs to; the engagement knows the organization (or doesn't, if free-floating). This makes a journal entry meaningful even for unemployed-in-Lithuania, consultant-in-Georgia, or collaborator-in-Vietnam contexts. (§3.1)

---

## 2. Entry types

| Slug | UI | When used |
|---|---|---|
| `freeform` | Plain text field (mobile-first), optional voice input in M4. AI extracts candidates afterward. | Low-friction daily logging. Target: workers uncomfortable with formal forms — the construction / trades / hospitality audience. The accessibility mission of §1. |
| `structured` | Profession-specific form pulled from `profession_templates`. Typed fields, validated. | Workers / managers who want exact metrics captured (tile m², driven km, units assembled). |
| `hybrid` | Structured form + freeform notes field. AI may still extract from the notes. | Default path once both UIs exist. Best signal-to-noise ratio. |

Every entry of every type carries `original_text` — for `structured`, this is auto-composed from the structured fields ("Padariau 18 m² plytelių objektui Vilniaus g. 12") so the multilingual rendering rule (§2 doctrine) applies uniformly.

---

## 3. Schema

> All migrations are **hand-written SQL** in `supabase/migrations/NNNN_*.sql`. Latest applied at design time: `0012`. M1 migration adds tables below; auto-applies via `supabase db push` on merge to `main`.
> Naming follows live-schema convention from `SCHEMA_INVENTORY.md`: `uuid PK`, `created_at timestamptz NOT NULL DEFAULT now()` on every table (omitted below to reduce noise), `updated_at` likewise unless stated otherwise, `text` for slugs and ISO codes, `CHAR(2)` for `original_language`.

### 3.1 `journal_entries`

```
id                       uuid PK
worker_id                uuid NOT NULL FK → workers(id) ON DELETE CASCADE
engagement_context_id    uuid NOT NULL FK → engagement_contexts(id) ON DELETE RESTRICT
entry_type_slug          text NOT NULL CHECK in ('freeform','structured','hybrid')
profession_id            uuid NULL FK → professions(id)

-- §2 author content
original_text            text NOT NULL
original_language        char(2) NOT NULL  -- aligned with countries.code style

-- §3 proof
hash_prev                text NULL          -- previous entry hash in this worker's chain
hash_self                text NOT NULL      -- sha256 of canonical entry payload

-- §4 visibility scope (client_report scaffolded from M1; UI in M3)
visibility_scope         text NOT NULL DEFAULT 'closed'
                         CHECK in ('closed','team','org','client_report','public_proof_link')

-- correction chain (no DELETE)
superseded_by            uuid NULL FK → journal_entries(id)

INDEX (worker_id, created_at DESC)
INDEX (engagement_context_id, created_at DESC)
```

Anchoring on `engagement_context_id` (not `organization_id` directly) is the key v1.0 shift: an entry by an unemployed person in Lithuania, a consultant for a Georgian company, or a collaborator on a Vietnamese project are all valid first-class entries — each pinned to its engagement, none second-class.

### 3.2 `journal_entry_metrics`

Normalized child for any measurable field.

```
id              uuid PK
entry_id        uuid NOT NULL FK → journal_entries(id)
metric_slug     text NOT NULL              -- e.g. 'area_done','tile_type','site_name'
value_numeric   numeric NULL
value_text      text NULL
unit_slug       text NULL FK → productivity_units(slug)
source          text NOT NULL CHECK in ('worker_input','ai_extracted','manager_corrected')

INDEX (entry_id)
INDEX (metric_slug)
```

### 3.3 `journal_entry_extractions`

Append-only audit of every AI extraction run.

```
id                       uuid PK
entry_id                 uuid NOT NULL FK → journal_entries(id)
ai_provider              text NOT NULL    -- 'anthropic','openai','local',...
ai_model                 text NOT NULL    -- e.g. 'claude-sonnet-4-7'
raw_response             jsonb NOT NULL
candidate_skills         jsonb NOT NULL   -- [{skill_slug, confidence, evidence_span}]
candidate_metrics        jsonb NOT NULL
worker_confirmed_at      timestamptz NULL
worker_confirmed_subset  jsonb NULL

INDEX (entry_id)
INDEX (ai_provider, created_at DESC)
```

### 3.4 `journal_entry_confirmations`

Manager confirmation events. Append-only.

```
id                              uuid PK
entry_id                        uuid NOT NULL FK → journal_entries(id)
confirmer_id                    uuid NOT NULL FK → profiles(id)
confirmer_engagement_context_id uuid NOT NULL FK → engagement_contexts(id)
confirmer_role                  text NOT NULL    -- 'manager','external_manager','organization_owner'
confirmation_scope              jsonb NOT NULL   -- {skills_confirmed:[...], metrics_confirmed:[...], notes:''}

INDEX (entry_id)
INDEX (confirmer_id, created_at DESC)
```

Application-layer invariant (enforced via row-level security or service code): the `confirmer_engagement_context_id` MUST share an `organization_id` with the entry's `engagement_context_id`. A manager from Org A cannot confirm a worker's entry made under Org B. This makes the trust chain auditable from the engagement layer alone.

### 3.5 `engagement_contexts` — NEW first-class entity (per DI D4)

```
id                    uuid PK
profile_id            uuid NOT NULL FK → profiles(id) ON DELETE CASCADE
organization_id       uuid NULL FK → organizations(id) ON DELETE SET NULL
project_id            uuid NULL FK → projects(id) ON DELETE SET NULL
relationship_slug     text NOT NULL FK → relationship_types(slug)
country_code          char(2) NULL FK → countries(code)
status                text NOT NULL DEFAULT 'active' CHECK in ('active','paused','ended')
started_at            date NULL
ended_at              date NULL
title                 text NULL                  -- free text personalization
description           text NULL
is_primary            boolean NOT NULL DEFAULT false

-- §3 proof (engagements are part of the trust chain too)
hash_prev             text NULL
hash_self             text NOT NULL

INDEX (profile_id, status, is_primary DESC)
INDEX (organization_id) WHERE organization_id IS NOT NULL
INDEX (project_id) WHERE project_id IS NOT NULL
```

DI's scenario maps directly: one profile, five engagements:

| relationship_slug | organization_id | project_id | country_code | status |
|---|---|---|---|---|
| `unemployed` | NULL | NULL | LT | active |
| `owner` | (PL company) | NULL | PL | active |
| `employee` | (NL company) | NULL | NL | active |
| `consultant` | (GE company) | NULL | GE | active |
| `collaborator` | NULL | (VN project) | VN | active |

CV is then a chronological render of this table.

### 3.6 `relationship_types` — NEW slug+JSON registry (per DI D4)

```
slug         text PK             -- 'owner','employee','consultant','collaborator','freelancer','unemployed','student','volunteer','mentor',...
category     text NOT NULL CHECK in ('employment','ownership','advisory','collaboration','status','education','other')
is_active    boolean NOT NULL DEFAULT true
```

Labels live in `messages/{locale}/relationship-types.json` keyed by slug. New relationship types can be added by inserting a row + adding label keys — no code change, no migration. Per §10 Lego.

M1 seed values: `owner`, `employee`, `manager`, `consultant`, `collaborator`, `freelancer`, `unemployed`, `student`, `volunteer`. Labels in all 10 locales (`[EN]` prefix for non-Tier-1, per §2.4).

### 3.7 `organizations` — NEW scaffolded root (per DI D3 variant B + D5 scaffolded approach)

```
id                  uuid PK
owner_profile_id    uuid NOT NULL FK → profiles(id) ON DELETE SET NULL
organization_type   text NOT NULL CHECK in ('company','agency','other')

-- Common identity
legal_name          text NULL
display_name        text NULL
country             char(2) NULL FK → countries(code)
description         text NULL

-- Type-specific (nullable based on type)
vat_number          text NULL
website             text NULL

-- Trust
trust_score         integer NOT NULL DEFAULT 0

-- Scaffold lineage — supports zero-disruption migration
legacy_company_id   uuid NULL FK → companies(id)
legacy_agency_id    uuid NULL FK → agencies(id)

INDEX (owner_profile_id)
INDEX (organization_type)
INDEX (legacy_company_id) WHERE legacy_company_id IS NOT NULL
INDEX (legacy_agency_id) WHERE legacy_agency_id IS NOT NULL
```

**Scaffolded migration** (per D5):
1. Create `organizations` table.
2. Backfill: insert one `organizations` row for every existing `companies` row (`organization_type='company'`, `legacy_company_id` set) and every existing `agencies` row (`organization_type='agency'`, `legacy_agency_id` set).
3. DB triggers: on INSERT/UPDATE to `companies` or `agencies`, mirror to `organizations`. On DELETE, soft-handle (don't cascade delete the organization unless explicit).
4. M2 will refactor `companies`/`agencies` into pure specialization tables joined to `organizations` (drops the mirroring, drops `companies.profile_id` in favor of `organizations.owner_profile_id`). M1 keeps both layers running.

This satisfies §14 pending two-PR rule: M1 does not destructively migrate `companies`/`agencies`; it adds a new layer alongside. M2 (separate PR cycle) performs the destructive collapse.

### 3.8 `profession_templates`

```
id                     uuid PK
profession_id          uuid NOT NULL FK → professions(id)
template               jsonb NOT NULL
is_platform_default    boolean NOT NULL DEFAULT true
organization_id        uuid NULL FK → organizations(id)

UNIQUE (profession_id, organization_id)
```

Template payload shape (tiler example):
```json
{
  "structured_fields": [
    {"slug":"site_name","type":"string","label_key":"journal.field.site_name","required":true},
    {"slug":"tile_type","type":"string","label_key":"journal.field.tile_type"},
    {"slug":"area_done","type":"number","unit_slug":"square_meters","label_key":"journal.field.area_done","required":true}
  ],
  "primary_productivity_unit_slug":"square_meters_per_day",
  "freeform_prompt_key":"journal.prompt.tiler",
  "icon_slug":"icon.tile"
}
```

All `label_key`, `freeform_prompt_key`, `icon_slug` values resolve through registries (locale JSON for text; icon registry for visuals — §8.3). No human-readable strings in DB.

### 3.9 `productivity_units` — scoped (per DI v0.1 §14 Q1)

```
slug                  text PK              -- 'square_meters_per_day','box_per_day',...
category              text NOT NULL        -- 'area_rate','count_rate','distance_rate','weight_rate','time'
base_unit_slug        text NULL FK → productivity_units(slug)

-- Scope
scope                 text NOT NULL CHECK in ('platform','org','worker','client')
created_by_profile_id uuid NULL FK → profiles(id)        -- null for platform defaults
organization_id       uuid NULL FK → organizations(id)   -- set when scope='org' or 'client'

-- Conversion to base unit
parent_unit_slug      text NULL FK → productivity_units(slug)
conversion_factor     numeric NULL         -- 1 box ≈ 1.4 m² → conversion_factor = 1.4

INDEX (scope, organization_id) WHERE scope != 'platform'
INDEX (parent_unit_slug) WHERE parent_unit_slug IS NOT NULL
```

Worker-defined unit names: slug generated server-side; the typed label stored as `original_text + original_language` against the slug and rendered via the multilingual layer (§2 + §9).

### 3.10 `worker_skills` extension (ALTER TABLE)

Existing columns (per `SCHEMA_INVENTORY.md`): `id`, `worker_id` (FK → `workers(id)` ✓), `skill_id`, `self_rated_level`, `verified`, `verified_by`, `verified_at`, `source`.

Added by M1:
```
+ current_pace_value      numeric NULL
+ current_pace_unit_slug  text NULL FK → productivity_units(slug)
+ confidence_score        integer NOT NULL DEFAULT 0
+ confidence_bin          text NOT NULL DEFAULT 'red' CHECK in ('red','green','yellow')
+ last_recompute_at       timestamptz NULL
```

Confidence is **derived** from confirmation events — recomputed (job) and cached here. Never user-editable.

### 3.11 `platform_skill_aggregates`

Materialized view (daily refresh) of platform-wide productivity per skill, fed by manager-confirmed entries only. Aggregation reconciles via `productivity_units.parent_unit_slug + conversion_factor` to the skill's primary base unit.

```
skill_id                    uuid PK FK → skills(id)
productivity_unit_slug      text          -- always a base unit
sample_size                 integer
mean_pace                   numeric
p25_pace                    numeric
p50_pace                    numeric
p75_pace                    numeric
last_refreshed_at           timestamptz
```

Until `sample_size >= 30` for a (skill, unit) pair, the value is masked behind a seed benchmark (§3.12) with explicit "industry-typical, not platform-measured" framing.

### 3.12 `skill_seed_benchmarks`

One-shot seed of industry-typical rates. Curated in M3.

```
skill_id                  uuid PK FK → skills(id)
productivity_unit_slug    text
typical_pace              numeric
source_note               text          -- 'curated 2026-Q3 from XYZ industry report'
```

### 3.13 `skill_icons`

```
skill_id           uuid PK FK → skills(id)
icon_slug          text NOT NULL          -- 'icon.tile','icon.welding_torch',...
source             text                   -- 'platform_default','org_override','community'
organization_id    uuid NULL FK → organizations(id)
```

Icon assets live in the frontend (SVG sprite); DB stores slug pointers. Adding a new icon = adding a sprite + DB row.

---

## 4. AI extraction pipeline

### 4.1 Flow (async)

1. Worker submits a `freeform` or `hybrid` entry. Entry persists immediately (append-only), `original_text` saved, pinned to current `engagement_context_id`.
2. Backend enqueues BullMQ job `extract-skills-from-entry` with `entry_id`.
3. Worker calls the configured AI provider (§4.2). Prompt returns JSON with candidate skill slugs (must exist in `skills`; unknown → `unknown` with raw phrase) and candidate metrics (slug + value + unit_slug + confidence + evidence span).
4. Response stored in `journal_entry_extractions` with `ai_provider` + `ai_model` columns.
5. Realtime push (Supabase Realtime — NOT socket.io; per executor flag during v0.2 review) → worker UI: "AI atrado 3 įgūdžius — peržiūrėk".
6. Worker one-tap confirms / rejects each candidate.
7. Confirmed skills → upsert `worker_skills` at `source='self_declared'`. Confirmed metrics → `journal_entry_metrics` with `source='ai_extracted'`.
8. Entry visible in manager confirm inbox (filtered to managers in same organization as entry's engagement).

§7 invariant: nothing in steps 4–7 mutates `worker_skills` without explicit worker confirmation. Nothing flips a skill to `verified` without manager confirmation (§5).

### 4.2 Provider-agnostic abstraction (per DI v0.1 §14 Q2)

- `AIExtractionProvider` interface in `packages/ai-extraction/` (requires `pnpm-workspace.yaml` glob update — currently only `apps/*`; M2 infra prerequisite).
- Implementations: `AnthropicProvider` (default), with stubs for `OpenAIProvider` and `LocalProvider`.
- Provider selection: env `AI_EXTRACTION_PROVIDER` (default: `anthropic`) → org-level override (M3+) → per-call override (rare).
- Every extraction logs actual provider+model used. Quality and cost analytics work across providers.
- Failure handling: retry with fallback chain; on full failure, entry remains valid, worker can manually tag.

**M2 infrastructure prerequisites flagged for the M2 handoff:**
- `pnpm-workspace.yaml` accepts `packages/*`.
- Redis provisioned (BullMQ requirement; not in stack today).
- Supabase Realtime channel configured (replaces socket.io).

---

## 5. Manager confirm flow

1. Manager opens "Patvirtinti įrašai" inbox. Filter: entries from workers in any `engagement_context` sharing an `organization_id` with the manager's own active engagement contexts where the manager has `relationship_slug IN ('manager','external_manager','owner')`.
2. Manager sees: entry's `original_text` (rendered in their preferred language), structured metrics, worker-confirmed skills, the engagement context the entry belongs to.
3. Manager actions per entry:
   - **Confirm as logged** → `journal_entry_confirmations` row with full scope.
   - **Confirm with correction** → manager adjusts metrics (`source='manager_corrected'`) or removes a skill from scope. Original worker data preserved (append-only); correction is a new metrics row + confirmation row.
   - **Reject with reason** → confirmation row with empty scope + reason text. Worker sees rejection.
4. Manager confirmation triggers:
   - Affected `worker_skills.verified = true` (if first manager-confirmed entry for that skill).
   - Confidence recompute job.
   - Productivity data point recorded for `platform_skill_aggregates` next refresh.

---

## 6. Confidence indicator

Per `worker_skills` row.

### 6.1 Score formula (draft v1)

```
score = (#manager_confirmed_entries × 3)
      + (#self_logged_entries × 1)
      + (#unique_confirmer_managers × 5)
      + recency_boost
```

`recency_boost`: +5 if any confirmation within 30d, +2 if within 90d, 0 otherwise. Score capped at 100.

### 6.2 Bin mapping

| Bin | Condition | Visual (M3 CV viewer side) |
|---|---|---|
| `red` | score == 0 | red dot — declared, never proven |
| `green` | 0 < score < 30 | green dot — proven, thin evidence |
| `yellow` | score ≥ 30 | yellow / amber dot — strongly proven |

Color semantics per DI: yellow = strong, green = some, red = none.

**Numeric score visibility (DI decision):** never exposed to external viewers by default. Schema supports per-jurisdiction override (Lithuania salary-transparency precedent) via config flag, not code change.

### 6.3 Recompute trigger

Every manager confirmation → enqueue `recompute-skill-confidence` job for affected worker_skill rows. Score persisted with `last_recompute_at`.

### 6.4 Worker self-progress view

Worker sees on their own dashboard:
- **Total skills declared:** N
- **By confidence bin:** "Stipriai patvirtinti: 3 · Patvirtinti: 5 · Dar laukia įrašų: 4"
- **Next nudge:** "Įrašyk darbo dieną — 2 įgūdžiams reikia tik vieno manager patvirtinimo."

Visible only to the worker themselves on their own profile. Never to other viewers. Gamification through self-progress, never peer-ranking. (Per DI v0.1 §14 Q4 amendment.)

---

## 7. Productivity metric layer

### 7.1 Per worker (per skill)

`worker_skills.current_pace_value` = rolling average of last *N* manager-confirmed metric values for the matching `productivity_unit_slug` (N: last 90d OR last 20 confirmed entries, whichever is more).

Recomputed on each manager confirmation involving that unit.

### 7.2 Per platform (per skill)

`platform_skill_aggregates` — materialized view, daily refresh, manager-confirmed entries only.

Until threshold met, falls back to `skill_seed_benchmarks` with explicit "industry-typical, not platform-measured" framing.

### 7.3 Custom units across scopes (per DI v0.1 §14 Q1)

| Scope | Who creates | Example |
|---|---|---|
| `platform` | Platform admin / seed. Authoritative base units. | `square_meters_per_day`, `units_per_hour` |
| `org` | `organization` owner. | "Vidinė normuota valanda" |
| `worker` | The worker themselves. | "Vonios kambarys per dieną" |
| `client` | A client organization. | "Objektas X" (specific contract unit) |

**Aggregation rule:** platform aggregates reconcile to the skill's primary base unit. Custom-unit values with `parent_unit_slug + conversion_factor` are converted automatically. Without conversion: contributes to worker's own history, not to platform aggregates.

**Display rule:** workers and viewers see units as logged ("Vonios kambarys per dieną — 1.3 vid."), with the base equivalent as a quiet secondary line ("≈ 8.2 m²/dieną") when conversion exists.

### 7.4 Surfaces (M3)

- CV viewer side: "Plytelės — 12.4 m²/dieną · rinkos vidurkis 10.8 m²/dieną"
- Hiring side: market price hint per skill — §13 monetization seed
- Worker dashboard: own pace vs platform average — informative, not shaming

---

## 8. CV auto-generation

### 8.1 Read-model derivation

CV is a **derived** read-model over `engagement_contexts` + `journal_entries` + `worker_skills`. No CV table.

The visual structure: chronological / current-first stream of engagement context cards. Each card shows:
- Organization name (or "Self-employed" / "Looking for work" / project name for free-floating contexts).
- Relationship label (resolved from slug → JSON).
- Country, dates.
- Skills exercised in this context (drawn from journal entries pinned to this engagement) with the icon + color + pace composition (§8.2).

Default-closed (§4) applies: a viewer sees only engagements + entries they have explicit grant for. Public proof links (M4+) tokenize specific subsets.

### 8.2 Skill card composition

```
┌─────────────────────────────────────────────────┐
│  [🟨 icon]   Plytelių klojimas                   │
│             ● yellow · 12.4 m²/dieną             │
│             (rinkos vidurkis: 10.8 m²/dieną)     │
└─────────────────────────────────────────────────┘
```

1. **Icon** — `skill_icons.icon_slug` lookup; fallback: profession-level icon from `profession_templates`; ultimate fallback: generic placeholder.
2. **Color dot** — confidence bin from §6.2.
3. **Pace value** — `current_pace_value + unit_slug`; platform comparison shown when sample size sufficient.

**M1 vs M3 progression:**

| Layer | M1 | M2 | M3 |
|---|---|---|---|
| Skill name | ✅ | ✅ | ✅ |
| `PAGRINDINIS` primary badge | ✅ | ✅ | ✅ |
| Confidence color dot | ✅ (all red until first confirmation) | ✅ | ✅ (full recompute live) |
| Icon | ⚠️ Profession-level only | ⚠️ Skill-level for top 30 skills | ✅ Skill-level for all skills |
| Pace value | ❌ | ❌ | ✅ |
| Platform comparison | ❌ | ❌ | ✅ |

### 8.3 Slug → icon registry

See §3.13 `skill_icons`.

---

## 9. i18n + localization

- `original_text` preserved per entry forever (10 chars max for `original_language` ISO code).
- Viewer's `preferred_language` triggers on-read translation; "Show original" reveals stored text.
- All slugs (`metric_slug`, `unit_slug`, `entry_type_slug`, `skill_slug`, `relationship_slug`, `label_key`, `icon_slug`) resolve through 10-locale JSON layer (§2.4). No human-readable strings in DB — including worker-defined custom unit names (§3.9 trailing note) and engagement titles (treated as author content).
- New locale namespaces added in M1: `messages/{locale}/relationship-types.json`, `messages/{locale}/productivity-units.json`, `messages/{locale}/journal.json`. All 10 files exist with Tier-1 (EN, LT) human translations and `[EN]` prefix placeholders for the other 8.

---

## 10. Privacy + permissions

Default-closed (§4). Visibility scope per entry:

| `visibility_scope` | Sees the entry |
|---|---|
| `closed` (default) | The worker; managers active in the same `organization_id` as the entry's engagement; org owner. |
| `team` | Above + members in the same team (M2 team model). |
| `org` | Above + everyone with active engagement in the same organization. |
| `client_report` | Above + the client of the project, **only via curated report** (M3+; never raw). Scaffolded in CHECK from M1. |
| `public_proof_link` | Tokenized share link, expiring, redacts originals (M4+). |

`platform_skill_aggregates` is aggregate-only — no entry-level leakage. Sample size + redaction enforced server-side.

**Jurisdictional override:** if a regulator mandates transparency of confidence scores or pace values, exposure happens per-region via config flag, not code change. Schema supports it (§6.2); product surface and UI default stay closed.

---

## 11. Doctrine updates required

### 11.1 Proposed §7.1 — AI as translator, not author

> **§7.1 AI as translator, not author.** AI MAY read user-authored content (freeform journal entries, voice transcripts, document uploads) and SUGGEST structure (candidate skills, candidate productivity values, candidate metadata). AI MUST NEVER persist these suggestions to verified records autonomously. The workflow is always: free text → AI suggests → human (worker for self-declared layer, manager for verified layer) confirms → entry persists at the appropriate trust level. All AI extraction runs are logged append-only with provider + model + raw response + worker's accepted subset, so the trust chain remains auditable indefinitely. This rule extends §7; it does not relax it.

### 11.2 Proposed §5 amendment — Four layers of person → world (per DI D4)

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

### 11.3 Proposed §15 — Skill trust signals & productivity

> **§15 Skill trust signals & productivity.** Every `worker_skill` carries a derived `confidence_score` (numeric) and `confidence_bin` (red / green / yellow), and may carry a `current_pace_value + unit_slug`. These signals are computed from append-only journal entries + manager confirmations — never user-editable. Platform-wide aggregates per skill are fed only by manager-confirmed entries, refreshed on a fixed cadence, and gated by a minimum sample size below which a curated industry-seed benchmark is shown with explicit "industry-typical, not platform-measured" framing. Productivity units live in a slug registry per §10 and may be created at platform, org, worker, or client scope; cross-unit aggregation normalizes to a declared base unit via `parent_unit_slug + conversion_factor` metadata. UI surfaces are gated by §4 visibility and §7 / §7.1 (AI may surface but never edit them). The numeric confidence score is hidden from external viewers by default; schema supports per-jurisdiction transparency exposure via config flag. Workers MAY see numeric counts of their own skills broken down by confidence bin as a self-progress motivator — private self-view, never used for peer comparison.

All three sections land in a single doctrine PR after this design doc is committed — see §16.

---

## 12. Phased implementation map

| Phase | UI visible | Schema built |
|---|---|---|
| **M1** (3–4 weeks) | Structured journal for **tiler**. Worker creates entry → manager confirm → verified + confidence updated. CV view shows verified skills with color bin + profession-level icon. Worker self-progress counter. Engagement contexts auto-created from existing profile_roles / companies / agencies during migration; not yet UI-managed. | All §3 tables. tiler `profession_template` seeded. Platform-default units seeded. `organizations` scaffolded with triggers from `companies`/`agencies`. `engagement_contexts` backfilled. `relationship_types` seeded. `journal_entry_extractions` table built but unused. `platform_skill_aggregates` view exists but empty. `client_report` in CHECK constraint scaffolded. |
| **M2** | Freeform entry UI + AI extraction live. Hybrid entries. 5–10 profession templates seeded. Provider abstraction live with Anthropic default. Custom unit creation UI for workers + orgs. Skill-level icons for top 30 skills. **Explicit engagement context management UI** ("Pridėk savo kontekstą" flow). PR #8 onboarding refactored to engagement-context-first. | CV import (Level 0) lands as adjacent feature. `pnpm-workspace.yaml` accepts `packages/*`. Redis provisioned. Supabase Realtime channels live. |
| **M3** | Productivity dashboard with sample-size disclosure. Confidence bin + pace value visible on CV viewer. Skill-level icons for all skills. Market intelligence preview = §13 monetization seed. Client report curator UI. **Destructive collapse of companies/agencies into organizations specializations** (separate two-PR rule per §14). | Seed benchmarks curated for top 30 skills. Materialized view refresh cron live. |
| **M4+** | Voice input → transcription → freeform extraction. AI agents (6 types per vision §8). Custom per-conversation visibility. Public proof links. | — |

---

## 13. M1 scope — concrete

### 13.1 UI

**Worker side:**
- New nav section "Mano dienoraštis" on profile, shown when worker has at least one active engagement context with `relationship_slug IN ('employee','freelancer','consultant','owner','collaborator')`.
- "+ Naujas įrašas" → tiler form:
  - Date (defaults to today, editable within 7 days back).
  - **Engagement context selector** (dropdown of worker's active engagements; auto-selected to primary).
  - Site name (text, required).
  - Tile type (text, M1 free-input — slug taxonomy in M2).
  - Area done (number). Unit dropdown defaults to `square_meters` with `box_per_day` as alternative (validates custom-unit path from day 1).
  - Notes (textarea; populates `original_text` if provided, else `original_text` auto-composed from structured fields).
- Submit → entry persists, status = submitted, awaiting manager confirm.
- Entry list with status badges (submitted / confirmed / rejected).
- **Worker self-progress counter on dashboard** ("Tu turi N įgūdžių: X stipriai patvirtinti, Y patvirtinti, Z laukia").

**Manager side:**
- "Patvirtinti įrašai" inbox listing entries from workers in shared organizations.
- Per-entry detail: rendered in manager's locale, original toggle, structured metrics shown, worker-confirmed skills.
- Buttons: Confirm / Confirm with correction / Reject.

**Viewer side (CV):**
- Engagement context cards (chronological, current first).
- Each card lists verified skills with confidence color dot + profession-level icon.
- No pace value, no platform comparison (M3).

### 13.2 Schema (migration `0013_work_journal_m1.sql`)

All §3 tables created, even those unused in M1 UI. Migration must be reversible per Recovery & rollback rule.

Seeded data:
- `productivity_units` platform scope: `square_meters`, `square_meters_per_day`, `box_per_day` (with conversion).
- `relationship_types`: `owner`, `employee`, `manager`, `consultant`, `collaborator`, `freelancer`, `unemployed`, `student`, `volunteer`.
- `profession_templates`: one row for tiler.
- `skill_icons`: minimal seed for tiler's core skills, profession-level fallback.
- `skill_seed_benchmarks`: empty in M1.

Backfill:
- For every existing `companies` row: insert `organizations` (`type='company'`, `legacy_company_id` set, copy `legal_name`, `country`, etc.).
- For every existing `agencies` row: insert `organizations` (`type='agency'`, `legacy_agency_id` set).
- For every existing `workers.profile_id`: insert `engagement_contexts` with `relationship_slug='employee'` (or `'unemployed'` if no employer associations), `is_primary=true`. If the profile also owns a company/agency, insert additional `engagement_contexts` with `relationship_slug='owner'`.
- Triggers: on INSERT/UPDATE to `companies` or `agencies`, mirror to `organizations`. No DELETE cascade.

### 13.3 Explicitly deferred from M1

- Freeform entry UI (M2).
- AI extraction job + worker (M2).
- Productivity dashboard (M3).
- Pace value on CV viewer side (M3).
- Skill-level icons (M3); M1 uses profession-level only.
- Numeric confidence score anywhere except worker self-view (§6.4).
- Profession templates beyond tiler (M2 brings 5–10).
- Custom unit creation UI (M2); M1 uses pre-seeded units only.
- **Explicit engagement context management UI** (M2); M1 auto-manages contexts from existing data.
- Voice input (M4+).
- Materialized view refresh cron (M3).
- Client report curator UI (M3).
- Destructive collapse of `companies`/`agencies` into `organizations` (M3, separate two-PR cycle per §14).

### 13.4 Hard schema requirements (don't skip in M1)

- `journal_entries.engagement_context_id` NOT NULL from M1.
- `journal_entries.original_text + original_language` populated on every M1 entry (auto-composed if user did not write notes).
- `productivity_units.scope + created_by_profile_id + parent_unit_slug + conversion_factor` present from M1.
- `visibility_scope` CHECK includes `client_report` from M1.
- `journal_entry_extractions` and `journal_entry_confirmations` tables exist from M1.
- `organizations` scaffolded + triggers active from M1.
- `engagement_contexts` + `relationship_types` populated from M1.
- `worker_skills.confidence_*` columns present.

---

## 14. Decisions log

| # | Question | DI decision |
|---|---|---|
| 1 | Seed profession for M1 | **Tiler.** Plus custom unit scope architecture from M1. |
| 2 | AI provider for M2 | **Provider-agnostic abstraction.** Anthropic default, switchable. |
| 3 | Doctrine update PR sequence | **Variant A — separate doctrine-only PR before M1 implementation.** |
| 4 | Numeric confidence score visibility | **Never to external viewers by default.** Per-jurisdiction override via config. Worker self-view shows own counts. |
| 5 | Client report scaffold | **Scaffold in `visibility_scope` CHECK from M1.** |
| 6 | §15 numbering | **§15 taken as default.** |
| 7 (D3) | Organizations multi-tenant root | **Variant B — `organizations` table.** |
| 8 (D4) | Roles taxonomy structure | **Variant d — `engagement_contexts` as first-class entity with open `relationship_types` registry.** §5 amended to four-layer model. |
| 9 (D5) | Organizations migration approach | **Scaffolded — `organizations` mirrors `companies`/`agencies` via triggers in M1. Destructive collapse in M3 (two-PR cycle per §14).** |

### Remaining open items (v1.0)

None that block M1 implementation. Two minor sign-offs before doctrine PR:

- **D10.** Final wording of §5 four-layer amendment, §7.1, §15 above — copy tweaks possible.
- **D11.** Whether to formalize candidate `§16 Reversibility & fixability` in the same doctrine PR or queue separately. Recommendation: queue separately (PR #9 handoff template already operationalizes the principle).

---

## 15. Out of scope (this document)

- Anything not directly part of journal entry creation → confirmation → derived CV / signals / engagement display.
- Notifications inbox UX details.
- Mobile native vs PWA decision.
- Monetization mechanics beyond signaling M3+ surfaces.
- Specific AI prompt engineering (separate spec at M2 handoff time).
- Platform-admin / super-admin functionality (separate `PLATFORM-ADMIN-DESIGN.md`, outline pending).
- Refactor of `messages` + `audit_logs` M0 stubs into append-only patterns (tracked in `TASKS.md`; M3+).
- Migration of `countries.name_*` and `plans.name_*` to slug+JSON (tracked in `TASKS.md` backlog).

---

## 16. Next steps

1. DI reviews v1.0 and signs off on D10 / D11 from §14.
2. Architect produces doctrine update handoff `docs/handoffs/TASK-DOCTRINE-WORK-JOURNAL.md` containing §5 amendment + §7.1 + §15 verbatim text. Mark ready immediately; doc-only, no code.
3. DI merges doctrine PR.
4. Architect produces M1 implementation handoff `docs/handoffs/TASK-M1-WORK-JOURNAL.md` derived from §13.
5. Executor (Claude Code) builds M1 — migration `0013`, UI, backfill, triggers, seed data.
6. After M1 merge, M2 design follow-up (CV import polish + freeform UI + AI extraction worker + 5–10 profession templates + custom unit creation UI + explicit engagement context UI + PR #8 onboarding refactor to engagement-first).
