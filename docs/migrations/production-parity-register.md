# Production ↔ repository migration parity register

**Date:** 2026-08-18
**Production:** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai)
**Repo baseline:** `origin/main` @ `0c5d8e12`
**Machine-checked by:** `pnpm check:migration-parity` (live, read-only)
**Model + tests:** `apps/web/lib/migrations/parity-model.ts`

> **This document is a secondary record. The truth is production's own
> `supabase_migrations.schema_migrations` table.** That lesson is already
> recorded in `docs/APPLIED_LEDGER.md` (2026-08-13, privacy_request_intake) and
> is why the register is generated from a live read and pinned by a gate rather
> than maintained by hand.

---

## Refresh — 2026-09-08 (supersedes the 2026-09-07 refresh below)

**Method:** snapshot mode. The 2026-09-07 snapshot was **6 applies stale**
(266 → 272). The six new rows were read live with
`select version, name from supabase_migrations.schema_migrations where version >
'20260906202628' order by version`, and the confirming read at that instant
returned `count(*) = 272`, `max(version) = 20260908082301` — so **266 + 6 = 272**
makes the append complete rather than assumed.

**Result:** `LEDGER_SNAPSHOT=… pnpm check:migration-parity` → **PASS**.
272 applied in production, 274 files in repo, every production migration has a
repository file. The 9 repo files with no ledger row are unapplied drafts and
are reported as informational.

**Why this refresh exists, and why it is not enough.** On 2026-09-08 production
ran **ahead of `main`**: `notification_events_service_role_grant` and
`notification_recipient_discovery_service_role_select` were applied to
production while their files existed only on an unmerged branch (#1566). No CI
gate caught it, because the live parity gate is inert without
`secrets.SUPABASE_DB_URL` — see **GOV-1**. A snapshot carries no freshness
contract; it is as-of its `read_at` and nothing re-reads it on its own. This
refresh closes today's gap and does not close the class.

| | 2026-08-18 | 2026-08-23 | 2026-09-07 | **2026-09-08** |
|---|---:|---:|---:|---:|
| Applied in production | 225 | 232 | 266 | **272** |
| Files in `supabase/migrations` | 228 | 235 | 269 | **274** |

Applied in this window: `employer_supply_discovery_v1` and
`organization_evidence_import_v1` (2026-09-07), the two notification grants
(by another session earlier the same day), then `evidence_parties_recursion_fix_v1`
(EVID-1) and `esco_canonical_linkage_67` — the last two under explicit owner
approval, each verified against production after the apply.

---

## Refresh — 2026-09-07 (supersedes the 2026-08-23 refresh below)

**Method:** snapshot mode again — a lead session with Supabase MCP read-only
access exported the production ledger to
`docs/migrations/production-ledger-snapshot.json` (**266 rows**, read
2026-09-07T03:46:32Z, project `gorgitwvdzxbnaxhrsrw`, max version
`20260906202628`) during the full product reconciliation
([`docs/reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md`](../reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md)).

The previous snapshot was **32 applies stale** (234 → 266), i.e. every
snapshot-mode parity run between 2026-08-23 and today was measuring a ledger
that no longer existed. Nothing in the gate caught that, because a snapshot
carries no freshness contract — it is as-of its `read_at` and says so, and
nobody re-read it.

| | 2026-08-18 | 2026-08-23 | **2026-09-07** |
|---|---:|---:|---:|
| Applied in production | 225 | 232 | **266** |
| Files in `supabase/migrations` | 228 | 235 | **269** |
| **Applied with no repo file (orphans)** | **0** | **0** | **0** |
| **Repo files not yet applied** | 9 | 9 | **10** (8 candidates + 1 never-apply + 1 in flight) |

### The nine, named — and the direction NO gate checks

The gate proves *applied → has a repo file*. **Nothing proves the reverse**, and
the reverse is where the risk now sits: a migration can sit in the repository
for eight weeks with live UI in front of it and no check says a word.
Confirmed absent from production by direct `to_regclass` reads on 2026-09-07:

| Migration file | Object | Live code depends on it? |
|---|---|---|
| `20260713160000_agency_clients_v1` | `agency_clients` + 3 RPCs | **yes** — `lib/agency/clients.ts`, agency room on `/dashboard/company` |
| `20260714180000_journal_profession_templates_v1` | `journal_profession_templates` | **yes** — journal composer |
| `20260713210000_multi_source_talent_v1` | `worker_external_profiles`, `talent_source_records`, `identity_resolution_events` | **yes** — profile external-links section |
| `20260714170000_worker_opportunity_seen_v1` | `worker_opportunity_seen` + RPC | **yes** — opportunity board "new since last visit" |
| `20260717150000_demand_interest_seen_v1` | `demand_interest_seen` + RPC | no |
| `20260713120000_company_locations_v1` | `company_locations` + 2 RPCs | no — superseded by `work_objects` |
| `20260714211000_dashboard_preferences_v1` | `dashboard_preferences` | no |
| `20260717130000_open_markets_countries_draft_v1` | country allowlist widening | no |
| `20260714210000_company_memberships_v1` | superseded draft | **NEVER APPLY** — the file's own header says so; retained only because a guard pins its bytes |
| `20260907114500_organization_evidence_import_v1` | 8 evidence-import tables | in flight (owner P0, RED, awaiting the human gate) |

Each of the first four renders an honest "not enabled yet" to real users today.
That is correct behaviour and a real capability gap — see owner decision 2 in
[`docs/CAPABILITY_INVENTORY.md` §6.3](../CAPABILITY_INVENTORY.md).

---

## Refresh — 2026-08-23 (supersedes the Result table below; that table is kept as the 2026-08-18 record)

**Method:** the gate's new **snapshot mode** — a lead session with Supabase MCP
access (read-only `execute_sql`) but no DB connection string exported the
production ledger to `docs/migrations/production-ledger-snapshot.json`
(232 rows, read 2026-08-23T12:30Z, project `gorgitwvdzxbnaxhrsrw`) and ran:

```
LEDGER_SNAPSHOT=docs/migrations/production-ledger-snapshot.json pnpm check:migration-parity
```

A snapshot run states loudly that it is as-of its read time, never "live".
Live mode (`DB_URL=…`) is unchanged and remains the preferred form where a
connection string exists.

| | 2026-08-18 | **2026-08-23** |
|---|---:|---:|
| Applied in production | 225 | **232** |
| Files in `supabase/migrations` | 228 | **235** |
| Matched by name | 216 | **223** |
| Accounted for by a reviewed apply shape | 9 | **9** |
| **Applied with no repo file (orphans)** | **0** | **0** |
| Repo files not yet applied | 9 | **9** |

**PASS — every production migration still has a repository file.** The 7
migrations applied since 2026-08-18 (`workflow_template_management_v1` …
`workflow_work_task_definition_v1`) all match repo files by name. The 9
unapplied files are the same gated/superseded set listed below — unchanged.

Cross-checked the same day by per-object inspection (read-only SQL): the
"absent despite repo migration" set reduces entirely to (a) tables from the
gated DRAFT files below, (b) intentionally dropped legacy (`threads`,
`messages`), and (c) repo DRAFT files whose slug was applied under a
applied ledger row of the same slug but **different content** — the gate's
stated identity-not-content limitation, so noted here for the reader:
`worker_saved_public_vacancies_v1` was applied as a column extension of
`worker_saved_opportunities` (column verified present on prod), not the
DRAFT file's separate table; `request_rate_limits_v3` was applied as the
`propose_booking_request_v3` wrapper (function verified present), the DRAFT
header in the repo file notwithstanding. Those two repo files are satisfied
by the applied designs and must not be applied again. (`worker_work_card`,
sometimes reported as an absent table, was never a table — its repo file
matches the applied columns + RPCs on `workers`.) **Zero silent schema
drift.**

---

## Result

| | |
|---|---:|
| Applied in production | **225** |
| Files in `supabase/migrations` | **228** |
| Matched by name | 216 |
| Accounted for by a reviewed apply shape | 9 |
| **Applied with no repo file (orphans)** | **0** |
| Repo files not yet applied | 9 |

**Every migration applied to production has a file in this repository.**

---

## Correction to the 2026-08-18 full-project truth audit

The audit recorded REQ-GOV-016 as **BROKEN**:

> Repo 225 files vs production 213 applied … At least one applied production
> migration is unreproducible from the repo — a rebuild-from-scratch would not
> reach the current schema.

The direction of that finding was right and it found a real defect. The
**severity was overstated**, and the count comparison was not meaningful.
Checked row by row against the live ledger:

* **8 of the 9 apparent orphans are not missing files.** They are split, union
  or follow-up applies whose content is already in an existing repo file
  (table below). A rebuild-from-scratch reproduces them.
* **1 was a genuine orphan** — `20260705240000_agency_legacy_retype`, now
  restored (below).
* **That orphan is a DML data migration, not DDL.** It retyped 3 `companies`
  rows. A rebuild-from-scratch has no such rows, so **schema reproducibility
  was never actually broken**. What was broken is *provenance*: a data change
  had been made to production with no record of it in the repo.

The honest verdict is therefore **provenance gap, closed** — not "the schema is
not fully reproducible".

---

## The one genuine orphan, restored

| | |
|---|---|
| Ledger row | version `20260705111011`, name `20260705240000_agency_legacy_retype` |
| Restored as | `supabase/migrations/20260705240000_agency_legacy_retype.sql` |
| Rollback | `supabase/rollbacks/20260705240000_agency_legacy_retype.down.sql` |
| Content | recovered verbatim from `schema_migrations.statements` |
| What it did | set `company_type = 'staffing_agency'` on companies whose profile has an `agencies` row — 3 rows |
| Approval | owner, 2026-07-05, quoted in the applied statement: *"APPROVED — apply agency legacy retype (3 rows)"* |

**Why it went missing:** the 2026-07-05 lead session applied it via MCP and
renumbered the next migration (`20260705250000_journal_photos_project_gallery`)
to avoid the timestamp collision — but never committed the file. It stayed
invisible for six weeks because nothing compared the repo against the ledger.

**A live-data finding recorded rather than smoothed over:** of the three rows it
changed, `048aa7e1-…` has since been changed **back** to `construction` by a
later legitimate action. So re-running the statement against production today
would silently overwrite that change. The restored file says so explicitly and
is marked DO-NOT-RE-APPLY; on a fresh database it is a harmless no-op.

---

## Reviewed apply shapes (8 ledger rows, 0 missing files)

Each was checked against the named repo file's contents on 2026-08-18. These
live in `REVIEWED_APPLY_SHAPES` so the gate can distinguish them from a real
orphan — **adding an entry to silence a failure instead of restoring a file is
the misuse this register exists to prevent.**

| Ledger name | Shape | Repo file(s) | Checked |
|---|---|---|---|
| `journal_entry_photos_table` | split 1/3 | `20260612091000_journal_entry_photos` | file declares the table, the RPC **and** the storage bucket + policies |
| `journal_entry_photos_rpc` | split 2/3 | same | same file |
| `journal_entry_photos_storage` | split 3/3 | same | same file |
| `conversation_message_language_check` | follow-up | `20260610190000_conversation_message_language` | production's column pre-existed, so that file's `add column if not exists` no-opped and its **inline** CHECK never materialised; this row added exactly that CHECK. A clean rebuild creates the column *with* the inline check, so the repo file reproduces the constraint unaided |
| `company_memberships_v1_trigger_fn_revoke` | follow-up | `20260806090000_company_memberships_v1` | the trigger-function REVOKEs are present in that file (lines 168–169) |
| `notification_types_union_workflow_document_v3` | union | `20260817130100_notification_events_v3_workflow_types` + `20260817140100_notification_document_types_v3` | replaying both (then `20260818044145_notification_events_v4_task_types`) reproduces production's constraints exactly — verified against `pg_get_constraintdef`: 17 event types, 8 entity types |
| `invitation_org_authority_v1_resend_completion` | follow-up | `20260817121000_invitation_org_authority_v1` | that file already carries the resend org-authority branch (§4) |
| `public_vacancy_preview_v1_revoke_public` | follow-up | `20260818140000_public_vacancy_preview_v1` | that file already carries the REVOKE-FROM-PUBLIC block for all three projection functions; the first apply predated it |
| `company_memberships_v1` | duplicate slug | applied: `20260806090000_company_memberships_v1`; superseded: `20260714210000_company_memberships_v1` | two repo files share the slug, so name-matching correctly refuses to guess. `20260714210000` is a DRAFT marked `SUPERSEDED-BY-20260817160000` in its own header, never applied, retained only because `company-architecture-v1.test.ts` pins its content |

---

## Repo files not applied to production (9) — normal, not a defect

Gated migrations awaiting a lead apply, plus one deliberately-retained draft.
The gate reports these; it does not fail on them, because failing here would
make it useless exactly on the branches that need it.

```
20260713120000_company_locations_v1
20260713160000_agency_clients_v1
20260713210000_multi_source_talent_v1
20260714170000_worker_opportunity_seen_v1
20260714180000_journal_profession_templates_v1
20260714210000_company_memberships_v1          ← superseded draft, never to be applied
20260714211000_dashboard_preferences_v1
20260717130000_open_markets_countries_draft_v1
20260717150000_demand_interest_seen_v1
```

---

## Two ledger facts that make hand-matching unreliable

1. **`version` is the APPLY TIME, not the migration's timestamp.** Supabase
   stamps it at apply. `20260705240000_agency_legacy_retype` is recorded under
   version `20260705111011`. **Never match on `version`** — only `name` carries
   identity. This drift is noted four separate times in `APPLIED_LEDGER.md`;
   the gate now encodes it instead of relying on a reader remembering.
2. **Name shape varies** — some rows carry the full repo stem
   (`20260804160000_booking_engagement_end_v2`), some only the slug
   (`timesheets_v1`). The gate handles both, and refuses to guess when a slug
   is ambiguous.

---

## What the gate does not cover, stated plainly

* It compares **identity**, not **content**. A repo file whose SQL was edited
  after being applied would still pass. Content equality is partly covered by
  the LF-SHA256 records in `APPLIED_LEDGER.md` and the human-gate docs, which
  remain a per-migration manual discipline.
* It cannot see a production change made **outside** a migration (a hand-run
  `alter table` in the SQL editor leaves no ledger row). Nothing in the repo
  can see that; only a schema diff could.
* ~~It is not wired into `quality.yml`~~ — **CORRECTED 2026-08-23. It is.**
  PR #1236 added a `Migration parity (live ledger gate)` step to
  `.github/workflows/quality.yml`. The step is **inert, not absent**: it reads
  `secrets.SUPABASE_DB_URL`, and when that is empty it prints a `::warning`
  and `exit 0`, so the job goes green having verified nothing. On main's run
  for `608b0836` the step completed in about two seconds, which is what the
  skip path looks like; the definitive signal in any run is whether that
  warning was printed.

  **The remedy is one owner action, and the step already names it:** *"Owner
  action required to activate this gate: add a read-only `SUPABASE_DB_URL`
  secret."* Until that exists, every green `quality` run is silent about
  repo↔production migration parity.
* **A snapshot run is only as true as its snapshot, and this bit already.**
  On 2026-08-23 two migrations were applied to production
  (`notification_events_v6_weekly_digest`, `notification_preferences_v1`)
  without refreshing `production-ledger-snapshot.json`. The gate then read a
  snapshot taken before those applies, classed both as "in the repo, not yet in
  production", and returned **PASS** — correct for its input, wrong about the
  world. Production held 234 ledger rows; the snapshot held 232.

  The gate already prints the warning that would have caught this ("Refresh the
  snapshot from the production ledger before trusting a PASS for an apply
  decision"). Refreshing this snapshot is part of applying a migration, in the
  same commit as the `APPLIED_LEDGER.md` row — not a separate errand. Both were
  corrected on 2026-08-23 by a verifying session reading
  `supabase_migrations.schema_migrations` directly.

  **CORRECTED, same day, by the session that wrote the paragraph above.** It
  originally ended "what is missing is not a check but a habit". That was half
  right and the wrong half was the actionable one. A check *does* exist —
  #1236 wired the parity step into `quality.yml` — and it is inert for want of
  a `SUPABASE_DB_URL` secret (see the corrected bullet above). The habit still
  matters for snapshot mode, but calling the whole gap "a habit problem"
  buried the one thing an owner can fix in a minute. The paragraph was written
  from the register's own stale line rather than from `quality.yml`, which is
  the same mistake — trusting a document over the artifact — that both this
  register and the entry above exist to correct.
