# M4 — Matching engine "why" slice — RED / needs-human-gate

**Status:** RED. No matching code/UI shipped. The real matching corridor cannot
be built without DB changes (new migration + new RPC + additive grants + RLS
helper update) **and** an owner data-model decision. A prepared, additive,
reversible migration is included as a PROPOSAL only — **not applied, do not
merge, do not deploy.**

## Preflight answers (the 7 required questions)

1. **Where demand is submitted.** Canonical intake is `customer_requests` via
   `submit_demand_request` (company/agency cockpit) + `save_customer_request`
   (buyer). This is the live, single demand path (convergence decision).

2. **Where job-demand data is stored/read.** `public.job_demands` (migration
   0001) — the LEGACY matching-source table. It has **no live app writes**
   (the job-postings flow was neutralized; see `matching-ui-neutralized`
   guard). So matching's expected source table is effectively empty in product.

3. **Does `matches` exist / typing.** Yes (0001): `matches(worker_id,
   job_demand_id, score numeric(5,2), reasons jsonb, computed_at, unique
   (worker_id, job_demand_id))`. **`reasons jsonb` is the "why" store.**
   Note: it references `job_demand_id`, **not** `customer_request_id`.

4. **Does `match_actions` exist / typing.** Yes (0001): `match_actions(match_id,
   actor_id, action text check (action in
   ('view','like','skip','request_contact','invite','accept','decline')),
   occurred_at)`. The kanban verbs the slice wants
   (`considered`/`shortlisted`/`rejected`) are **not** in this CHECK.

5. **RLS/auth for the needed records.**
   - `matches`: SELECT = `can_access_match(id) or is_admin()`; **WRITE =
     `is_admin()` only** (comment: "written via service role"). The app/user
     session **cannot insert** matches.
   - `match_actions`: INSERT = `actor_id = auth.uid() and
     can_access_match(match_id)` (user-writable) — but needs a real `match_id`.
   - **No `GRANT` on `matches`/`match_actions` to `authenticated`** exists
     (only `job_demands` was granted, 0023). Under the explicit-grant model the
     app session cannot even SELECT `matches`/`match_actions` today.
   - `can_access_match` resolves only the legacy `matches→job_demands→projects→
     companies` chain — it cannot authorise a `customer_request`-based match.

6. **Can matching be implemented without DB/RLS/RPC changes?** **No.** Blockers:
   - matches/match_actions are **not granted** to `authenticated` (read blocked);
   - matches **write is admin/service-role only**, and **no compute RPC is
     deployed** → computing+persisting matches needs a new SECURITY DEFINER RPC;
   - matches is keyed to `job_demands`, which has no source from the canonical
     `customer_requests` → a **data-model decision** is required;
   - kanban verbs need either a new `match_status` column or an extended action
     CHECK;
   - `can_access_match` must be widened to the request-owner/worker.
   Every one is a RED trigger.

7. **Files intended for edit.** None for product code (RED). Deliverables:
   this gate doc + a prepared, owner-gated migration
   `supabase/migrations/20260531091638_matching_engine_why.sql` (NOT applied).

## Owner decisions required (these block a correct migration)

1. **Demand source for matching.** Recommended: the canonical
   `customer_requests` (the migration assumes this and adds
   `matches.customer_request_id`). Alternative: derive `job_demands` from
   `customer_requests` (heavier; reuses the legacy chain). Owner picks.
2. **Worker eligibility for the LT→NL reinforcement corridor.** Which workers
   are candidates? (e.g. profession = reinforcement + country signal). The
   compute RPC ships **disabled (`where false`)** until this is approved — it
   fabricates nothing.
3. **Scoring formula.** Which dimensions are in v1 and their weights. Only
   `SKL` (worker_skills vs request, weighted manager_confirmed > work_journal >
   self_declared) has real data today; `REL/SPD/SAF/ADP/TRS`, availability and
   relocation readiness have **no real source** → they must be reported in
   `reasons.missingData`, never scored. Owner approves the SKL formula.
4. **Kanban model.** Recommended: a new `matches.match_status`
   (`considered`/`shortlisted`/`rejected`) + a `set_match_status` RPC (keeps the
   existing `match_actions` event log intact). Owner confirms.

## What the prepared migration does (additive, reversible, owner-applies)

`supabase/migrations/20260531091638_matching_engine_why.sql`:
- adds `matches.customer_request_id` (FK), `matches.corridor`,
  `matches.match_status` (checked, default `considered`) + indexes;
- `GRANT select on matches`, `GRANT select, insert on match_actions` to
  `authenticated` (RLS still gates every row);
- widens `can_access_match` to recognise the `customer_request` chain (request
  owner + matched worker) — access only widens to legitimate participants;
- adds `compute_matches_for_request(uuid)` (SECURITY DEFINER, request-owner/admin
  only) — transparent scoring, **shipped disabled** so it persists nothing and
  fabricates nothing until the owner approves eligibility + the SKL formula;
- adds `set_match_status(uuid, text)` (request-owner/worker) for the kanban.
- Rollback (in-file comment): drop the two functions, revert `can_access_match`,
  drop the added columns/indexes/grants.

It is additive, ships no fabricated data, and must be applied **manually via
Supabase MCP after the owner decisions above**.

## After the migration is applied (the GREEN follow-up slice)

With the grants + RPC + columns live, a focused GREEN UI slice can:
- add `config/score-dimensions.ts` (SKL/REL/SPD/SAF/ADP/TRS labels — app config,
  no DB) and a `MatchWhy` type;
- call `compute_matches_for_request`, read `matches` (RLS-scoped) + `reasons`
  (the structured "why"), render score + per-dimension reasons + `missingData` +
  kanban via existing `components/ui` + tokens;
- wire considered/shortlisted/rejected to `set_match_status` and log
  `match_actions`;
- honest empty state ("request saved; no eligible workers for this corridor
  yet; missing: …") — no demo candidates, no fabricated scores;
- reactivate a real matching surface in line with the `matching-ui-neutralized`
  guard (which permits matching UI to return **only** as the real M4 engine).

## Safety

No migration applied. No production change. No RPC executed. No merge. No
deploy. No fabricated candidates/scores. Draft PR + `needs-human-gate` only.
