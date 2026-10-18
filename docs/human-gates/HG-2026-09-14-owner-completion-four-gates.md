# HG-2026-09-14 — Four owner gates, prepared individually

> **Status: DECISION PACKET. Nothing here is applied, implemented or merged.**
> Every claim below is a direct read of this repository or of production
> `gorgitwvdzxbnaxhrsrw` (labourmarket.ai) on 2026-09-14. All database access
> was `SELECT`-only. No migration was applied, no row was written.
>
> Prepared under the continuation handoff. The broad `BUILT_NOT_CONNECTED`
> sweep from the previous session was **not** repeated.

---

## 0. Verified current state (checked, not assumed)

| Claim in the handoff | Verified |
|---|---|
| PR #1739 draft, unmerged, `needs-human-gate` | ✅ head `009a1a2`, branch `claude/labourmarket-audit-ikzeez`, base `main` @ `b77657e` |
| CI "still running" at handoff | ❌ **now complete** — all 8 checks green |
| Local branch state | `claude/labourmarket-owner-completion-c9iyaw` was level with `origin/main` (0 ahead / 0 behind) |

PR #1739 checks on `009a1a2`: `quality` ✅ · `migration-safety` ✅ · `e2e-smoke` ✅ ·
`mobile` ✅ · `ios` ✅ · `CodeQL` ✅ · `Analyze (javascript-typescript)` ✅ ·
`Supabase Preview` skipped. **#1739 has not been merged and auto-merge has not
been enabled**, per the handoff.

Production row counts confirming the handoff's closing facts:
`worker_saved_searches` 0 · `assets` 0 · `asset_assignments` 0.

---

## 1. GATE — S5 agency pool / open decision #7

### The finding: this is not an open decision. It was decided on 2026-07-05.

The handoff asks which of two competing agency models should be canonical. The
evidence says the owner already chose, and the choice is enforced by a guard.

`apps/web/lib/guards/agency-direction-a.test.ts`, header:

> **Agency Direction A guard (owner decision, 2026-07-05).**
> An agency/recruiter is a TYPED staffing-agency VIEW inside the canonical
> COMPANY workspace — a company whose `companies.company_type` is
> `'staffing_agency'`. There is **NO separate agency persona, NO separate
> agency dashboard, NO duplicate agency candidate/demand system.**

### The two models, as they actually exist

| | **Model A — legacy `agencies` world** | **Model B — typed view in the company room (CANONICAL)** |
|---|---|---|
| Data structure | `agencies` (id, profile_id, legal_name, country, description), `agency_workers` | `companies.company_type='staffing_agency'`, `organizations`, `agency_client_connections` |
| Authority | `owns_agency(uuid)` | `owns_company` / `manages_organization` / `organization_roles` |
| Read service | `lib/agency/pool.ts` → `getAgencyPool`, `markAgencyCanOffer` | `lib/agency/clients.ts` → `listAgencyClients`, `listAgencyDemands` |
| Live RPCs | `owns_agency`, `invite_agency_worker`, `accept_agency_worker_invitation`, `assign_agency_worker_role`, `set_agency_worker_journal_review`, `agency_pool_docs_readiness`, `agency_worker_engagement_links`, `provision_agency_worker_engagement_context`, `mark_agency_can_offer` | `create_/accept_/decline_/revoke_agency_client_connection_v1`, `share_request_with_agency_v1`, `submit_/withdraw_agency_candidate_offer_v1`, `respond_agency_candidate_offer_v1`, `list_shared_requests_for_agency_v1`, `list_agency_offered_candidates_for_request_v2`, `list_agency_offer_progress_v1` |
| Route | `/dashboard/agency`, `/dashboard/agency/pool` — **retired in W1** | `/dashboard/company` (+ `#company-team`) |
| Surface today | **none** | `AgencyClientsSection` on `/dashboard/company` |
| **Production usage** | `agencies` **3 rows**, `agency_workers` **0 rows** | `companies` with `company_type='staffing_agency'` **4**, `agency_client_connections` **2 rows** |

### Why the S5 pool has no surface — it is enforced, not forgotten

`next.config.ts:127` permanently redirects
`/:locale/dashboard/agency/pool → /:locale/dashboard/company#company-team`.

`agency-direction-a.test.ts:74` pins the ban explicitly:

```ts
it("the canonical company path imports nothing from the LEGACY lib/agency world", () => {
  expect(companyPage).not.toMatch(
    /@\/lib\/agency\/(pool|pool-actions|actions|agency-workers)/,
  );
  // allow-list: clients, clients-model, clients-actions
});
```

So `lib/agency/pool.ts` is **deliberately fenced out of the canonical surface**.
Giving it one would break this guard and reverse an owner decision.

### Semantic difference and overlap

The two models are not rivals for the same job. Model A answers *"who is in my
pool and are they ready?"* (docs-readiness aggregates, country readiness,
bridge-gated journal evidence). Model B answers *"who are my clients, what
demand did they share, whom did I offer?"*. Model B does **not** currently carry
the pool-readiness question.

But Model A cannot answer it either: **`agency_workers` holds 0 rows.**
`getAgencyPool()` would return an empty pool for every caller on earth today.
Connecting it adds no capability — it adds a second roster truth beside
`engagement_contexts`, which is the ORG-6 debt this architecture is trying to
pay down.

### Recommendation

**Model B is canonical. Confirm it; do not build a third.** Then choose between
two honest endings for the S5 read service — this is the only live question:

- **B1 (recommended) — retire `lib/agency/pool.ts` / `pool-actions.ts` by
  recording a retirement on the capability row**, not by deleting the row, so
  the next agent sees the product once did this and why it stopped. The
  readiness *question* is preserved as a named gap against Model B.
- **B2 — re-express pool readiness inside the company room** over the canonical
  tables (`engagement_contexts`, `organization_roles`), reusing
  `agency_pool_docs_readiness()` which is already consent-gated and
  world-neutral. Larger, and worth doing only when an agency actually has
  workers to be ready.

Either way: **do not wire `lib/agency/pool.ts` to a route.**

### Owner decision required

> Confirm Model B as canonical, and choose **B1 (retire and record)** or
> **B2 (re-express against canonical tables)**.

---

## 2. GATE — WRK-8 worker-side defect visibility (RED)

### Exact current policy (production, 2026-09-14)

```sql
-- defects: RLS enabled, exactly ONE policy, SELECT only
defects_select  USING (can_manage_project(project_id)
                       OR reporter_id = auth.uid()
                       OR is_admin())

-- defect_corrections: RLS enabled, exactly ONE policy, SELECT only
defect_corrections_select  USING (caller_manages_defect(defect_id) OR is_admin())
```

`can_manage_project(p)` = `owns_company(p.company_id) OR manages_organization(p.organization_id) OR is_admin()`.
`caller_manages_defect(d)` = `can_manage_project` of that defect's project.

Table grants to `authenticated`: `SELECT` only — **no INSERT/UPDATE/DELETE**.
All writes run through four `SECURITY DEFINER` RPCs, each executable by
`authenticated` and each gated on `can_manage_project` / `caller_manages_defect`:
`report_defect_v1`, `set_defect_status_v1`, `add_defect_correction_v1`,
`delete_defect_v1`.

### The gap

`public.defects.assignee_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL`
— the column recording **who must fix the defect** — appears in **no policy**.
`set_defect_status_v1` writes it. Nothing ever reads it back for that person.

**A worker assigned a defect cannot read the row that names them.**

### Why this is cheap, and why it is still RED

`profiles.id REFERENCES auth.users(id)` — so **`profiles.id` IS `auth.uid()`**.
The existing `reporter_id = auth.uid()` term already relies on this. The
disclosure needs no join, no new function, no new grant.

### Proposed minimum disclosure

```sql
-- defects_select: ADD one disjunct, change nothing else
USING (can_manage_project(project_id)
       OR reporter_id = auth.uid()
       OR assignee_profile_id = auth.uid()   -- <— the only change
       OR is_admin())
```

`defect_corrections_select` is **deliberately left alone** in this proposal.
Widening it is a separate question (see "open sub-question" below).

### Exact fields the worker would see

Every column of their own assigned `defects` row:
`id, project_id, stage_id, location, category, severity, description,
reporter_id, assignee_profile_id, due_date, status, created_at, updated_at`.

The surface reads a narrower set still (`lib/quality/quality.ts`):
`id, category, severity, description, location, status, due_date`.

### What remains hidden

- **Every defect they are not assigned to** — including all other defects on the
  same project. The predicate is per-row, not per-project.
- **`defect_corrections`** — the manager's correction record, reviewer identity
  and outcome, under the unchanged `caller_manages_defect` policy.
- Project economics, budgets, assets, CRM, all other operations data — untouched.
- `reporter_id` is a column, not a name: resolving it to a person still goes
  through `profiles` RLS, which this change does not touch.

### Affected production rows and users

**Zero.** `defects` = 0 rows, `defect_corrections` = 0 rows, against 9 projects.
No existing row's visibility changes. This is a forward-looking correctness fix
with an empty blast radius — the cheapest possible moment to make it.

### Rollback

A faithful inverse, and trivially safe because the change is one disjunct:

```sql
drop policy defects_select on public.defects;
create policy defects_select on public.defects for select
  using (can_manage_project(project_id) OR reporter_id = auth.uid() OR is_admin());
```

Ships as `supabase/rollbacks/<version>_wrk8_defect_assignee_read_v1.down.sql`.

### Privacy / security implications

- **Direction is correct.** This discloses to the *data subject of the
  assignment* — the person the row is about. It is the same class of
  disclosure the previous session shipped five times: *the platform could
  create a record the person it names could not see or answer.*
- **It does not widen employer visibility** and so does not touch ARCH-4.
- **Risk considered and rejected as minimal:** a defect description is written
  by a manager and may be critical of work. Letting the named person read it is
  the *fairness* argument, not against it — SEP-3 (evidence ≠ verification)
  and the EVID-1 precedent both point the same way. The alternative is a
  quality record about a named worker that the worker cannot see.
- **Fails closed.** A worker with no assignment matches no disjunct and reads 0
  rows with no error.

### Why existing authority cannot satisfy it

Three routes were checked and all fail:

1. **`can_manage_project`** — requires `owns_company` or `manages_organization`.
   An assigned worker is by definition neither.
2. **`reporter_id = auth.uid()`** — the manager reports the defect, not the
   assignee. Never matches.
3. **A `SECURITY DEFINER` read RPC** — would work without touching RLS, but it
   creates a *second* read path to the same table beside the surface's existing
   PostgREST read. That is the duplicate-truth pattern the doctrine forbids,
   and it would leave the RLS policy still wrong for every future reader.

**No existing authority reaches it. The policy is the gap.**

### Open sub-question for the owner

Should the assigned worker also see the **corrections** recorded against their
defect (`defect_corrections`)? Arguments both ways; deliberately **not**
proposed here, because the correction carries `reviewer_id` and an `outcome`
that may read as a judgement of the person. Recommend deciding it separately.

### Owner decision required

> Approve the one-disjunct widening of `defects_select` (RED — RLS change).
> Separately: decide whether `defect_corrections` follows.

---

## 3. GATE — `withdraw_contact_disclosure_request_v1` has no employer read surface

### The RPC

```
withdraw_contact_disclosure_request_v1(p_id uuid)  SECURITY DEFINER
  EXECUTE granted to authenticated; revoked from public and anon
  authority (per 20260817122000): owner_id = auth.uid() OR org demand access
```

**Application callers: zero.** The only repository reference is
`lib/guards/security-train-a-v1.test.ts`, which parses the SQL text. No server
action, no component, no route invokes it.

### Does the read need a new surface? No — one already exists.

`contact_disclosure_requests_select` (live) already admits the employer:

```sql
USING (owner_id = auth.uid()
       OR EXISTS (select 1 from workers w
                   where w.id = contact_disclosure_requests.worker_id
                     and w.profile_id = auth.uid())
       OR is_admin()
       OR has_org_demand_access(organization_id))
```

And `getScoutingContactRequestStates(requestId)` in
`lib/privacy/contact-disclosure-actions.ts` **already performs exactly this
read**, owner-scoped, through plain RLS:

```ts
.from("contact_disclosure_requests")
.select("worker_id, status, expires_at, organization_id, created_at")
.eq("owner_id", user.id)
.eq("request_id", requestId)
```

It is rendered on **`/dashboard/company/scouting`**, where the employer already
sees, per worker, the newest ask state *and* whether the separate consent-ledger
grant is live.

### So the gap is not visibility. It is the take-back.

The employer sees the ask they sent. They have no way to un-send it. The RPC to
do so exists, is granted, and is authorised — and nothing calls it.

That is **precisely the recurring defect class** the previous session named:
*the platform could create a record that the user could not later correct or
take back.* Five of six instances were connected using existing authority. This
is the sixth and last.

### Does OWNER TARGET / the privacy lifecycle require it?

**Yes, on the product's own stated contract.** The module's own header
establishes that accepting an ask never discloses anything by itself, and that
disclosure is a separate consent-ledger act. A lifecycle with
`propose → respond → grant` and no `withdraw` leaves the *requesting party*
unable to retract a standing request for someone's personal data — while the
worker's side already has both a response and a revocation path. The asymmetry
is the defect.

### Minimum existing surface to host it

**`/dashboard/company/scouting`** — the same card that already renders the ask
state per worker. No new route, no new component tree, no new read.

### Cost to implement

- **No migration. No new grant. No RLS change. No new surface.**
- One server action wrapping the existing RPC, plus a control on the existing
  card, plus i18n strings.
- Classification: **CONNECT**, GREEN class — the same shape as the five already
  shipped (`a8b9bf0`, `995fb99`, `c2328a5`, `733a867`).

### Production state

`contact_disclosure_requests` = **0 rows**. Nothing to migrate; no live request
is affected either way.

### Recommendation

Approve as ordinary CONNECT work. It needs no owner gate on authority grounds —
the authority is already granted and already used. It is presented here only
because the handoff listed it, and because "should the employer be able to
retract a personal-data request" is a product question, not an engineering one.

### Owner decision required

> Confirm the privacy lifecycle requires a withdraw path, and that
> `/dashboard/company/scouting` is the right host. Then it proceeds as GREEN.

---

## 4. GATE — Migration reconciliation

### Method

Every `supabase/migrations/*.sql` filename (280 files) was matched against the
live `supabase_migrations.schema_migrations` ledger by full filename **and** by
slug. Eleven did not match. Each was then checked against production schema
rather than inferred. **Eleven, not nine** — the §6.4 reconciliation of
2026-09-07 covered nine and missed three, while double-counting one.

### Classification

#### ALREADY_EQUIVALENT — applied under a different ledger name. **Never apply.** (3)

> **CORRECTION 2026-09-14 — this packet's own error.** An earlier revision called
> these three "all new findings" and said the 2026-09-07 §6.4 pass "missed three".
> The first half was wrong. §6.4 did not cover them, but the repository already
> recorded all three, in two places: the 2026-08-19 correction block at the head
> of `docs/APPLIED_LEDGER.md` (the two notification files, applied as one union
> row), and `docs/migrations/production-parity-register.md` +
> `REVIEWED_APPLY_SHAPES` in `apps/web/lib/migrations/parity-model.ts` (all three,
> with reasons, guarded in CI). **Nothing here was newly discovered.** What was
> genuinely missing is narrower, and is what 4a fixed — see below.

| File | Evidence |
|---|---|
| `20260612091000_journal_entry_photos` | Split into three applied entries: `journal_entry_photos_table` (`20260612072652`), `_rpc` (`20260612072736`), `_storage` (`20260612075300`). Production: table ✅, `register_journal_entry_photo` ✅, bucket `journal-entry-photos` ✅, **11 rows in real use**. |
| `20260817130100_notification_events_v3_workflow_types` | Superseded by `notification_types_union_workflow_document_v3` (`20260817172306`). Live `notification_events_type_check` already admits `workflow_step_pending`, `workflow_decided`, `workflow_delegated`, `workflow_escalated`; entity check admits `workflow_instance`. |
| `20260817140100_notification_document_types_v3` | Same union migration. Live checks already admit `document_ack_assigned`, `document_ack_completed`, `document_expiring` and entities `worker_document`, `org_document`, `document_acknowledgement`. |

> **Consequence if applied anyway:** each drops and re-adds a constraint that is
> already correct, or re-runs DDL against objects holding live data. This is the
> exact re-run hazard the doctrine's "never `db push`" rule exists to prevent.
> **Recommendation: leave in tree, never apply.** The two notification files
> (not the third) carry `@human-gate-approved` annotations that are now *stale* —
> the work they authorise was completed by another route.

**Durable recording as implemented (4a, 2026-09-14) — nothing deleted.** The
guard this packet proposed building would have duplicated a canonical structure:
`REVIEWED_APPLY_SHAPES` in `apps/web/lib/migrations/parity-model.ts` already
accounts for all three (kinds `split` and `union`), behind `parity-model.test.ts`,
`product-readiness.test.ts` and a `quality.yml` step. So the canonical register
was EXTENDED, not replaced:

- each file gained an `ALREADY APPLIED — MUST NOT BE APPLIED AGAIN` header naming
  the exact ledger row(s) it is live under, with the read-only production evidence;
- the two stale `@human-gate-approved` annotations are **retained verbatim**
  (history is evidence) and explicitly marked stale — they authorise nothing now;
- `lib/guards/never-apply-already-applied-v1.test.ts` pins each marker AND
  cross-checks every claimed ledger name against `REVIEWED_APPLY_SHAPES`, so the
  file-side claim and the canonical accounting cannot drift apart.

`parity-model.ts` answers "every APPLIED row has a repo file". It cannot answer
the reverse — "this FILE must never be applied" — and that direction was the
unguarded one.

#### OBSOLETE — superseded, guard-pinned. **Never apply.** (2 — confirmed, unchanged)

| File | Evidence |
|---|---|
| `20260714210000_company_memberships_v1` | Its own header says `DO NOT APPLY THIS FILE, EVER`. The applied `company_memberships_v1` is ledger `20260805195716` — **a different file**. Its validation trigger would `42501`-reject a live manager whose governance lives only in `company_memberships`. Bytes pinned by `company-architecture-v1.test.ts`. |
| `20260713120000_company_locations_v1` | Superseded by `work_objects_v1` (`20260817204529`). Confirmed absent from the ledger. Would create a second location truth. Pinned by `work-objects-projects-v1.test.ts`. |

#### GENUINELY UNAPPLIED — live UI depends on absent schema. **P0, owner gate.** (4)

All four confirmed absent by `to_regclass` on 2026-09-14.

| File | Table(s) | Live dependents | Consequence of apply |
|---|---|---|---|
| `20260713160000_agency_clients_v1` | `agency_clients` | `lib/agency/clients.ts` + `clients-actions` + `clients-model`; `AgencyClientsSection` on `/dashboard/company` | The agency room's client list starts working. **Note the interaction with Gate 1** — this is the one Model B module that is schema-blocked. |
| `20260714170000_worker_opportunity_seen_v1` | `worker_opportunity_seen` | `lib/opportunities/seen.ts`, `recommendations-model`, `weekly-intelligence-model`, `spine-signals`, `marketplace/worker-opportunities` | The "new jobs" count can clear; the 7-day `created_at` fallback stops standing in for it. |
| `20260714180000_journal_profession_templates_v1` | `journal_profession_templates` | `lib/journal/journal-templates.ts`, `journal-entry-composer.tsx` | Composer scaffolding becomes seedable. **Lowest risk of all eleven** — 1 table, 2 policies, no `SECURITY DEFINER` body, 2 grants, no DML, paired rollback. |
| `20260713210000_multi_source_talent_v1` | `worker_external_profiles`, `talent_source_records`, `identity_resolution_events` | **split** — only `worker_external_profiles` has a live consumer | ⚠️ applies 3 tables + 8 definer RPCs to serve 1 table's UI. **Recommend the PER-11 split first.** |

**Dependency / order:** all four are independent of each other and of the
ALREADY_EQUIVALENT set. No ordering constraint between them.

#### DEFER — no live dependent (2)

| File | Why |
|---|---|
| `20260714211000_dashboard_preferences_v1` | Zero runtime consumers; the card grid it served was deleted in W3. Applying creates a table with no writer. |
| `20260717150000_demand_interest_seen_v1` | Zero runtime consumers; `spine-signals.ts` explicitly defers the signal. Applying before the signal is built is the wrong order. |

#### OWNER MARKET-SCOPE DECISION (1)

`20260717130000_open_markets_countries_draft_v1` — adds GE / BE / FR / ES / AT / CH
to `countries`. **Verified on production: all six are absent.** Data only —
no table, no policy, no function, no grant. Nothing is blocked by it. This is a
market-scope call, not an engineering one.

### The assistant-transcript item (outside `supabase/migrations/`)

`docs/proposals/assistant-transcript-v1/` — deliberately placed outside the
migrations directory so CI stays green. Status in its own README:
**PROPOSAL / DESIGN-ONLY. NOT APPLIED. Owner-gated RED.**

**Integrity verified 2026-09-14** — both `sha256sum` values match the README
exactly, so the files are unedited since they were written:

```
de0e3ff8…656497f  20260724_assistant_transcript_v1.sql
ea8e83c2…5275307  20260724_assistant_transcript_v1.down.sql
```

Production: `assistant_transcripts` absent; no `assistant_conversations` /
`assistant_messages`. **Classification: GENUINELY UNAPPLIED, intentionally.**
It is correctly filed and correctly gated. Nothing needs doing unless the owner
wants AI-control transcripts to persist across reload.

### Recommendation

Nothing here should be applied because it "appears unapplied". Concretely:

1. **Correct the record first** — three files are stale-annotated as pending
   when their work is already live. That is a truth defect, not a migration one.
2. If the owner wants one apply to validate the gate procedure on something
   small: **`journal_profession_templates_v1`** is the safest of the eleven.
3. **Do not apply `multi_source_talent_v1` as written** — split it (PER-11).

### Owner decision required

> Confirm the three ALREADY_EQUIVALENT files are recorded as never-apply, and
> authorise (or decline) each of the four P0 applies individually.

---

## 5. Current automated-proof ceiling

### What automation proves today

| Layer | Evidence | Verified 2026-09-14 |
|---|---|---|
| Unit + guard suite | `pnpm -F web test` | **1330 files, 22716 passed**, 2 skipped |
| Types | `pnpm -F web typecheck` | clean |
| Lint | `pnpm -F web lint` | 0 errors (40 pre-existing warnings) |
| Build | `pnpm -F web build` | clean |
| Product truth | `.github/scripts/product-truth.mjs` | 106 capabilities, self-consistent |
| Migration safety | static, secret-free, no-DB | green on #1739 |
| Native / mobile | `ios`, `mobile` jobs | green on #1739 |
| Static analysis | CodeQL + Analyze | green on #1739 |
| Production read-only | Supabase MCP `SELECT` | used throughout this packet |

### The ceiling itself — stated so nobody misreads a green CI

**CI does not cover a single authenticated journey.** This was decided
2026-09-08 as an engineering call under explicit owner delegation, and the
reasoning is recorded in the capability register: an authenticated fixture
strategy means minting real sessions in CI, which requires either long-lived
seeded credentials in a secret or a login flow against production. *The cost is
not the fixtures, it is what they would have to hold.*

So `quality` passing says **nothing** about whether a signed-in worker,
employer, agency or institution can complete their chain. `e2e-smoke` covers
the unauthenticated subset only.

**HUMAN_UI_PROVEN stands at 17 of 106.** It cannot be raised by automation, and
nothing in this packet claims it. The honest ceiling for everything else is
`PRODUCTION_DATA_PATH_PROVEN` — reached by calling live functions under a real
user's auth inside a transaction that is then rolled back, which is how EVID-1
and the supply-discovery row were proven.

### Real actor journeys prepared for the owner's later walk

1. **Manager → defect** — `/dashboard/projects/<id>/operations`, Delivery &
   Quality panel: report → assign → correction → accept. Fully wired today;
   0 rows means nobody has walked it.
2. **Worker → assigned defect** — blocked on Gate 2. Nothing to walk until the
   policy is widened.
3. **Employer → contact ask → withdraw** — `/dashboard/company/scouting`.
   Ask and state display are live; the withdraw control is Gate 3.
4. **Agency → clients** — `/dashboard/company` with
   `company_type='staffing_agency'`. Blocked on `agency_clients_v1` (Gate 4 P0).

---

## 6. Safe non-owner-gated work available now

Work that can proceed while these gates and HUMAN_UI_PROVEN wait — **without
manufacturing capabilities from intentional limitations**:

- ✅ **Done this session** — the WRK-8 register correction and the
  contact-disclosure stale-truth comment (see PR #1740). Truth corrections
  touch no schema and no behaviour.
- **Available** — audit the remaining `disconnectedBecause` rows for the same
  unfalsifiable shape (`coreModule: null` + `surfaces: []`), which is what let
  WRK-8's false claim survive. WRK-4 and WRK-8 were both this. A guard that
  *rejects* the unfalsifiable shape outright would close the class.
- **Available** — the trip → calendar link, **only** through the existing
  planning-source architecture and only if semantics and authority already
  match. No parallel trip calendar.
- **Not available** — everything in Gates 1–4.

### What was explicitly NOT done

- #1739 not merged; auto-merge not enabled.
- No migration applied; no production write of any kind.
- No new agency model, route, schema or actor model.
- No claim of HUMAN_UI_PROVEN from automation.
- `UNKNOWN`/`UNAUTHORIZED` never reported as `ZERO`.
