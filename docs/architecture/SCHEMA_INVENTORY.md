# Schema Inventory — current state

**Date:** 2026-06-10
**Source:** synthesized from `supabase/migrations/` files (`0001` … `0036`, then the
timestamped `20260530…` – `20260609…` set) — **NOT** live-DB introspection.
**Supabase project:** `gorgitwvdzxbnaxhrsrw` (production = `main`)

> ⚠️ **Known caveats of the file-derived method:**
> - Repo filenames may NOT match the production migration ledger versions — several
>   migrations were applied via MCP `apply_migration` under different version stamps
>   (this is exactly why `supabase db push` is forbidden; see CLAUDE.md "Merge model").
> - The **applied-status of each timestamped migration is NOT asserted** by this
>   document. Some timestamped files are explicitly marked `DRAFT — needs-human-gate`
>   in their headers (e.g. `20260601090000`, `20260601091000`); this inventory
>   describes the cumulative state **if/when all files are applied**. Verify a
>   specific object against prod before depending on it.
> - This replaces the 2026-05-21 introspected inventory (state as of `0012`).
>   **If schema changes, update this file in the same PR.**

All tables are in the `public` schema (plus one private storage bucket).
`auth.users` is Supabase-managed; `public.profiles.id` is a FK to `auth.users(id)`.
Unless noted, every table has `id uuid PK DEFAULT gen_random_uuid()`,
`created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()`
(maintained by the shared `set_updated_at()` trigger); these are omitted from the
column blocks to reduce noise.

**Grant model (critical):** this project has **NO Supabase default privileges**.
Every table the app's `authenticated` session touches needs an explicit `GRANT`
(0004 / 0010 headers). Tables with **no grant** are reachable by the user session
**only** through SECURITY DEFINER RPCs / triggers — direct reads silently fail
with `permission denied`.

---

## Identity

### `profiles` — one row per authenticated person (the singular identity root)
```
id                       uuid PK,  FK → auth.users(id) ON DELETE CASCADE   (no default; = auth user id)
active_role              text NULL                                          -- current workspace (0003 replaced `role`)
locale                   text NOT NULL DEFAULT 'lt'
full_name                text NULL
email                    text NULL
phone                    text NULL
country                  text NULL
onboarded                boolean NOT NULL DEFAULT false
onboarded_at             timestamptz NULL
consent_marketing        boolean NOT NULL DEFAULT false
consent_data_processing  boolean NOT NULL DEFAULT false
profile_text             text NULL          -- 0014: owner-only raw CV/narrative; NOT employer-readable
CHECK: active_role IS NULL OR active_role IN ('worker','company','agency','customer','admin')
```
RLS: select/insert/update self-or-admin; delete admin-only.
Grants: full CRUD to `authenticated` (0004).
Triggers: `on_auth_user_created` (auth.users → `handle_new_user()`, creates profile +
initial profile_roles row), `on_profile_created_ensure_worker` (0009 — **every**
profile gets a `workers` row; worker = universal base).

### `profile_roles` — multi-role catalogue (one row per held role)
```
id          uuid PK
profile_id  uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
role        text NOT NULL  CHECK IN ('worker','company','agency','customer','admin')
is_active   boolean NOT NULL DEFAULT true
role_data   jsonb NOT NULL DEFAULT '{}'
added_at    timestamptz NOT NULL DEFAULT now()
UNIQUE (profile_id, role)
```
RLS: all verbs self-or-admin. Grants: full CRUD to `authenticated` (0004).
`profiles.active_role` is the current workspace; admin is a **dual signal** —
`is_admin()` (0024) returns true for `active_role='admin'` OR a `profile_roles`
row with `role='admin'`.

---

## Organizations & ownership

> Since migration **0013** there IS a `public.organizations` table — the canonical
> multi-tenant root. In the current (transitional) model `companies` / `agencies`
> remain the **legacy write surfaces**; AFTER INSERT/UPDATE **mirror triggers** copy
> them into `organizations` (`legacy_company_id` / `legacy_agency_id` bridge columns).
> People connect to organizations through `engagement_contexts` rows
> (relationship slugs from `relationship_types`). The destructive collapse of
> companies/agencies into organizations is still deferred.

### `organizations` — canonical org root (0013; mirrored from companies/agencies)
```
id                 uuid PK
owner_profile_id   uuid NULL  FK → profiles(id) ON DELETE SET NULL
organization_type  text NOT NULL  CHECK IN ('company','agency','other')
legal_name         text NULL
display_name       text NULL
country            text NULL  FK → countries(code)
description        text NULL
vat_number         text NULL
website            text NULL
trust_score        integer NOT NULL DEFAULT 0
legacy_company_id  uuid NULL  FK → companies(id)
legacy_agency_id   uuid NULL  FK → agencies(id)
```
RLS: select `using (true)`; write admin-only (M1 writes happen via the definer
mirror triggers). Grant: SELECT to `authenticated` (0013).
Triggers: `on_org_owner_engagement` (0035 — every new org gets its owner an
active `owner` engagement_context; 0035 also backfilled existing orgs).

### `relationship_types` — slug registry for engagement relationships (0013)
```
slug       text PK
category   text NOT NULL  CHECK IN ('employment','ownership','advisory','collaboration','status','education','other')
is_active  boolean NOT NULL DEFAULT true            -- no updated_at
```
Seeded: owner, employee, manager, consultant, collaborator, freelancer,
unemployed, student, volunteer. RLS: select true / write admin. Grant: SELECT.

### `engagement_contexts` — person ↔ org/project relationship, first-class (0013)
```
id                      uuid PK
profile_id              uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
organization_id         uuid NULL  FK → organizations(id) ON DELETE SET NULL
project_id              uuid NULL  FK → projects(id) ON DELETE SET NULL
relationship_slug       text NOT NULL  FK → relationship_types(slug)
country_code            text NULL  FK → countries(code)
status                  text NOT NULL DEFAULT 'active'  CHECK IN ('active','paused','ended')
started_at / ended_at   date NULL
title / description     text NULL
is_primary              boolean NOT NULL DEFAULT false
hash_prev               text NULL
hash_self               text NOT NULL                      -- per-row sha256 content hash
operations_role         text NULL                          -- 20260530140000 (canonical ops role)
journal_review_enabled  boolean NOT NULL DEFAULT false     -- 20260530140000 (CANONICAL review gate)
```
RLS: select own OR `manages_organization(organization_id)` OR admin;
write own-or-admin (privileged cross-profile writes go through RPCs only).
Grant: SELECT to `authenticated`.
The hash convention today is a per-row content hash (`sha256(profile:slug:org)`),
hash_prev unused — a true linked chain is tracked as future hardening.

### `companies` — legacy company surface + verification ladder
```
id                   uuid PK
profile_id           uuid NULL  FK → profiles(id) ON DELETE SET NULL,  UNIQUE (conditional — see note)
legal_name           text NULL
display_name         text NULL
country              text NULL
vat_number           text NULL
website              text NULL
description          text NULL
trust_score          integer NOT NULL DEFAULT 0
registration_code    text NULL                              -- 20260604120000
address              text NULL
contact_email        text NULL
contact_phone        text NULL
requester_role       text NULL                              -- the user's role inside the company
verification_status  text NOT NULL DEFAULT 'active_unverified'
                     CHECK IN ('draft','active_unverified','needs_checks',
                               'pending_verification','unverified','verified')   -- 6-state (20260604140000)
verification_note    text NULL
requested_at         timestamptz NULL
```
RLS: select any authenticated; insert own+`profile_role()='company'` or admin;
update/delete owner-or-admin. **Grant: SELECT only** (0023) — the only user write
path is the `save_company_setup` RPC.
Verification model is **automatic-first** (20260604140000): saving makes the
company usable immediately (`active_unverified`, or `needs_checks` when an
automated shape check fails); `pending_verification` only on explicit escalation;
`verified` is admin-only via `admin_set_company_verification`.
Triggers: `on_company_mirror_org` (→ organizations) and
`trg_company_verification_guard` — only an admin can promote to `'verified'` on
ANY write path (defense-in-depth, BEFORE INSERT/UPDATE).
Note: `companies_profile_id_key UNIQUE(profile_id)` is added conditionally — only
when no legacy duplicate rows exist at apply time.

### `agencies` — legacy agency surface
```
id          uuid PK
profile_id  uuid NULL  FK → profiles(id) ON DELETE SET NULL
legal_name  text NULL
country     text NULL
description text NULL
```
RLS: select any authenticated; insert own+`profile_role()='agency'` or admin;
update/delete owner-or-admin. **NO table grant to `authenticated`** — direct
user-session reads fail; agency rows are created/read only via SECURITY DEFINER
RPCs (`add_role`, `complete_onboarding`, ownership helpers).
Trigger: `on_agency_mirror_org` (→ organizations).

### `company_workers` — company ↔ worker roster (0027) + ops bridge (0030)
```
company_id              uuid FK → companies(id) ON DELETE CASCADE
worker_id               uuid FK → workers(id)   ON DELETE CASCADE
status                  text NULL  CHECK IN ('active','paused','removed')
operations_role         text NULL  CHECK IN ('worker','foreman','project_manager','company_admin','agency_admin')
operations_title        text NULL
journal_review_enabled  boolean NOT NULL DEFAULT false      -- LEGACY gate; see ⚠️ below
journal_review_scope    text NULL
PK (company_id, worker_id)
```
RLS: select owner/worker/admin; write owner-or-admin. Grant: full CRUD (0027) —
but link creation in practice flows through invitation + acceptance RPCs.

### `agency_workers` — agency ↔ worker roster (0001) + ops bridge (0030)
Same column shape as `company_workers` (PK `(agency_id, worker_id)`,
`agency_id FK → agencies`). RLS: select agency-owner/worker/admin; write
agency-owner-or-admin. **NO table grant to `authenticated`** — writes happen via
SECURITY DEFINER RPCs (`accept_agency_worker_invitation`, assignment RPCs).

> ⚠️ **Two `journal_review_enabled` flags exist.** 0030/0033 put the flag on the
> roster tables and 0033's `set_*_worker_journal_review` RPCs flip it there; but
> `20260530140000` moved the **canonical** review gate to
> `engagement_contexts.journal_review_enabled` (flipped via
> `set_engagement_journal_review`), and the live `review_journal_entry` /
> `reviewable_journal_entry_ids` read ONLY the engagement flag. The roster-table
> flag is now legacy; the roster tables are slated for retirement in a later slice.

### `agency_worker_invitations` (0025) / `company_worker_invitations` (0027)
```
id                  uuid PK
agency_id|company_id uuid NOT NULL  FK → agencies|companies ON DELETE CASCADE
invited_email       text NOT NULL  CHECK (email regex)
status              text NOT NULL DEFAULT 'pending'  CHECK IN ('pending','accepted','cancelled','expired')
inviter_profile_id  uuid NOT NULL  FK → profiles(id)
note                text NULL
accepted_at         timestamptz NULL
expires_at          timestamptz NULL                       -- no updated_at trigger wired
UNIQUE (agency_id|company_id, invited_email)
```
RLS: select org-owner OR invitee (email match) OR admin; update org-owner/admin;
insert admin-only (real inserts go through the `invite_*_worker` RPCs).
Grants: SELECT, UPDATE. Acceptance (pending → accepted + roster link) is the
worker-initiated `accept_*_worker_invitation` RPC (0036).

---

## Workers

> **Worker FK convention:** every worker-scoped table keys on `workers(id)`, NOT
> `profiles(id)`. A worker resolves to a person via `workers.profile_id` (UNIQUE).
> Since 0009 **every profile automatically has a workers row** (trigger + backfill).

### `workers` — universal base profile; one per person
```
id                        uuid PK
profile_id                uuid NULL  FK → profiles(id) ON DELETE CASCADE,  UNIQUE
display_name              text NULL
headline                  text NULL
bio                       text NULL
experience_years          integer NULL
current_location_country  text NULL
preferred_countries       text[] NULL
availability_status       text NULL  CHECK IN ('available','busy','unavailable')
available_from            date NULL
salary_min_eur            integer NULL
salary_max_eur            integer NULL
trust_score               integer NOT NULL DEFAULT 0        -- system field, never user-writable
profile_completeness      integer NOT NULL DEFAULT 0        -- system field, never user-writable
work_card_confirmed_at    timestamptz NULL                  -- 20260608120000 (work-card staleness)
```
RLS: select self/admin/employer; insert self+role-worker or admin; update/delete
self-or-admin. **Grant: SELECT only** (0010) — card writes go through
`save_worker_card` / `confirm_worker_card` (whitelisted fields only; system
fields unreachable), creation through onboarding RPCs / the 0009 trigger.

### `worker_skills` — declared/verified skills + trust signals
```
id                      uuid PK
worker_id               uuid NULL  FK → workers(id) ON DELETE CASCADE
skill_id                uuid NULL  FK → skills(id)  ON DELETE CASCADE
self_rated_level        integer NULL  CHECK 1..5
verified                boolean NOT NULL DEFAULT false
verified_by             uuid NULL  FK → profiles(id)
verified_at             timestamptz NULL
source                  text NOT NULL DEFAULT 'self_declared'  CHECK IN ('self_declared','work_journal','manager_confirmed')
current_pace_value      numeric NULL                              -- 0013
current_pace_unit_slug  text NULL  FK → productivity_units(slug)  -- 0013
confidence_score        integer NOT NULL DEFAULT 0                -- 0013
confidence_bin          text NOT NULL DEFAULT 'red'  CHECK IN ('red','green','yellow')  -- 0013
last_recompute_at       timestamptz NULL                          -- 0013
UNIQUE (worker_id, skill_id)
```
RLS: select owner/admin/employer; write owner-or-admin. Grant: full CRUD (0010).
Verification flips ONLY via `confirm_entry_and_verify_skills`
(`source='manager_confirmed'`, `confidence_bin='green'`) — the proof moment.

### `worker_professions` — worker's profession(s); one primary
```
id             uuid PK
worker_id      uuid NOT NULL  FK → workers(id)      ON DELETE CASCADE
profession_id  uuid NOT NULL  FK → professions(id)  ON DELETE RESTRICT
is_primary     boolean NOT NULL DEFAULT false
UNIQUE (worker_id, profession_id);  partial UNIQUE (worker_id) WHERE is_primary
```
RLS: select owner/employer/admin; write owner-or-admin. Grant: full CRUD (0010).

### `profile_skill_claims` — owner-only free-label claims (0015)
```
id               uuid PK
profile_id       uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
label            text NOT NULL                       -- verbatim user text
normalized_label text NOT NULL                       -- lowercased/trimmed dedupe key
source           text NOT NULL DEFAULT 'profile_text'   CHECK IN ('profile_text')
status           text NOT NULL DEFAULT 'self_declared'  CHECK IN ('self_declared')
visibility       text NOT NULL DEFAULT 'closed'         CHECK IN ('closed')
UNIQUE (profile_id, normalized_label)
```
RLS: owner-only every verb (select also admin). Grant: full CRUD.
Deliberately NOT employer-readable — never add `is_employer()` to its policies.

### `skill_candidate_clarifications` — unknown-skill clarify capture (20260609160000)
```
id               uuid PK
profile_id       uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
label            text NOT NULL
normalized_label text NOT NULL
related_to       text NULL
tools_materials  text NULL
often_with       text NULL
UNIQUE (profile_id, normalized_label)
```
RLS: owner-only (no admin read). Grant: full CRUD. Self-declared candidate
signals — never verified, never auto-mapped.

---

## Taxonomy registries

### `skills` — curated skill taxonomy (slug + JSON labels)
```
id          uuid PK
slug        text NULL  UNIQUE          -- e.g. 'mig-mag-welding'
category    text NULL                  -- e.g. 'construction.welding'
is_active   boolean NOT NULL DEFAULT true
```
Names live in `messages/{locale}/skill-names.json` keyed by slug (name_* dropped
in 0012). ~94 rows (0002 + 0011). RLS: select true / write admin. Grant: SELECT.

### `professions` — curated profession taxonomy (slug + JSON labels)
```
id          uuid PK
slug        text NOT NULL  UNIQUE       -- e.g. 'welder'
sector      text NOT NULL
is_active   boolean NOT NULL DEFAULT true
```
Names in `messages/{locale}/professions.json` (dropped in 0012). 18 rows.
RLS: select any authenticated / write admin. Grant: SELECT.

### `profession_skills` — M:N profession ↔ skill (0010/0011)
```
profession_id  uuid NOT NULL  FK → professions(id) ON DELETE CASCADE
skill_id       uuid NOT NULL  FK → skills(id)      ON DELETE CASCADE
is_core        boolean NOT NULL DEFAULT false
display_order  smallint NOT NULL DEFAULT 0          -- no updated_at
PK (profession_id, skill_id)
```
RLS: select true / write admin. Grant: SELECT.

### `countries` — ISO country reference  ⚠️ still holds in-DB translations
```
code              text PK                 -- ISO 3166-1 alpha-2
name_lt           text NOT NULL           -- ⚠️ §2 surface (translation in DB)
name_en           text NOT NULL           -- ⚠️ §2 surface (translation in DB)
is_target_market  boolean NOT NULL DEFAULT true
```
RLS: select true / write admin. **No grant to `authenticated`** — despite the
permissive policy, direct user-session reads fail at the privilege layer.

### `productivity_units` — scoped unit registry (0013, seeded 0013+0017)
```
slug                  text PK
category              text NOT NULL
base_unit_slug        text NULL  FK → productivity_units(slug)
scope                 text NOT NULL  CHECK IN ('platform','org','worker','client')
created_by_profile_id uuid NULL  FK → profiles(id)
organization_id       uuid NULL  FK → organizations(id)
parent_unit_slug      text NULL  FK → productivity_units(slug)
conversion_factor     numeric NULL                              -- no updated_at
```
Platform seed: square_meters, square_meters_per_day, box_per_day, hours, minutes,
days, meters, pieces, kilograms, packages. RLS: select true / write admin. Grant: SELECT.

### `profession_templates` — structured-entry form registry (0013)
```
id                  uuid PK
profession_id       uuid NOT NULL  FK → professions(id)
template            jsonb NOT NULL
is_platform_default boolean NOT NULL DEFAULT true
organization_id     uuid NULL  FK → organizations(id)           -- no updated_at
UNIQUE (profession_id, organization_id)
```
Seeded: tiler template. RLS: select true / write admin. Grant: SELECT.

### `skill_icons` / `platform_skill_aggregates` / `skill_seed_benchmarks` (0013)
```
skill_icons:               skill_id PK FK → skills, icon_slug NOT NULL, source, organization_id FK → organizations
platform_skill_aggregates: skill_id PK FK → skills, productivity_unit_slug, sample_size int DEFAULT 0,
                           mean_pace / p25_pace / p50_pace / p75_pace numeric, last_refreshed_at
                           (TABLE in M1; planned matview in M3)
skill_seed_benchmarks:     skill_id PK FK → skills, productivity_unit_slug, typical_pace numeric, source_note
```
All: RLS select true / write admin; grant SELECT. skill_icons seeded for tiling
skills; the other two are intentionally empty until real data exists.

---

## Work Journal family (append-only proof spine)

### `journal_entries` — append-only worker journal (0013 + 0018 + guards)
```
id                    uuid PK
worker_id             uuid NOT NULL  FK → workers(id) ON DELETE CASCADE
engagement_context_id uuid NOT NULL  FK → engagement_contexts(id) ON DELETE RESTRICT
entry_type_slug       text NOT NULL  CHECK IN ('freeform','structured','hybrid')
profession_id         uuid NULL  FK → professions(id)
original_text         text NOT NULL
original_language     char(2) NOT NULL
                      CHECK IN ('en','lt','lv','et','nl','de','da','no','sv','pl')  -- 20260530130000, mirrors lib/i18n/config.ts
hash_prev             text NULL
hash_self             text NOT NULL
visibility_scope      text NOT NULL DEFAULT 'closed'  CHECK IN ('closed','team','org','client_report','public_proof_link')
superseded_by         uuid NULL  FK → journal_entries(id)        -- pre-confirmation edit chain
deleted_at            timestamptz NULL                            -- 0018 soft delete (pre-confirmation only)
correction_of         uuid NULL  FK → journal_entries(id)        -- 0018 post-confirmation correction request
project_id            uuid NULL  FK → projects(id) ON DELETE SET NULL  -- 20260601091000
```
RLS: select owner OR org-manager (via engagement) OR admin; **insert narrowed to
own-worker AND `visibility_scope='closed'`** (20260530130000); NO update/delete
policy → append-only at RLS level. Grants: SELECT, INSERT.
Lifecycle: pre-confirmation edits/deletes via `journal_entry_supersede` /
`journal_entry_soft_delete`; post-confirmation only correction requests
(`correction_of`); originals are never mutated.

### `journal_entry_metrics`
```
id            uuid PK
entry_id      uuid NOT NULL  FK → journal_entries(id) ON DELETE CASCADE
metric_slug   text NOT NULL
value_numeric numeric NULL
value_text    text NULL
unit_slug     text NULL  FK → productivity_units(slug)
source        text NOT NULL  CHECK IN ('worker_input','ai_extracted','manager_corrected')   -- no updated_at
```
RLS: visible with parent entry; write owner-or-admin. Grants: SELECT, INSERT.

### `journal_entry_extractions` — AI extraction audit (built, still unused)
```
id / entry_id FK CASCADE / ai_provider / ai_model / raw_response jsonb /
candidate_skills jsonb / candidate_metrics jsonb / worker_confirmed_at /
worker_confirmed_subset jsonb                                    -- no updated_at
```
RLS: select owner-or-admin only. Grant: SELECT.

### `journal_entry_confirmations` — append-only evidence rows
```
id                              uuid PK
entry_id                        uuid NOT NULL  FK → journal_entries(id) ON DELETE CASCADE
confirmer_id                    uuid NOT NULL  FK → profiles(id)
confirmer_engagement_context_id uuid NOT NULL  FK → engagement_contexts(id)
confirmer_role                  text NOT NULL
confirmation_scope              jsonb NOT NULL    -- {action, decision: approved|rejected|changes_requested, note, skills_confirmed?}
                                                  -- no updated_at
```
RLS: select worker/confirmer/org-manager/admin; insert only by a manager of the
entry's org (confirmer = self). Grants: SELECT, INSERT. Written in practice by
`review_journal_entry` / `confirm_entry_and_verify_skills`.

### `journal_entry_work_items` — durable per-work-item recognition (20260601090000, RED draft)
```
id                uuid PK
journal_entry_id  uuid NOT NULL  FK → journal_entries(id) ON DELETE CASCADE
worker_id         uuid NOT NULL  FK → workers(id) ON DELETE CASCADE
organization_id   uuid NULL  FK → organizations(id) ON DELETE SET NULL   -- denormalised org scope
work_type_key     text NULL
title             text NOT NULL
evidence_phrase   text NULL
hours_numeric     numeric(6,2) NULL
unit              text NULL  CHECK IN ('hours','minutes','days')
certainty         text NOT NULL DEFAULT 'unclear'   CHECK IN ('clear','partial','unclear')
source            text NOT NULL DEFAULT 'computed'  CHECK IN ('computed','reviewer_confirmed','worker_corrected')
status            text NOT NULL DEFAULT 'suggested' CHECK IN ('suggested','confirmed','rejected','needs_clarification')
```
RLS: select/update owner OR managing reviewer OR admin; insert owner-or-admin;
delete owner-or-admin. Grant: full CRUD.

### `journal_entry_skills` — worker-asserted evidence-support links (20260602120000)
```
id                uuid PK
journal_entry_id  uuid NOT NULL  FK → journal_entries(id) ON DELETE CASCADE
worker_id         uuid NOT NULL  FK → workers(id) ON DELETE CASCADE
skill_id          uuid NOT NULL  FK → skills(id) ON DELETE CASCADE       -- no updated_at
UNIQUE (journal_entry_id, skill_id)
```
RLS: select owner/org-manager/admin; insert owner (entry must be theirs) or
admin; delete owner-or-admin. Grants: SELECT, INSERT, DELETE.
NOT verification — that stays in `confirm_entry_and_verify_skills`.

---

## Projects & operations layer

### `projects` — org's project (0001; org link 20260530120100)
```
id                uuid PK
company_id        uuid NULL  FK → companies(id) ON DELETE CASCADE        -- legacy link, kept
organization_id   uuid NULL  FK → organizations(id) ON DELETE RESTRICT   -- canonical link (RESTRICT protects proof chain)
title             text NULL
country / city    text NULL
start_date / end_date  date NULL
housing_provided  boolean NULL
status            text NULL  CHECK IN ('draft','live','paused','closed')
```
RLS: still keyed on `company_id` (owns_company OR admin OR live+authenticated for
select; owner/admin write). Grants: SELECT, INSERT, UPDATE (0023; no DELETE —
soft-close via status). `can_manage_project()` accepts EITHER link
(owns_company OR manages_organization OR admin).

### `project_clients` — the client a project is delivered for (20260601091000, RED draft)
```
id / project_id FK CASCADE / name NOT NULL / contact_name / contact_email / notes
```
Free-text client record — NOT an external identity, no client login.
RLS: managers of the parent project only (all verbs). Grant: full CRUD.

### `project_members` — internal coordinators (20260601091000, RED draft)
```
id / project_id FK CASCADE / profile_id FK CASCADE /
role text NOT NULL DEFAULT 'member' CHECK IN ('owner','manager','member','viewer')  -- no updated_at
UNIQUE (project_id, profile_id)
```
RLS: managers write; a member may read their own row. Grant: full CRUD.

### `project_worker_assignments` — workers placed on a project (F4)
```
id / project_id FK CASCADE / worker_id FK CASCADE /
status text NOT NULL DEFAULT 'active' CHECK IN ('active','ended') /
assigned_at timestamptz NOT NULL DEFAULT now() / ended_at timestamptz   -- no created/updated_at pair
UNIQUE (project_id, worker_id)
```
RLS: select owner-worker OR project-manager; write policy exists but
**INSERT/UPDATE/DELETE grants were REVOKED** (20260609120000) → the ONLY write
path is `assign_worker_to_project` / `end_worker_project_assignment`, which
require can_manage_project AND the worker on the caller's ACTIVE roster
(no broad manager-to-any-worker). Assignments are ended, never deleted.

### `project_worker_operational_statuses` — manager-set ops status (20260609180000)
```
id / project_id FK CASCADE / worker_id FK CASCADE /
status text NOT NULL CHECK IN ('candidate','contacted','interested','documents_needed',
                               'ready','assigned','unavailable','rejected') /
note / updated_by uuid NOT NULL FK → profiles(id)
UNIQUE (project_id, worker_id)
```
RLS: select manager/worker-self/admin; NO write policy + write grants revoked →
RPC-only (`set_worker_operational_status`, requires active F4 assignment).
Grant: SELECT. `ready` is a manager-set state, never a system verification.

### `project_worker_readiness_items` — per-worker document/readiness checklist (20260609180000)
```
id / project_id FK CASCADE / worker_id FK CASCADE / item_key text NOT NULL / label text NOT NULL /
status text NOT NULL DEFAULT 'needed' CHECK IN ('not_required','needed','missing','received',
                                                'checked','rejected','expired') /
note / updated_by uuid NOT NULL FK → profiles(id)
UNIQUE (project_id, worker_id, item_key)
```
Same RLS/grant/RPC-only shape (`upsert_worker_readiness_item`).

---

## Demand intake (customers & requests)

### `customers` — customer/buyer entity (0026)
```
id                  uuid PK
profile_id          uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE,  UNIQUE
contact_name        text NULL
customer_type       text NOT NULL DEFAULT 'individual'  CHECK IN ('individual','small_business','nonprofit','other')
country / market    text NULL
need_summary        text NULL
contact_preference  text NOT NULL DEFAULT 'platform_message'  CHECK IN ('email','phone','platform_message')
review_status       text NOT NULL DEFAULT 'pending'  CHECK IN ('pending','in_review','approved','needs_followup')
manual_review_note  text NULL
```
RLS: select own-or-admin; insert admin-only (RPC path); update own-or-admin;
delete admin. Grants: SELECT, UPDATE. Created via `save_customer_setup` or
`add_role('customer')`.

### `customer_requests` — THE canonical structured demand intake (0028 + 20260530150000)
```
id                    uuid PK
profile_id            uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
customer_id           uuid NULL  FK → customers(id) ON DELETE SET NULL
title                 text NOT NULL  CHECK length 1..200
need_summary          text NULL
country / location    text NULL
role_or_work_type     text NULL
team_size             integer NULL  CHECK (> 0)
start_period / duration / language_requirement / notes  text NULL
status                text NOT NULL DEFAULT 'draft'
                      CHECK IN ('draft','submitted','in_review','needs_followup','approved','closed')
manual_review_note    text NULL
kind                  text NULL  CHECK IN ('company_request','agency_offer','buyer_request','customer_request')  -- 20260530150000
payload               jsonb NOT NULL DEFAULT '{}'        -- per-kind fields (folded from pilot_drafts)
original_language     text NULL                          -- §2 author-language stamp
partial UNIQUE (profile_id, kind) WHERE status = 'draft' -- one draft per kind per user
```
RLS: select own-or-admin; insert admin-only (RPC path); update own-or-admin;
delete admin. Grants: SELECT, UPDATE. Write paths: `save_customer_request`
(structured buyer form), `save_demand_draft` (per-kind draft upsert),
`submit_demand_request` (status hard-pinned to 'submitted'). Owners can never
self-promote to admin-only review statuses or demote out of 'submitted'.
Manual review only — no auto-matching.

### `customer_request_attachments` + private storage bucket (0029)
```
id                 uuid PK
request_id         uuid NOT NULL  FK → customer_requests(id) ON DELETE CASCADE
profile_id         uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
file_name          text NOT NULL  CHECK length 1..255
mime_type          text NOT NULL  CHECK length 1..200  (RPC allowlist: pdf/jpeg/png/webp/plain)
file_size_bytes    bigint NOT NULL  CHECK 1..10485760 (10 MB)
storage_path       text NOT NULL UNIQUE     -- '<profile_id>/<request_id>/<attachment_id>/<filename>'
upload_status      text NOT NULL DEFAULT 'uploaded'    CHECK IN ('uploading','uploaded','removed','failed')
analysis_status    text NOT NULL DEFAULT 'not_started' CHECK IN ('not_started','extracted','needs_manual_review','structured','failed')
extracted_text     text NULL          -- honest Level-1: left NULL until a real extractor ships
structured_summary jsonb NULL
```
RLS: select/update/delete own-or-admin; insert `with check (false)` → RPC-only
(`register_customer_request_attachment`). Grants: SELECT, UPDATE, DELETE.
Storage: bucket `customer-request-attachments` (public=false, 10 MB +
MIME allowlist where supported); storage.objects policies scope select/insert/
delete to the owner's first path folder (= their profile id); admin gets select.

### `pilot_drafts` — LEGACY per-role pilot drafts (0016; folded, pending retirement)
```
id / profile_id FK CASCADE / draft_type CHECK IN ('company_request','agency_offer','buyer_request') /
payload jsonb DEFAULT '{}' / visibility CHECK IN ('closed')
UNIQUE (profile_id, draft_type)
```
RLS owner-only (+admin read); grant full CRUD. **Superseded** by
`customer_requests.kind/payload` (20260530150000); table left untouched until a
later retirement slice.

### `leads` — pre-auth/founder-review sales funnel (DISTINCT from structured demand)
```
id / source / email / full_name / company_name / country /
intent CHECK IN ('hire_workers','find_job','partner','unknown') /
status CHECK IN ('new','contacted','qualified','won','lost') / notes /
assigned_to FK → profiles ON DELETE SET NULL
```
RLS: admin-only (public capture via service role). No grant to `authenticated`.

---

## Communication (conversations family)

> The legacy M0 `threads` + `messages` tables (and `can_access_thread()`) were
> **DROPPED** in 20260530120000 (0-row assertion + faithful recreate in the
> rollback block). The conversations model below is the only messaging surface.

### `conversations`
```
id          uuid PK
subject     text NULL  CHECK (≤240)
kind        text NOT NULL DEFAULT 'direct'  CHECK IN ('direct','support','team')
created_by  uuid NOT NULL  FK → profiles(id)
```
RLS: select participant/creator/admin; insert creator=self. Grants: SELECT, INSERT.

### `conversation_participants`
```
conversation_id uuid NOT NULL  FK → conversations(id) ON DELETE CASCADE
profile_id      uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
added_by        uuid NULL  FK → profiles(id)
added_at        timestamptz NOT NULL DEFAULT now()
last_read_at    timestamptz NULL          -- the only (honest) read signal
PK (conversation_id, profile_id)
```
RLS: select self/participant/admin; insert only conversation creator or admin;
update own row only (last_read_at). Grants: SELECT, INSERT, UPDATE.

### `conversation_messages` — append-only; doubles as the work-instruction channel
```
id                       uuid PK
conversation_id          uuid NOT NULL  FK → conversations(id) ON DELETE CASCADE
author_id                uuid NOT NULL  FK → profiles(id)
body                     text NOT NULL  CHECK length 1..10000     -- the ORIGINAL, never overwritten
is_instruction           boolean NOT NULL DEFAULT false            -- 20260608150000
original_language        text NULL
target_language          text NULL                                 -- forward-looking; v1 unused
translated_text          text NULL                                 -- forward-looking; v1 NULL
translation_status       text NOT NULL DEFAULT 'unavailable'  CHECK IN ('unavailable','pending','available')
is_clarification_request boolean NOT NULL DEFAULT false            -- worker-authored, via normal insert policy
project_id               uuid NULL  FK → projects(id) ON DELETE SET NULL   -- 20260609140000 (project-scoped instruction)
                                                                   -- no updated_at
```
RLS: select participant-or-admin; insert author=self AND participant; NO
update/delete → append-only. Grants: SELECT, INSERT. Instructions are sent via
the relationship-gated RPCs `send_work_instruction` (roster-level) /
`send_work_instruction_to_project` (requires ACTIVE F4 assignment + project
management). No fake translation — v1 shows the original + an honest
"translation not ready" state.

---

## Candidate / provider drafts

### `candidate_drafts` — owner-private pre-registration working notes (20260609190000)
```
id                 uuid PK
owner_id           uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
project_id         uuid NULL  FK → projects(id) ON DELETE SET NULL
name_or_title      text NOT NULL
contact            text NULL          -- free text email/phone
profession_service text NULL
language           text NULL
skills_text        text NULL
notes              text NULL
status             text NOT NULL DEFAULT 'draft'  CHECK IN ('draft','contacted','shortlisted','archived')
linked_profile_id  uuid NULL  FK → profiles(id) ON DELETE SET NULL   -- link AFTER real registration; never auto-set
```
RLS: select owner-or-admin; write owner-only. Grant: full CRUD.
A draft is NOT a user account and NOT assignable (F4 needs a real `workers.id`).

---

## Marketplace stubs, billing, telemetry, ops

### `job_demands` — open roles on a project (M0 stub, live grants since 0023)
```
id / project_id FK → projects ON DELETE CASCADE / role_title / headcount_needed int /
required_skills uuid[] / preferred_countries text[] / salary_offered_eur int / start_date /
status CHECK IN ('open','paused','filled','closed') /
visibility CHECK IN ('public','agencies_only','direct_only')
```
RLS: owner-company/admin full; visibility-gated browse for open demands.
Grant: full CRUD (0023; soft-close in practice).

### `matches` / `match_actions` — matching engine output (service-role writes)
```
matches:       id / worker_id FK / job_demand_id FK / score numeric(5,2) / reasons jsonb /
               computed_at; UNIQUE (worker_id, job_demand_id)
match_actions: id / match_id FK / actor_id FK profiles SET NULL /
               action CHECK IN ('view','like','skip','request_contact','invite','accept','decline') / occurred_at
```
RLS: participants read via `can_access_match()`; writes admin/service-role
(match_actions insert: own action + participant). **No grants to `authenticated`.**

### `consents` — GDPR consent events
```
id / profile_id FK CASCADE / consent_type / granted boolean / granted_at / revoked_at / source
```
RLS: own-or-admin (delete admin-only). **No grant to `authenticated`** (service-role writes).

### `audit_logs` — append-only audit trail (written by the SECURITY DEFINER RPCs)
```
id / actor_id FK profiles SET NULL / action / entity / entity_id uuid / payload jsonb / occurred_at
```
RLS: admin select; admin insert; no update/delete. **No grant to `authenticated`**
— rows are appended from inside definer RPCs (0031–0036, 20260530140000, …).

### `subscriptions` / `plans` — billing  ⚠️ plans still holds in-DB translations
```
subscriptions: id / profile_id FK CASCADE / plan_id FK plans SET NULL /
               status CHECK IN ('trial','active','past_due','canceled') /
               started_at / current_period_end / external_ref
plans:         id / slug UNIQUE / name_lt ⚠️ / name_en ⚠️ / price_eur_monthly int /
               features jsonb / active boolean DEFAULT true
```
RLS: subscriptions own-read + admin-manage; plans select true + admin write.
**No grants to `authenticated`.**

### `waitlist` — landing-page signups (0005)
```
id / email NOT NULL UNIQUE / source NOT NULL DEFAULT 'landing_company_modal' / locale
-- created_at only (no updated_at)
```
RLS: anon INSERT only (`with check (true)`); no read policies (service-role only).
Grant: INSERT to `anon`.

### `language_feedback` — tester copy-QA inbox (0019; append-only)
```
id / route NOT NULL / locale NOT NULL / selected_text / comment NOT NULL /
user_id FK profiles / status NOT NULL DEFAULT 'open' CHECK IN ('open','reviewed','fixed','dismissed')
-- created_at only
```
RLS: insert self-or-anonymous (user_id NULL); select admin-only; no
update/delete. Grants: SELECT, INSERT.

### `pilot_events` — pilot telemetry (0020; append-only, bounded columns)
```
id / created_at / profile_id FK profiles / session_id ≤64 / route ≤240 / locale ≤16 /
event_name ≤64 / task_name ≤64 / task_step ≤64 / duration_ms ≥0 /
result CHECK IN ('started','success','error','abandoned','info') / error_code ≤64 /
metadata jsonb DEFAULT '{}' (server-side allowlist) / app_version ≤64
```
RLS: insert self-or-anonymous; select admin-only; no update/delete.
Grants: SELECT, INSERT.

---

## SECURITY DEFINER RPCs (the privileged write surface)

All revoke EXECUTE from `public` and grant to `authenticated` unless noted; all
validate `auth.uid()` + ownership internally. Where a function was redefined,
the **final** body is described.

**Onboarding & roles**
- `complete_onboarding(role, display_name, country, role_data, profession_id?)` — one-transaction profile update + profile_roles upsert + role entity creation (+ primary worker_profession). Final shape: 0008.
- `add_role(role, role_data)` — switches active_role, upserts profile_roles, creates the missing worker/company/agency/customer entity row. Final shape: 0026.

**Company / customer setup & verification**
- `save_company_setup(9 args)` — owner-scoped company upsert with AUTOMATIC-FIRST status derivation (active_unverified / needs_checks); `p_submit` = optional manual-review escalation; can NEVER set 'verified'. Final: 20260604140000.
- `admin_set_company_verification(company_id, status, note?)` — admin-only verified/unverified/pending flip + audit row. (20260604130000)
- `save_customer_setup(7 args)` — customer entity upsert + ensures 'customer' role. (0026)

**Demand intake**
- `save_customer_request(12 args)` — owner-scoped structured request insert/update; owners capped at 'submitted'. (0028)
- `save_demand_draft(kind, title, payload, original_language)` — idempotent per-kind DRAFT upsert on customer_requests. (20260530150000)
- `submit_demand_request(kind, title, need_summary, payload, original_language)` — inserts a SUBMITTED customer_request (status hard-pinned). (20260530150000)
- `register_customer_request_attachment(6 args)` — metadata insert after blob upload; validates ownership, MIME allowlist, 10 MB cap, path prefix. (0029)

**Rosters & invitations**
- `invite_agency_worker(agency_id, email, note?)` / `invite_company_worker(...)` — owner-scoped pending-invitation upsert; returns 'invited' / 'already_pending' / 'already_linked' / 'not_owner' / 'invalid_email'. (0025 / 0027)
- `accept_company_worker_invitation(company_id)` / `accept_agency_worker_invitation(agency_id)` — worker-initiated: pending invitation (to caller's own email) → active roster link + 'accepted'; audit-logged. (0036)
- `assign_company_worker_role(...)` / `assign_agency_worker_role(...)` — owner/admin sets operations_role/title on the roster row; NEVER enables review; audit-logged. (0031)
- `provision_company_worker_engagement_context(...)` / `provision_agency_worker_engagement_context(...)` — owner/admin idempotently creates the worker's 'employee' engagement_context to the mirrored org (reviewer-eligible roles only). (0032)
- `set_company_worker_journal_review(...)` / `set_agency_worker_journal_review(...)` — flips the LEGACY roster-table review flag; enable requires reviewer-eligible role + real engagement context. (0033 — superseded by the canonical engagement flag below)
- `company_worker_engagement_links(company_id)` / `agency_worker_engagement_links(agency_id)` — owner/admin-scoped setof worker_ids with an active 'employee' engagement. (0033)

**Canonical org membership & review (the proof chain)**
- `add_org_member(org_id, worker_id)` — owner/manager/admin adds an 'employee' engagement_context (hash-stamped, audit-logged). (20260530140000)
- `grant_org_manager(org_id, profile_id, operations_role?)` — OWNER-only manager engagement grant (roles: foreman/project_manager/site_manager/hr/company_admin). (20260530140000)
- `set_engagement_journal_review(engagement_id, enabled)` — manager/admin flips the CANONICAL `engagement_contexts.journal_review_enabled` on an 'employee' engagement. (20260530140000)
- `review_journal_entry(entry_id, decision, note?)` — manager/admin records approved/rejected/changes_requested as an append-only confirmation; gated on the entry's engagement having review enabled. Final: 20260530140000 (0034's roster-table gate replaced).
- `reviewable_journal_entry_ids()` — the gated pending set (org-scoped, review-enabled, unconfirmed). Final: 20260530140000.
- `confirm_entry_and_verify_skills(entry_id, skill_ids[], note?)` — THE proof RPC: append confirmation AND flip the worker's declared skills to verified (source='manager_confirmed', confidence_bin='green'); audit-logged. (20260530140000)

**Work journal lifecycle**
- `create_journal_entry_full(10 args)` — atomic entry + metrics insert. ⚠️ **SECURITY INVOKER** (RLS still applies) — the one deliberate exception in this list. (0017)
- `journal_entry_soft_delete(entry_id)` — owner-only; rejected once externally confirmed. (0018)
- `journal_entry_supersede(9 args)` — owner-only new version; pre-confirmation sets `superseded_by`, post-confirmation records `correction_of`. (0018)

**Worker work card**
- `save_worker_card(6 args)` — owner-scoped partial update of the whitelisted card fields ONLY (system fields unreachable); stamps work_card_confirmed_at. (20260608120000; PUBLIC/anon EXECUTE revoked in 20260608140000)
- `confirm_worker_card()` — stamps work_card_confirmed_at only. (same hardening)

**Instructions & project operations**
- `send_work_instruction(worker_profile_id, body, original_language?)` — roster-relationship-gated; finds/creates the direct conversation and inserts an instruction message. (20260608150000)
- `send_work_instruction_to_project(worker_profile_id, body, original_language?, project_id)` — STRICTER: requires ACTIVE project assignment + can_manage_project; stamps message project_id. (20260609140000)
- `assign_worker_to_project(project_id, worker_profile_id)` — requires can_manage_project AND worker on caller's ACTIVE roster; upsert to active. (20260609120000)
- `end_worker_project_assignment(project_id, worker_profile_id)` — sets ended (never deletes). (20260609120000)
- `set_worker_operational_status(4 args)` / `upsert_worker_readiness_item(6 args)` — manager-set ops status / checklist; require can_manage_project + ACTIVE assignment. (20260609180000)

**RLS helper functions (SECURITY DEFINER unless noted)**
`profile_role()`, `is_admin()` (dual-signal, 0024), `is_employer()` (⚠️ reads only
`active_role`, NOT dual like is_admin), `owns_worker(uuid)`, `owns_company(uuid)`,
`owns_agency(uuid)`, `owns_customer(uuid)`, `can_access_match(uuid)`,
`manages_organization(uuid)` (active manager/owner/external_manager engagement),
`can_manage_project(uuid)`, `caller_manages_worker(uuid)`,
`is_conversation_participant(uuid)` (**security invoker**),
`handle_new_user()`, `ensure_worker_profile()`, `ensure_org_owner_engagement()`,
`mirror_company_to_org()`, `mirror_agency_to_org()`,
`enforce_company_verification_guard()`, `set_updated_at()` (plain trigger fn).

---

## Cross-cutting observations

- **Org model is transitional dual-write:** `companies`/`agencies` remain the
  user-facing write surfaces; mirror triggers keep `organizations` in sync via
  `legacy_company_id`/`legacy_agency_id`. The canonical relationship layer is
  `engagement_contexts` + `relationship_types`; `projects` carries BOTH
  `company_id` (legacy, RLS still keyed on it) and `organization_id` (canonical,
  ON DELETE RESTRICT to protect the proof chain).
- **Review gate duplication (⚠️ active footgun):** `journal_review_enabled`
  exists on BOTH the roster tables (0030, flipped by 0033 RPCs) and
  `engagement_contexts` (20260530140000, flipped by `set_engagement_journal_review`).
  Only the **engagement** flag gates the live `review_journal_entry` /
  `reviewable_journal_entry_ids` / `confirm_entry_and_verify_skills`. Do not
  build on the roster flag.
- **Explicit-grant discipline:** there are NO default privileges. Tables with no
  `authenticated` grant (agencies, agency_workers, countries, matches,
  match_actions, consents, audit_logs, plans, subscriptions, leads) are
  reachable only via SECURITY DEFINER paths — a permissive RLS policy there does
  NOT mean the app session can read the table.
- **Write-path pattern:** the schema has converged on "SELECT grant + SECURITY
  DEFINER RPC for writes" for every sensitive table (companies, workers card,
  customer_requests, attachments, project assignments, ops statuses, readiness
  items, invitations, engagement writes). Direct INSERT policies are often
  `is_admin()` or `with check (false)` purely to force the RPC path.
- **Append-only / proof status:** `journal_entries` (+ confirmations,
  language_feedback, pilot_events, conversation_messages, audit_logs) are
  append-only at the RLS layer (no UPDATE/DELETE policies). journal_entries
  carries `original_text` + `original_language` (CHECK-pinned to the canonical
  locale set) + per-row hash columns; entry mutation is lifecycle-managed
  (supersede / soft-delete / correction_of) — originals never change. A true
  linked hash_prev chain on engagement_contexts is still future hardening.
- **Worker FK convention holds:** all worker-scoped tables (worker_skills,
  worker_professions, both rosters, matches, journal_entries,
  journal_entry_work_items, journal_entry_skills, project_worker_*) key on
  `workers(id)`; person resolution via `workers.profile_id` (UNIQUE). RPCs that
  take a person take `worker_profile_id` and resolve internally.
- **Slug + JSON taxonomy status:**
  - ✅ Fully slug + JSON: `skills`, `professions`, `profession_skills`,
    `relationship_types`, `productivity_units` (labels in
    `messages/{locale}/*.json`).
  - ⚠️ Slug present but labels still in DB: `plans` (`name_lt`/`name_en`).
  - ⚠️ No slug, labels in DB: `countries` (`name_lt`/`name_en`; PK = ISO code).
- **Honesty guards in-schema:** company `verified` is trigger-enforced
  admin-only on every write path; worker `trust_score`/`profile_completeness`
  are unreachable from user RPCs; attachment `analysis_status` stays
  `not_started` until a real extractor exists; instruction `translation_status`
  stays `unavailable` (no fake translation); ops `ready`/`checked` are
  manager-set states, never system verification; `candidate_drafts` never
  create accounts.
- **Migration tooling:** hand-written SQL in `supabase/migrations/`
  (`0001`–`0036` frozen; new files `YYYYMMDDHHMMSS_*.sql` per doctrine §16).
  **Never `supabase db push`** — repo filenames don't match the prod ledger
  versions (MCP applies used different stamps); RED-class migrations apply
  manually via MCP `apply_migration` after the human gate.

---

## Open structural gaps (relative to current designs)

Names + one-line note only — not solved here.

- **Legacy/canonical org duality.** companies/agencies (+ both roster tables +
  their invitation tables + the roster-side review flag) await retirement onto
  organizations/engagement_contexts; until then two parallel membership models
  coexist and projects RLS is still company-keyed even though the canonical FK
  is `organization_id`.
- **`pilot_drafts` retirement.** Folded into `customer_requests.kind/payload`
  (20260530150000) but the table and its grants still exist.
- **No migration `0022`.** The sequential set jumps 0021 → 0023; whether a 0022
  was applied to prod under another name cannot be determined from repo files.
- **`is_employer()` is single-signal.** Unlike `is_admin()` (0024 dual signal),
  it reads only `active_role` — an employer who switches workspace loses
  employer-scoped RLS reads until switching back.
- **engagement_contexts hash chain is per-row only.** `hash_prev` exists but is
  never populated; a real linked chain is tracked hardening (TASKS.md).
- **`countries` / `plans`** still carry `name_*` translation columns — candidate
  migration to slug + JSON (§2/§10), tracked in `TASKS.md`.
- **journal_entry_extractions unused.** Built in 0013 for the AI extraction
  audit trail; no writer exists yet (no fake AI until a real extractor ships).
- **platform_skill_aggregates / skill_seed_benchmarks empty.** M3 converts the
  aggregate table to a materialized view + refresh; benchmarks need real data.
- **Append-only trigger guards deferred.** RLS denies UPDATE/DELETE on
  journal_entries, but trigger-level defense-in-depth (respecting the
  supersede/soft-delete lifecycle) is still open (TASKS.md, salvage notes in
  20260530130000).
- **Draft-gated slices.** `20260601090000` (journal_entry_work_items) and
  `20260601091000` (project/object/client layer) are headed `DRAFT —
  needs-human-gate`; later F4/F5/ops migrations build on the project layer, so
  reconcile applied-status against the prod ledger before relying on this
  section in production reasoning.
- **No retention/rotation for telemetry.** pilot_events / language_feedback are
  append-only with no maintenance RPC yet.
