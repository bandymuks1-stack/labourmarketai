# SAFE CHECKPOINT — window 9, 2026-09-06

> Continuation state for the next agent. **Do not re-audit the repository.**
> Read this, then §8 NEXT ACTION.
>
> Previous: `docs/launch/SAFE_CHECKPOINT_2026-09-06_window8.md` (#1595).

---

## 1. Read this first: what this window could and could not do

**Both owner gates from window 8 are closed, applied and proven.** A fifth
surface of the same defect class was found and is one owner decision away. The
report RECEIVE loop — open since window 8 — was answered definitively.

**No production human walk was performed, and none was possible.** This
session's egress policy denies `labourmarket.ai:443` (403 on CONNECT,
recorded by the proxy as `connect_rejected`), and the local Supabase stack
cannot substitute because the container image layers are blocked too (403 from
the registry CDN). Chromium is installed and Playwright is configured; there is
simply nothing reachable to point them at.

So every claim below is evidenced at the **data layer on production**, through
the real RPC under a real user's auth context — never a unit test standing in
for a product claim, and never a service-role query standing in for a user.
That is strictly stronger than a test and strictly weaker than a human walk.
Section §7 states which is which, per the owner's §55 classification.

**The technique this window contributes.** Every proof below was produced by:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub','<real profile id>','role','authenticated')::text, true);
set local role authenticated;
… call the real RPC …
reset role;
… measure …
rollback;
```

This runs the actual gated read as the actual person, on production data, and
leaves **zero residue** — verified by row counts before and after. It also
lets a migration be *measured before it is applied*. Use it. It is the closest
thing to a walk that survives a blocked browser, and it found things a test
never would.

---

## 2. Served production

| | |
|---|---|
| SHA at window start | `10dee91e` / `6a5be65` (checkpoint) |
| SHA at window end | **`823d2c49`** |
| Region / health | **NOT VERIFIED THIS WINDOW** — `labourmarket.ai` unreachable |
| Database | `gorgitwvdzxbnaxhrsrw` · eu-west-1 · ACTIVE_HEALTHY (verified via MCP) |

⚠️ Two merges landed on `main` this window. Whether Vercel deployed them, and
whether the deployment is healthy, **could not be checked from this session.**
The next agent's first action should be to confirm the served build.

---

## 3. Merged this window

| PR | What | Migration |
|---|---|---|
| **#1594** | `countActiveOpenNeeds` scopes to the DEMAND direction — an agency's `agency_offer` stops consuming the employer's active-need allowance | none |
| **#1588** | `list_open_demand_for_workers` gains the direction predicate — the worker board stops serving agency SUPPLY as open jobs | **APPLIED** |

**APPLIED TO PROD:** `20260906194911_worker_board_excludes_supply_v1`
(rollback: `supabase/rollbacks/20260906140000_worker_board_excludes_supply_v1.down.sql`)

## 4. Open — one owner decision

| PR | Class | The one owner action |
|---|---|---|
| **#1596** | RED | **"Apply agency board excludes supply 2026-09-06"** — or decide the other way. The fix is already measured against production data; only permission to persist it is missing. See §6.1. |

---

## 5. Two defects found in #1588 *before* it was applied

Both were found by reading the live definition off production with
`pg_get_functiondef` instead of trusting the file. **Neither was caught by any
test, by CI, or by `migration-safety`.**

### 5.1 The rollback was not valid SQL

A paste fault had spliced the forward migration's comment block into the middle
of the `.down.sql` without comment markers, so line 14 read:

```sql
create or replace function` DROPS a function's `SET` configuration when
```

The file could not parse. **A RED migration whose recovery path cannot run has
no recovery path** — and the whole RED classification rests on reversibility.

### 5.2 Both bodies silently dropped `STABLE`

Live on production the function is `STABLE SECURITY DEFINER SET search_path`.
Both the forward migration and its rollback declared only `security definer`.

`create or replace` keeps **none** of the properties the new definition omits —
it re-defaults every one. Applying either file would have downgraded a
read-only function to `VOLATILE`.

The migration's own header already documented this trap **for `search_path`**,
one property over, and still fell into it. The generalised rule is now stated
in both migrations and enforced by a guard:

> A `create or replace` must restate EVERY property of the live definition,
> because the parser defaults each omitted one.

### 5.3 The guard that now catches both

`market-direction-surfaces.test.ts` previously pinned only the TypeScript
surfaces. It could not see the two gated reads that decide which rows are
handed over at all — **and both of those had shipped without a `kind` filter.**
That is precisely why the defect survived window 8's four-surface sweep.

It now reads the migration that most recently defines each board function and
asserts the direction predicate is present and is an allow-list, and that the
replace restates `stable` / `security definer` / `set search_path`.

**Both assertions were verified to FAIL when the property is removed.** A guard
that has only ever passed proves nothing.

---

## 6. What is proven, and how

### 6.1 The market-direction defect class — a fifth surface (#1596)

Found by sweeping **every** `SECURITY DEFINER` reader of `customer_requests`
for a body that never mentions `kind`:

```sql
select p.proname, (pg_get_functiondef(p.oid) ilike '%kind%') as mentions_kind
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike '%customer_requests%';
```

`list_open_demand_for_agencies()` has no `kind` filter, so an agency browsing
for work to staff is served **other agencies' offers as demand it could fill**.
Two agencies both saying "we have people" are shown each other as customers.

Measured as a real agency, and then measured again with the candidate fix
applied inside a rolled-back transaction:

| | before | after |
|---|---|---|
| rows the agency sees | 12 | 10 |
| of which `agency_offer` | **2** | **0** |
| rows removed / added | — | 2 removed, **0 added** |

`rows_added = 0` is the safety assertion: strictly narrowing.

**Why it is not applied.** It is a NEW RED migration the owner did not name
individually — #1588 and #1594 were named, this was found afterwards. The
doctrine's tiebreaker is explicit: *uncertainty moves only toward caution,
never RED → GREEN.* So it ships gated rather than self-approved, even though it
is identical in class, shape and risk to the #1588 that was approved an hour
earlier.

### 6.2 The worker board (#1588) — the checkpoint's exact probe

Called through the real RPC under a real worker's auth context:

| | before | after |
|---|---|---|
| rows served | 9 | **7** |
| of which `agency_offer` | 2 | **0** |

Live definition read back after apply: `provolatile = 's'`, `prosecdef = true`,
`proconfig = {search_path=public}`, predicate present.

**The recovery path was executed, not assumed.** The rollback body was run
inside `begin; … rollback;` on production: it executed, produced the prior
definition with all three properties intact, and left production carrying the
fix.

### 6.3 The report RECEIVE loop — open since window 8, now ANSWERED

**The loop works.** Proven end to end on production inside one rolled-back
transaction, with two different real people:

| step | result |
|---|---|
| worker submits a report into the review-enabled employment context | row created |
| **does it reach the responsible person?** receiver's queue, as the org owner | **1 — contains the report** |
| receiver acts via the real `review_journal_entry` RPC (`approved` + note) | accepted |
| receiver's queue after | **0** — the card stops asking |
| **worker sees the status** | **1** — `{"action":"confirm","decision":"approved","note":"Patvirtinu: matyti objekte, valandos sutampa."}` + confirmer id |

Residue: **zero.** `journal_entries` back at 40, `journal_entry_confirmations`
back at 13 — the exact pre-proof counts.

**So why was the owner's real queue empty?** Not because the read is broken.
`reviewable_journal_entry_ids()` is correct. It returns 0 because **no report
has ever been written into a review-enabled context.**

### 6.4 The real gap this exposed — 15 orphaned work records (§54, §9)

Of 17 unconfirmed live journal entries on production:

| where the entry landed | count | can it ever be verified? |
|---|---|---|
| context with `organization_id = null` (personal, `is_primary`) | **15** | **no — nobody can ever confirm it** |
| context with an org, relationship `owner` (their own company) | 2 | correctly not reviewable — nobody is above the owner |
| context with an org **and** review enabled | **0** | — |

These are real people's real work. They look saved. They are saved. **They can
reach no verifier, and the worker is told nothing.** That is the owner's §54
defect exactly: a failure wearing the clothes of a successful empty state.

The write-side cause is already fixed — `resolveEngagementContext`
(rules A/B/C/D) shipped and IS wired into the journal page, the capabilities
registry and the conversation worklog. The 15 orphans **predate it**. What is
still missing is (a) any signal to the worker that an entry has no possible
verifier, and (b) any route for the 15 existing orphans.

---

## 7. Owner §55 acceptance matrix

| Journey | Actor | State | Evidence / what is missing |
|---|---|---|---|
| Agency states offered capacity without consuming the employer's need quota | AGENCY | **PRODUCTION TECHNICALLY-PROVEN — human walk missing** | #1594 merged; the count is scoped through the shared allow-list; two `.or()` calls verified to AND (postgrest-js `searchParams.append`, read from source, not assumed). **Not walked:** S2 save as a human was not re-run — browser unreachable. |
| Worker board shows demand only | WORKER | **PRODUCTION TECHNICALLY-PROVEN — human walk missing** | 7 rows / 0 `agency_offer` through the real RPC as a real worker. **Not walked:** no human looked at the board. |
| Agency board shows demand only | AGENCY | **BLOCKED — one owner decision** | Fix measured (12→10, 2→0, 0 added). #1596 draft + `needs-human-gate`. |
| Report submit → receive → act → worker sees status | WORKER + COMPANY | **PRODUCTION TECHNICALLY-PROVEN — human walk missing** | Full chain proven on production, both roles, zero residue (§6.3). **Not walked:** neither screen was seen. |
| A worker learns who can confirm their work | WORKER | **PARTIAL — decision made, not built** | §6.4 + §8.3. The four states are decided and grounded in data; the chat route and the worker-facing signal are not built. |
| Employer discovers agency supply | COMPANY | **NOT STARTED — and it would be dishonest to start it today** | §8.4. There is no supply inventory to discover: the only two submitted `agency_offer` rows are partnership pings from May/June carrying `{"intent":"partner"}` — no role, no count, no country. The one row with real capacity content is stuck in `draft`. Building the read now would ship a board of empty rows. |
| Historical import (P0-F/G) | ALL | **NOT STARTED** | Untouched, as in window 8. |
| Authorized AI/agent import (P0-H) | AI/AGENT | **NOT STARTED** | Untouched. |
| Operational planning (P0-I) | COMPANY | **NOT STARTED** | Untouched. |
| INSTITUTION journeys | INSTITUTION | **NOT STARTED this window** | Architecture preserved; nothing changed. |

### Run facts

- **PRs merged:** #1594, #1588 · **PR opened:** #1596 (draft, `needs-human-gate`, watched)
- **Migrations applied:** 1 — `20260906194911_worker_board_excludes_supply_v1`
- **Migrations pending owner:** 1 — `20260906200000_agency_board_excludes_supply_v1` (#1596)
- **Checks:** `vitest` 1210 files / **20298 passed**, 2 skipped · `typecheck` exit 0 · `lint` 0 errors (38 pre-existing warnings) · `migration-safety` STRUCTURAL-GREEN
- **Human production journeys performed: 0** — browser unreachable (§1)
- **Test data created: 0 persisted.** Three write proofs ran inside transactions and were rolled back; residue verified zero by row count each time.
- **Security / privacy:** no policy, grant or RLS change was applied. #1596 changes none either — its `revoke`/`grant` lines re-assert the identical existing privilege set.
- **Pricing gates:** untouched. #1594 moved no price, plan, limit or enforcement rule — only which rows are counted. **Offered capacity is now unmetered**; metering supply needs its own limit and unit (owner call, unchanged from window 8 §6.1).
- **External credentials still required:** none for the above. A browser-reachable environment is required for any human walk.

---

## 8. NEXT ACTION for the next agent

**Do the cheap thing first: check the served build.** Two merges landed
unverified (§2).

1. **If the owner approved #1596**, apply via Supabase MCP `apply_migration`
   (never `db push`), then re-probe as a real agency: 10 rows, 0 `agency_offer`.

2. **Walk what is already proven.** Four journeys in §7 are TECHNICALLY-PROVEN
   with the human walk missing, purely because this session had no browser.
   They are the cheapest GREEN available: run
   `walk-supply-direction-prod.cjs` and `walk-operations-report-prod.cjs`, and
   walk the worker board and the report receive loop. Note the walk scripts
   hardcode `ROOT = "C:/Users/Mano/Documents/labourmarketai"` and read
   `apps/web/.env.local` — they need a path fix to run anywhere else.

3. **§6.4 — the 15 orphans. This is the highest-value unbuilt item.** The
   product decision is MADE; it does not need re-deciding. An entry's
   verifiability is fully derivable from its engagement context:

   | context | honest state | what the worker is told |
   |---|---|---|
   | org + review enabled | `awaiting_named_verifier` | who will confirm it |
   | org, review off | `no_verifier_configured` | nobody at ⟨org⟩ is set up to confirm work yet |
   | no org (personal) | `personal_no_verifier` | personal history — no employer can confirm this |
   | relationship `owner` | `self_owned` | you own ⟨org⟩; there is nobody above you to confirm |

   Build it as a pure derivation + tests, surface the state on the entry, and
   answer **"Kam pateikti atliktą darbą?"** with it. That sentence currently
   scores 1 on `find-work`'s bare `(darbo|darbą)` pattern and is answered with
   job adverts; any new intent at weight ≥ 5 wins it. A new intent needs a
   `ConversationIntent` union member, patterns, a registry descriptor, a new
   `IntentHandlerId`, its handler in `conversation-chat.tsx`, and 11 locales.
   **Walk it — this one is worth a browser.**

4. **§7 employer supply discovery — do NOT build the read first.** There is
   nothing to discover (§7 table). The supply door only became usable when
   #1594 merged this window; supply inventory starts accumulating from now.
   Build the read when there are rows, and make its empty state say *"no
   capacity has been offered yet"* rather than rendering the legacy
   partnership pings as capacity.

## 9. Do NOT re-investigate

* **The direction rule.** `apps/web/lib/demand/market-direction.ts`, one closed
  allow-list per direction. Never re-derive it per surface, never write a
  deny-list — guards fail on both, now in SQL as well as TypeScript.
* **The receive loop.** It works (§6.3). If a manager's queue looks empty, the
  question is *which engagement context did the entry land in* — not whether
  the RPC is broken.
* **`resolveEngagementContext` is wired.** Journal page, capabilities registry,
  conversation worklog. The 15 orphans predate it; they are not evidence that
  it is missing.
* **Two `.or()` calls AND, they do not overwrite.** postgrest-js uses
  `searchParams.append`, so PostgREST receives two `or=` params and ANDs them.
  The org scope in `countActiveOpenNeeds` is intact.
