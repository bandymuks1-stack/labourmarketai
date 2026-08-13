# Controlled beta readiness — measured 2026-08-13

**main:** `b993caec` · **production:** `gorgitwvdzxbnaxhrsrw` · **prod ledger head:** `20260812214302`

Every line below is labelled with how it was established. Nothing here is
inferred from reading source alone.

---

## 1. Production truth, re-derived (VERIFIED_PRODUCTION, read-only)

| Fact | Value |
|---|---|
| `auth.users` / `profiles` | 36 / 36 |
| signed in last 7 days | **7** · most recent sign-in `2026-08-10 16:59Z` |
| `workers` | 36 |
| `journal_entries` | **36, of which 0 synthetic** |
| `customer_requests` (inquiries) | **19, of which 2 QA-synthetic → 17 real** |
| discoverability consent grants | **5 granted, by 5 distinct people** |
| `booking_requests` | 2 — **both QA-synthetic** (1 accepted, 1 proposed) |
| `company_worker_engagements` | **0** |
| `worker_absences` | **0** |
| `worker_documents` | **0** |
| `ai_runs` | **0** |
| `public_vacancies` | 87, all `is_active`, `import_session_id` 0/87, newest `last_seen_at` `2026-08-09 20:05Z` (**~4 days stale**) |
| `notification_events` table | **does not exist** |

**The headline is not "nothing is real".** Real people are using this: 17 real
inquiries, 36 real journal entries, 5 real discoverability decisions, 7 sign-ins
in the last week. What has *never* happened in production is the second half of
the marketplace chain.

## 2. The chain that has never run in production

`booking → accept → engagement → absence` has **zero real evidence**:

* the only `accepted` booking is `[QA-SYNTHETIC] testinis pasiulymas - NEREAGUOTI`,
  accepted `2026-08-06 20:26Z`;
* it minted **no** engagement — because the org-first resolution fix
  (`booking_engagement_org_resolution_v1`) was applied to production
  **`2026-08-08`**, two days *after* that accept;
* **no booking has been accepted since the fix landed.**

So "booking→engagement works in production" is **NOT_ENOUGH_EVIDENCE** — not
broken, not proven. The fix has never been exercised by real traffic. The
orphaned accepted booking is a pre-fix artefact, not a live defect.

Downstream consequence, stated plainly: `worker_absences` and
`company_worker_engagements` being empty is **EMPTY_BY_EXPECTATION**, not
BROKEN — there is no engagement for an absence to hang off.

## 3. #1097 privacy — CLOSED (see the companion note)

62/62 behavioural checks on a throwaway Postgres; blast radius measured against
production as **exactly four policies**; documents / journal / private absence
reason structurally out of reach. Full detail:
`docs/audits/can-view-worker-1097-behavioural-proof-2026-08-13.md`.

## 4. What is honest and working (VERIFIED_BROWSER, production)

* **Pricing (§27) — PASS.** No checkout, no card, no fake monthly price. Every
  tier reads "Prices are being prepared — nothing can be bought yet", and each
  feature is individually marked `IN THE PRODUCT TODAY` vs
  `PREPARED — STARTS ONLY WITH BILLING`. This is unusually honest and should not
  be touched.
* **Marketing honesty (§26) — PASS.** Landing has **zero** "live"/real-time
  words and **zero** pulsing indicators. The MarketPulse live-dot carry-forward
  is already fixed (owner directive 2026-08-09) and pinned by
  `lib/guards/public-market-pulse-liveness.test.ts`. The worker card carries an
  explicit label: *"An example card with illustrative data — not a real person."*
* **Mobile (§25) — no P0/P1 found at 320 or 375** on `/` and `/create-cv`:
  `documentElement.scrollWidth == body.scrollWidth == viewport`, **0 overflowing
  elements** measured by bounding box (not by `scrollWidth`, which lies under
  `overflow-x:hidden`). Both primary CTAs are exactly **44×208px** and preserve
  the acquisition intent (`?next=/dashboard/prof…`). Sub-44px controls are
  footer/nav text links only — P2 under existing doctrine, no primary CTA
  affected.
* **Discoverability model (§12) — correct by construction.** Consent is an
  append-only event keyed on `purpose='profile_discoverability'`, and it only
  counts when `action='granted'` **and** the accepted `consent_text_version`
  still equals the current version. Default is closed (`coalesce(…, false)`).
  Re-consent is forced when the text changes. 5 people have granted it.

## 5. Blockers, each with its exact next action

### 5.1 Sweden supply — CONFIGURATION_GATED
Importer is **not broken, not being run** (confirmed in
`docs/operations/sweden-supply-diagnosis-2026-08-12.md`; upstream answered HTTP
200 to the exact bounded request). It needs the production service-role key plus
`VACANCY_SOURCE_<KEY>_ENABLED` in the invoking environment — an operator act by
design. An agent must not hunt for those values, and a manual SQL import is
forbidden. **Exact action:** run `scripts/vacancy-operator-run.ts` in
`--mode dry_run`, then `--mode persist --apply` only if the accounting is sane.

### 5.2 Durable notifications — OWNER_GATED
`20260810070000_notification_events_v1` is written, has a paired rollback, and
its gate doc state is `AWAITING_OWNER_DECISION`. It ships UNAPPLIED and was
**not** applied here. Until it is, "the counterparty is notified" is derived
counts at render time only — a worker whose absence is decided while offline
learns nothing durable. **Exact action:** owner approves or declines the apply.

### 5.3 Local E2E (CV funnel, golden chain) — BLOCKED_EXTERNAL, newly diagnosed
This is why the authenticated CV E2E and the booking golden chain keep coming
back unproven. **Two independent environment blockers**, neither a product
defect. Both were reproduced this window.

**Blocker A — reserved port range.** `supabase start` fails with
`bind: An attempt was made to access a socket in a way forbidden by its access permissions`.
Root cause: Windows/Hyper-V has **reserved TCP 54258–54357**
(`netsh interface ipv4 show excludedportrange protocol=tcp`), and **every**
Supabase local default port falls inside it — 54320 shadow, 54321 api, 54322 db,
54323 studio, 54324 inbucket, 54327 analytics. Not one port: the whole block.

*This was worked around* (temporarily, uncommitted: ports moved to the 553xx
band, analytics disabled) and **the core stack did come up** — Studio on 55323,
API/GraphQL on 55321. So the port range is a real but surmountable blocker.
The workaround was **reverted**; `supabase/config.toml` is untouched on this
branch, because a committed port move would hit ~50 worktrees and CI.

**Blocker B — the reset dies under memory pressure.** With the stack up,
`supabase db reset` (198 migrations) terminated with
`error running container: exit 137` — SIGKILL, i.e. the container was OOM-killed.
Note the trap for the next session: **the shell still reported exit code 0**, so
a script that trusts the exit code will believe the reset succeeded. It did not;
afterwards every `supabase_*` container was gone, and `e2e-mint-session.ts`
correctly refused with `REFUSED_NON_LOCAL_E2E_SESSION_MINT` (it never falls back
to `.env.local` — the fail-closed guard behaved exactly as designed).

**Exact action (owner):** raise the Docker Desktop memory limit (the 198-migration
reset is the peak), and either free the reserved range via
`netsh int ipv4 delete excludedportrange` after a reboot or agree a project-wide
port move. Until both are done, no authenticated local proof is obtainable on
this machine.

### 5.4 Authenticated production verification — BLOCKED_EXTERNAL
An agent may not create accounts or enter passwords. Every authenticated
production surface (CV import, board, scouting, booking, absence review) is
therefore unverifiable by this session in the browser. Any claim about them must
come from local E2E — which is blocked by 5.3.

## 6. Hygiene finding (not fixed — production data is owner-gated)

**Two QA-synthetic rows remain in production**: `booking_requests`
`88a43ead…` (accepted) and `435488f2…` (proposed), both noted
`[QA-SYNTHETIC] … NEREAGUOTI`, plus 2 synthetic `customer_requests`. PR #860's
record set the standard — *"All synthetic fixtures deleted, orphan checks = 0"* —
and that was not honoured for the #1042 prod-QA journey. They are RLS-invisible
to other users, but they contaminate any traction count and they are the reason
`booking_requests` looks non-empty. **Deleting production rows is owner-gated;
nothing was deleted.** Recommend an owner-approved cleanup.

## 7. Verdict

### CONTROLLED_BETA = **BLOCKED — but by supply and awareness, not by defects**

Measured against §35, criterion by criterion:

| Criterion | State |
|---|---|
| auth main path | NOT_ENOUGH_EVIDENCE (5.4) — 7 real sign-ins in 7 days is strong circumstantial evidence it works |
| worker completes onboarding | NOT_ENOUGH_EVIDENCE (5.4); 36 real workers exist |
| CV create/import/export | **NOT PROVEN** — `worker_documents` = 0, no CV has ever been uploaded in production; E2E blocked by 5.3 |
| worker discoverable with consent | **PASS** — 5 real grants, fail-closed, version-pinned |
| real job ads / working supply | **FAIL (disclosed)** — 87 rows, ~4 days stale, 0 session-threaded. Staleness *is* disclosed to users (#1128), so it is honest, not deceptive |
| matching both directions | NOT_ENOUGH_EVIDENCE |
| employer submits inquiry | **PASS** — 17 real inquiries |
| employer finds candidate | NOT_ENOUGH_EVIDENCE |
| booking → engagement → absence | **NOT_ENOUGH_EVIDENCE** — never exercised post-fix (§2) |
| counterparty awareness of critical events | **FAIL** — no durable store (5.2); derived counts only |
| journal/calendar consistency | NOT_ENOUGH_EVIDENCE |
| feedback easy to find | NOT_ENOUGH_EVIDENCE |
| mobile no P0/P1 clipping | **PASS** (public routes measured) |
| pricing does not lie | **PASS** |
| demo numbers marked | **PASS** |
| privacy fail-closed | **PASS** — #1097 proven, 62/62 |
| no known P0 | **PASS** — none found in this window |

**No P0 was found.** The two things standing between here and
`READY_WITH_KNOWN_LIMITATIONS` are both *gated actions*, not engineering:

1. run the Sweden import (operator, §5.1) — gives testers something to look at;
2. decide the notification migration (owner, §5.2) — gives testers a reason to
   come back.

With those two done and the CV E2E unblocked (§5.3), this reaches
`READY_WITH_KNOWN_LIMITATIONS`. Without them, inviting testers means inviting
them to a board of 4-day-old listings where nothing tells them anything happened.

### BROADER_PUBLIC = **NOT READY** · ### PAID = **NOT READY** (deliberately — no purchase path exists, by owner decision)
