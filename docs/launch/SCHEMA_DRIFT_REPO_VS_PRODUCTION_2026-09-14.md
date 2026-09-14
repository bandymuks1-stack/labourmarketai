# Repo → production schema drift, measured 2026-09-14

Discovered while completing Step C (the GDPR export register's completeness
guard found four person-keyed tables that a production sweep had not). Recorded
here as Step D required; **nothing was applied, and nothing here should be
applied without the owner's act.**

Method: every `create table … public.<name>` in `supabase/migrations/*.sql`
compared against `information_schema.tables` on the production project
(`gorgitwvdzxbnaxhrsrw`), read-only.

> **Count correction (made 2026-09-14, after this file was first written):**
> the prose below originally said "seven migrations" while the table listed
> SEVEN. Seven is correct, and verified by file existence. The nine-table
> figure, the classification and the blast radius are unchanged.

- Repo migrations: **280**
- Applied ledger rows: **278** (`supabase_migrations.schema_migrations`)
- Production base tables: **204**
- Tables created in repo migrations but absent from production: **11**

---

## 1. Not drift — deliberately removed

| Table | Migration | Status |
|---|---|---|
| `threads` | `0001_initial_schema.sql` | **OBSOLETE, correctly absent.** Dropped by the applied `drop_legacy_threads_messages`. Superseded by `conversations` / `conversation_messages` / `conversation_participants`. |
| `messages` | `0001_initial_schema.sql` | as above |

No action. The migration history is forward-only, so the create statements stay
in the record.

## 2. The real drift: SEVEN migrations, nine tables — INTENTIONALLY UNAPPLIED

All seven were prepared in a five-day window (2026-07-13 → 2026-07-17) and each
carries an explicit header saying it must not be applied automatically. This is
**not a deployment accident**: it is the documented RED-class pattern — prepare
fully, merge the SQL, apply only by a separate owner act.

Verbatim from `20260713120000_company_locations_v1.sql`:

> `DRAFT — needs-human-gate — DO NOT APPLY automatically.`
> `@human-gate-approved`
> `migration prepared FULLY but NOT applied — production apply happens ONLY …`

and from `20260713160000_agency_clients_v1.sql`:

> `@human-gate-approved — owner approved MERGING this draft (PR #748 order,`
> `2026-07-13); application to production stays a separate owner gate.`

| # | Migration | Table(s) | Intended capability | Live reader today |
|---|---|---|---|---|
| 1 | `20260713120000_company_locations_v1` | `company_locations` | Company's own locations | none |
| 2 | `20260713160000_agency_clients_v1` | `agency_clients` | Agency client management in the company workspace (ORG-8) | `lib/agency/clients.ts:44` |
| 3 | `20260713210000_multi_source_talent_v1` | `worker_external_profiles`, `talent_source_records`, `identity_resolution_events` | Talent from more than one source, with identity resolution | `lib/worker/external-profiles.ts:66` |
| 4 | `20260714170000_worker_opportunity_seen_v1` | `worker_opportunity_seen` | "already seen" marks on the opportunity board | `lib/opportunities/seen.ts:107` |
| 5 | `20260714180000_journal_profession_templates_v1` | `journal_profession_templates` | Per-profession journal templates | `lib/journal/journal-templates.ts:35` |
| 6 | `20260714211000_dashboard_preferences_v1` | `dashboard_preferences` | Per-person dashboard layout preferences | none |
| 7 | `20260717150000_demand_interest_seen_v1` | `demand_interest_seen` | "already seen" marks on demand interest | none |

### Dependency and order

The seven are **independent of one another** — no table here references another
in the list, and each migration stands alone. Applying any subset is therefore
safe with respect to the others; order is not constrained beyond the usual
timestamp ordering. `20260713210000_multi_source_talent_v1` creates three
tables that DO depend on each other and must be applied as one unit (it already
is one migration).

### Is the absence intentional, obsolete, or a genuine gap?

**Intentional, and still pending.** Each header states the owner gate
explicitly; none has been superseded by a later applied migration; and no
later migration creates an equivalent under a different name — with two
partial exceptions worth naming so nobody assumes they are covered:

- `company_demand_locations` (applied) is **not** `company_locations`. It
  records the locations a demand targets, not the company's own sites.
- `agency_client_connections` (applied) is **not** `agency_clients`. It records
  an invitation-shaped connection between an agency and a client; the unapplied
  table is the fuller client model. This is exactly the ORG-8 register entry.

So: a **pending owner apply**, not obsolescence and not an accident.

### Blast radius today: none

All four live readers degrade honestly — each recognises the PostgREST
relation-absent codes (`42P01` / `PGRST205` / equivalents) and reports an
unavailable state rather than throwing:

| Reader | Absent-code handling |
|---|---|
| `lib/agency/clients.ts` | yes |
| `lib/worker/external-profiles.ts` | yes |
| `lib/opportunities/seen.ts` | yes |
| `lib/journal/journal-templates.ts` | yes |

So the four capabilities are **inert but honest** in production. There is no
user-visible defect and no silent wrong answer. What there is, is four built
capabilities that nobody can use until the owner applies these migrations.

`dashboard_preferences` and `demand_interest_seen` have no product reader at
all — unapplied *and* unused.

---

## 3. What the owner has to decide

Not for an agent. For each of the seven: apply, or retire the migration and
its reader.

Applying them is a **RED-class act** by the repo's own rules and by each file's
own header. The Step D instruction was to record this, not to fix it, and it
has not been touched.

One thing worth weighing when deciding: `lib/privacy/personal-relations.ts`
already registers `worker_external_profiles`, `worker_opportunity_seen`,
`dashboard_preferences` and `demand_interest_seen` as personal data, so the
GDPR export will begin covering them automatically on the day they are applied
— no follow-up needed on the privacy side.

---

## 4. Addendum, 2026-09-14 (after the owner's approved execution wave)

The wave merged **two more migrations that are deliberately unapplied**, both
RED-class and both waiting on the same owner act as the seven above. They are
recorded here so this document stays the one place that says what production
is actually running.

| Migration | What it changes | Creates a table? |
|---|---|---|
| `20260914120000_asset_single_open_assignment_v1` | MKT-3: one open assignment per asset — a partial unique index + `for update` in three SECURITY DEFINER bodies | no |
| `20260914140000_worker_saved_searches_v1` | DEM-8: `worker_saved_searches` + three gated RPCs + the `saved_search_match` notification type | yes |

**Measured directly on production, read-only, after the wave (not inferred):**

| Probe | Result |
|---|---|
| `worker_saved_searches` in `information_schema.tables` | **absent** |
| index `asset_assignments_one_open_per_asset` in `pg_indexes` | **absent** |
| `issue_asset_v1` body contains `for update` | **no** |
| `notification_events_type_check` contains `saved_search_match` | **no** |
| applied ledger rows | **278** (unchanged) |
| public base tables | **204** (unchanged) |

So the wave changed nothing in production, which is what the governance
requires: a RED migration is merged, never self-applied.

**Why the counts in §2 are not simply "+2".** §2 measures TABLES created in
repo migrations and absent from production, and only one of these two creates
a table. Counting by ledger version would be worse, not better: the applied
ledger's versions do not match the repo's filenames at all (verified again
today — the repo's `20260713120000_company_locations_v1` corresponds to ledger
row `20260715064810`), which is exactly why `supabase db push` is forbidden
here. Stated precisely:

- tables created in repo migrations but absent from production: **11 → 12**
- migrations prepared, merged and awaiting a separate owner apply: **7 → 9**

**Blast radius of the two new ones: none, and less than the seven above.**
Neither has a live reader that could degrade: MKT-3 only tightens functions
that already exist and already work (production holds 0 assets and 0 asset
assignments, so there is nothing to tighten yet either), and the saved-search
board strip renders NOTHING at all while its store is absent — no dead button,
no empty state claiming the worker has saved nothing.

