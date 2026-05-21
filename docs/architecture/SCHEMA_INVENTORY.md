# Schema Inventory — current state

**Date:** 2026-05-21
**Latest applied migration:** `supabase/migrations/0012_drop_taxonomy_name_columns.sql`
**Supabase project:** `gorgitwvdzxbnaxhrsrw` (production = `main`)
**Source:** introspected from the live database (not from migration files).

> This document reflects schema state as of 2026-05-21. The architect references
> this as ground truth. **If schema changes, update this file in the same PR.**

All tables are in the `public` schema. `auth.users` is Supabase-managed;
`public.profiles.id` is a FK to `auth.users(id)` (the only cross-schema link).
Every table has `created_at timestamptz NOT NULL DEFAULT now()` and (except
`waitlist`, `profession_skills`) `updated_at timestamptz NOT NULL DEFAULT now()`;
those are omitted from the column blocks below to reduce noise.

---

## Identity

### `profiles` — one row per authenticated person (the singular identity root)
```
id                       uuid PK,  FK → auth.users(id) ON DELETE CASCADE   (no default; = auth user id)
active_role              text NULL                                          -- current workspace
locale                   text NOT NULL DEFAULT 'lt'
full_name                text NULL
email                    text NULL
phone                    text NULL
country                  text NULL
onboarded                boolean NOT NULL DEFAULT false
onboarded_at             timestamptz NULL
consent_marketing        boolean NOT NULL DEFAULT false
consent_data_processing  boolean NOT NULL DEFAULT false
CHECK: active_role IS NULL OR active_role IN ('worker','company','agency','customer','admin')
```

---

## Organizations & ownership

> **There is NO `organizations` table.** "Employers" are modelled as two separate
> tables — `companies` and `agencies` — each owned 1:1 by a `profiles` row via
> `profile_id`. There is no membership/junction table linking multiple people to
> one company/agency; ownership is the single `profile_id`. (DI decision D3 will
> introduce an `organizations` root later; this is the baseline.)

### `companies` — a company entity (employer); owner = `profile_id`
```
id            uuid PK
profile_id    uuid NULL  FK → profiles(id) ON DELETE SET NULL
legal_name    text NULL
display_name  text NULL
country       text NULL
vat_number    text NULL
website       text NULL
description   text NULL
trust_score   integer NOT NULL DEFAULT 0
```

### `agencies` — an agency entity (employer); owner = `profile_id`
```
id          uuid PK
profile_id  uuid NULL  FK → profiles(id) ON DELETE SET NULL
legal_name  text NULL
country     text NULL
description text NULL
```

### `agency_workers` — N:M agency ↔ worker roster
```
agency_id   uuid NOT NULL  FK → agencies(id) ON DELETE CASCADE
worker_id   uuid NOT NULL  FK → workers(id)  ON DELETE CASCADE
status      text NULL  CHECK IN ('active','paused','removed')
PK (agency_id, worker_id)
```

### `projects` — a company's project (jobs hang off these)
```
id                uuid PK
company_id        uuid NULL  FK → companies(id) ON DELETE CASCADE
title             text NULL
country           text NULL
city              text NULL
start_date        date NULL
end_date          date NULL
housing_provided  boolean NULL
status            text NULL  CHECK IN ('draft','live','paused','closed')
```

---

## Workers

> **Worker FK convention CONFIRMED:** every worker-scoped table keys on
> `workers(id)`, NOT `profiles(id)`. (`worker_skills`, `worker_professions`,
> `agency_workers`, `matches` all FK → `workers(id)`.) A worker row links to its
> person via `workers.profile_id → profiles(id)` (UNIQUE — one worker per profile).

### `workers` — worker profile; one per person (`profile_id` UNIQUE)
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
trust_score               integer NOT NULL DEFAULT 0
profile_completeness      integer NOT NULL DEFAULT 0
```

### `worker_skills` — a worker's declared/verified skills
```
id                uuid PK
worker_id         uuid NULL  FK → workers(id) ON DELETE CASCADE
skill_id          uuid NULL  FK → skills(id)  ON DELETE CASCADE
self_rated_level  integer NULL  CHECK 1..5
verified          boolean NOT NULL DEFAULT false
verified_by       uuid NULL  FK → profiles(id)
verified_at       timestamptz NULL
source            text NOT NULL DEFAULT 'self_declared'  CHECK IN ('self_declared','work_journal','manager_confirmed')
UNIQUE (worker_id, skill_id)
```

### `worker_professions` — a worker's profession(s); one primary
```
id             uuid PK
worker_id      uuid NOT NULL  FK → workers(id)      ON DELETE CASCADE
profession_id  uuid NOT NULL  FK → professions(id)  ON DELETE RESTRICT
is_primary     boolean NOT NULL DEFAULT false
UNIQUE (worker_id, profession_id)
```

---

## Taxonomy registries

### `skills` — curated skill taxonomy (slug + JSON labels)
```
id          uuid PK
slug        text NULL  UNIQUE          -- e.g. 'mig-mag-welding'
category    text NULL                  -- e.g. 'construction.welding'
is_active   boolean NOT NULL DEFAULT true
```
Names live in `messages/{locale}/skill-names.json` keyed by slug (§2 — no name_* columns; dropped in 0012). 94 rows.

### `professions` — curated profession taxonomy (slug + JSON labels)
```
id          uuid PK
slug        text NOT NULL  UNIQUE       -- e.g. 'welder'
sector      text NOT NULL
is_active   boolean NOT NULL DEFAULT true
```
Names live in `messages/{locale}/professions.json` keyed by slug (§2 — no name_* columns; dropped in 0012). 18 rows.

### `profession_skills` — M:N profession ↔ skill
```
profession_id  uuid NOT NULL  FK → professions(id) ON DELETE CASCADE
skill_id       uuid NOT NULL  FK → skills(id)      ON DELETE CASCADE
is_core        boolean NOT NULL DEFAULT false
display_order  smallint NOT NULL DEFAULT 0
PK (profession_id, skill_id)
```
126 rows.

### `countries` — ISO country reference  ⚠️ holds in-DB translations
```
code              text PK                 -- ISO 3166-1 alpha-2
name_lt           text NOT NULL           -- ⚠️ §2 surface (translation in DB)
name_en           text NOT NULL           -- ⚠️ §2 surface (translation in DB)
is_target_market  boolean NOT NULL DEFAULT true
```

---

## Onboarding & roles

### `profile_roles` — multi-role catalogue (person-first; one row per held role)
```
id          uuid PK
profile_id  uuid NOT NULL  FK → profiles(id) ON DELETE CASCADE
role        text NOT NULL  CHECK IN ('worker','company','agency','customer','admin')
is_active   boolean NOT NULL DEFAULT true
role_data   jsonb NOT NULL DEFAULT '{}'
added_at    timestamptz NOT NULL DEFAULT now()
UNIQUE (profile_id, role)
```
Multi-role lives here; `profiles.active_role` is the current workspace. Role
labels resolve via `auth.signup.role.<slug>` JSON (no labels in DB).

---

## Other (M0 marketplace stubs, billing, ops)

### `job_demands` — open roles on a project
```
id                  uuid PK
project_id          uuid NULL  FK → projects(id) ON DELETE CASCADE
role_title          text NULL
headcount_needed    integer NULL
required_skills     text[] NULL
preferred_countries text[] NULL
salary_offered_eur  integer NULL
start_date          date NULL
status              text NULL  CHECK IN ('open','paused','filled','closed')
visibility          text NULL  CHECK IN ('public','agencies_only','direct_only')
```

### `matches` — worker ↔ job_demand match
```
id             uuid PK
worker_id      uuid NULL  FK → workers(id)     ON DELETE CASCADE
job_demand_id  uuid NULL  FK → job_demands(id) ON DELETE CASCADE
score          numeric NULL
reasons        jsonb NULL
computed_at    timestamptz NULL
UNIQUE (worker_id, job_demand_id)
```

### `match_actions` — actions on a match
```
id          uuid PK
match_id    uuid NULL  FK → matches(id)  ON DELETE CASCADE
actor_id    uuid NULL  FK → profiles(id) ON DELETE SET NULL
action      text NULL  CHECK IN ('view','like','skip','request_contact','invite','accept','decline')
occurred_at timestamptz NOT NULL DEFAULT now()
```

### `threads` — conversation thread per match
```
id        uuid PK
match_id  uuid NULL  FK → matches(id) ON DELETE CASCADE
status    text NULL  CHECK IN ('open','archived')
```

### `messages` — messages within a thread
```
id         uuid PK
thread_id  uuid NULL  FK → threads(id)  ON DELETE CASCADE
sender_id  uuid NULL  FK → profiles(id) ON DELETE SET NULL
body       text NULL
sent_at    timestamptz NOT NULL DEFAULT now()
read_at    timestamptz NULL
```
> Note: NOT append-only / no hash chain / no `original_language` — these are M0
> stubs predating doctrine §2.3/§3. The Work Journal (M1) introduces the
> append-only + original_text pattern; chat would need the same treatment if revived.

### `consents` — GDPR consent events
```
id            uuid PK
profile_id    uuid NULL  FK → profiles(id) ON DELETE CASCADE
consent_type  text NULL
granted       boolean NULL
granted_at    timestamptz NULL
revoked_at    timestamptz NULL
source        text NULL
```

### `audit_logs` — generic audit trail (M0 stub)
```
id          uuid PK
actor_id    uuid NULL  FK → profiles(id) ON DELETE SET NULL
action      text NULL
entity      text NULL
entity_id   uuid NULL
payload     jsonb NULL
occurred_at timestamptz NOT NULL DEFAULT now()
```

### `subscriptions` — billing subscription per profile
```
id                  uuid PK
profile_id          uuid NULL  FK → profiles(id) ON DELETE CASCADE
plan_id             uuid NULL  FK → plans(id)    ON DELETE SET NULL
status              text NULL  CHECK IN ('trial','active','past_due','canceled')
started_at          timestamptz NULL
current_period_end  timestamptz NULL
external_ref        text NULL
```

### `plans` — subscription plan catalogue  ⚠️ holds in-DB translations
```
id                 uuid PK
slug               text NULL  UNIQUE
name_lt            text NULL              -- ⚠️ §2 surface (translation in DB)
name_en            text NULL              -- ⚠️ §2 surface (translation in DB)
price_eur_monthly  integer NULL
features           jsonb NULL
active             boolean NOT NULL DEFAULT true
```

### `leads` — marketing/sales leads
```
id            uuid PK
source        text NULL
email         text NULL
full_name     text NULL
company_name  text NULL
country       text NULL
intent        text NULL  CHECK IN ('hire_workers','find_job','partner','unknown')
status        text NULL  CHECK IN ('new','contacted','qualified','won','lost')
notes         text NULL
assigned_to   uuid NULL  FK → profiles(id) ON DELETE SET NULL
```

### `waitlist` — landing-page waitlist signups
```
id          uuid PK
email       text NOT NULL  UNIQUE
source      text NOT NULL DEFAULT 'landing_company_modal'
locale      text NULL
created_at  timestamptz NOT NULL DEFAULT now()   -- no updated_at
```

---

## Cross-cutting observations

- **Multi-tenant ownership style (today):** direct `profile_id` ownership on
  `companies` and `agencies` (1:1, `ON DELETE SET NULL`). No `organizations`
  root, no member/junction table for company↔people. Agency↔worker rosters use
  the `agency_workers` junction. `projects.company_id → companies`.
- **Worker FK convention:** **`workers(id)`** is the target for all worker-scoped
  tables (`worker_skills`, `worker_professions`, `agency_workers`, `matches`).
  The architect's belief is **correct**. A worker resolves to a person via
  `workers.profile_id` (UNIQUE).
- **Slug + JSON taxonomy status:**
  - ✅ Fully slug + JSON: `skills`, `professions` (+ `profession_skills` junction). Names in `messages/{locale}/*.json`.
  - ⚠️ Slug present but labels still in DB: `plans` (`name_lt`/`name_en`).
  - ⚠️ No slug, labels in DB: `countries` (`name_lt`/`name_en`; PK is the ISO `code`).
  - Role values are CHECK-constrained slug sets (`worker/company/agency/customer/admin`) with labels in JSON — compliant (and roles are a fixed RBAC set per doctrine §5, exempt from the §10 "extensible" rule).
- **Translation columns in DB (§2 violation surface):** `countries.name_lt`,
  `countries.name_en`, `plans.name_lt`, `plans.name_en`. (`skills`/`professions`
  name_* were dropped in migration 0012 — clean.)
- **Append-only / proof status:** No table currently has `original_text` +
  `original_language`, hash chains, or enforced append-only. `messages`/`audit_logs`
  are M0 stubs predating §2.3/§3. The Work Journal (M1) is the first table family
  to adopt that pattern.
- **Migration tooling:** hand-written SQL in `supabase/migrations/` (`0001`…`0012`),
  **no Prisma, no Drizzle**. Applied via `supabase db push` which runs in the
  deploy pipeline on merge to `main` (auto-apply confirmed). MCP `apply_migration`
  also used for ad-hoc applies; both write to `supabase_migrations.schema_migrations`.

---

## Open structural gaps (relative to M1–M3 designs)

Names + one-line note only — not solved here.

- **No `organizations` table.** DI decision D3: a future multi-tenant root with
  `companies`/`agencies` as specializations under it, all owned by a singular
  `profiles` row. Today ownership is direct `profile_id` on each.
- **No `journal_entries` / `journal_entry_metrics` / `journal_entry_extractions`
  / `journal_entry_confirmations`.** Work Journal M1 creates these.
- **No `profession_templates`.** Work Journal M1 (structured-entry forms registry).
- **No `productivity_units`.** Work Journal M1 (with `scope` + custom-unit support).
- **No `platform_skill_aggregates` / `skill_seed_benchmarks`.** Work Journal M3.
- **No `skill_icons` registry.** CV card composition (M2/M3).
- **`worker_skills` lacks** `confidence_score`, `confidence_bin`,
  `current_pace_value`, `current_pace_unit_slug`, `last_recompute_at`. Work Journal M1 adds.
- **`countries` / `plans`** still carry `name_*` translation columns — candidate
  migration to slug + JSON (§2/§10) — tracked in `TASKS.md` backlog (countries).
- **No multi-tenant membership table** (people belonging to a company/agency
  beyond the single owner `profile_id`) — needed once `organizations` lands.
