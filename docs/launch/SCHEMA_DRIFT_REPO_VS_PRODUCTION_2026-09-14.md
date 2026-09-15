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

## 4. Addendum, 2026-09-14 — the wave's two migrations, now APPLIED

The approved execution wave added two RED-class migrations. Both were merged
unapplied, presented for owner review, **approved on 2026-09-14 ("OWNER
APPROVAL — BOTH RED APPLIES APPROVED") and applied separately, each verified
before the next was touched.** Full evidence: `docs/APPLIED_LEDGER.md`.

| Migration | Ledger version | Creates a table? |
|---|---|---|
| `20260914120000_asset_single_open_assignment_v1` (MKT-3) | `20260914144053` | no |
| `20260914140000_worker_saved_searches_v1` (DEM-8) | `20260914144310` | yes |

**Measured on production, read-only, after both applies:**

| Probe | Result |
|---|---|
| `worker_saved_searches` in `information_schema.tables` | **present**, RLS on, one SELECT-only policy |
| index `asset_assignments_one_open_per_asset` | **present**, predicate `status IN ('issued','acknowledged')` |
| `issue_asset_v1` / `transfer_…` / `return_…` contain `for update` | **yes, all three** |
| `notification_events_type_check` contains `saved_search_match` | **yes**, and still contains `weekly_digest` |
| lifecycle-RPC ACLs before vs after | **identical** — `authenticated=X`, `anon` absent in both |
| applied ledger rows | 278 → **280** |
| public base tables | 204 → **205** |
| rows in the new table / assets / assignments | **0 / 0 / 0** |
| notification preference rows | **0** — no email was activated by either apply |

**Counting, precisely.** Migrations prepared, merged and awaiting a separate
owner apply: **9 → 7**. Tables created in repo migrations but absent from
production: **12 → 11**. Both figures return to the July set described in §2;
neither of this wave's migrations is in it any more.

Counting by ledger version would still be wrong: the ledger records APPLY TIME,
not the repo's filename prefix — these two landed as `20260914144053` and
`20260914144310` against repo prefixes `20260914120000` and `20260914140000`,
which is the same mismatch §2 describes and the reason `supabase db push` is
forbidden here.

---

## 5. What is still unapplied

The **seven July drafts** in §2, unchanged. Each still carries its own
owner-gate header, none has been superseded, and the four with live readers
still degrade honestly. They remain the owner's decision: apply, or retire the
migration and its reader.

### 5.1 An EIGHTH prepared capability, outside `supabase/migrations/`

Added 2026-09-14. This inventory is built from `supabase/migrations/`, so it
could not see a prepared migration that was deliberately placed elsewhere:

| Capability | Files | Objects absent from production | Live reader |
|---|---|---|---|
| Assistant (AI-control) transcript persistence | `docs/proposals/assistant-transcript-v1/20260724_assistant_transcript_v1.sql` + `.down.sql` + `README.md` | `assistant_conversations`, `assistant_messages`, `append_assistant_message` | `apps/web/lib/assistant/transcript.ts`, read by the conversation chat |

The placement is **deliberate and documented**, not an accident: the README
states it is kept out of `supabase/migrations/` so `#864` CI stays green, and
that applying it is a separate owner-gated PR. Both files carry SHA-256
integrity lines. The reader degrades to `available: false` and the chat stays
session-only, claiming nothing was saved.

It is recorded here because an inventory that lists seven and says "these are
what is still unapplied" reads as complete. The honest count of prepared,
unapplied capabilities is **eight**; only seven of them are migrations.

### 5.2 Twelve source headers claimed an applied migration was not

Also 2026-09-14. Checked every module whose comments assert a migration is
unapplied against production: of 101 tables and 54 RPCs so referenced, only
`agency_clients`, `journal_profession_templates`, `worker_external_profiles`,
`worker_opportunity_seen` (the July four) and the assistant pair above are
actually absent. Everything else is live — several with real rows.

Corrected in place, with the degradation branches kept: worker languages
(ledger `20260711203623`, **13 rows**), worker education and achievements
(`20260716195418`, **4 and 2 rows**), the availability-prefs v2 pack (all
seven columns present on `workers`), `upsert_worker_document`, the pilot
cohort tables and RPCs (`20260716195326`), the agency↔client bridge
(`20260723155658`) and the S5 pool RPCs.

`lib/worker/worker-education.ts` had already been corrected once and states
the lesson its ten siblings kept repeating: **apply status belongs to the
database, not to a comment.**

