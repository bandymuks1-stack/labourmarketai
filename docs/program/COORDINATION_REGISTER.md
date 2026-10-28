# COORDINATION REGISTER — who is doing what, right now

The ONE place where parallel sessions (Claude Code on the owner's computer, cloud
sessions, Codex, manual work) see each other's claims, dependencies, migration and
deploy lanes, and hand-offs. It is shared project data, not one chat's memory.

**What this file is NOT** (it points to these, never copies them):

| Truth | Canonical home |
|---|---|
| What the product is, capability status, broken journeys, open owner decisions | `node .github/scripts/product-truth.mjs` → `docs/CAPABILITY_INVENTORY.md`, `docs/OWNER_TARGET_ARCHITECTURE_V1.md` |
| Which migration is applied in production | `docs/APPLIED_LEDGER.md` + `supabase_migrations.schema_migrations` (match on `name`, never `version`) |
| Owner decisions | `docs/DECISIONS/` |
| What a finished slice proved | `docs/program/AUTONOMOUS_EXECUTION_TRACKER.md` |
| Detailed roadmap waves | owner's private Internal Brain (see `docs/master/LABOURMARKET-EXECUTION-ROADMAP.md`) |

**This repository is public.** Write only: PR/branch/commit ids, session ids, counts,
states. Never e-mail addresses, personal names of real users, secrets, customer data
or private commercial detail.

---

## 1. Protocol (binding for every session working on labourmarketai)

### 1.1 Before starting — is it already being done?
1. `git fetch origin` and read §3 of this file on `main` **and** on open PR branches
   that edit it.
2. Search open PRs and branches for the area (title, touched files).
3. Where the session can, list sessions (`list_sessions`) and read the last owner
   message of any session whose title matches the area.
4. If a live claim exists (§1.5 freshness) → do not start a parallel slice. Either
   pick other work, or record a dependency on that claim.

### 1.2 Claiming
A claim is real only when it is visible to others:
- push the branch early and open a **draft PR** whose body starts with
  `Claim: <one-line goal> · session <session id or "manual"> · lane <app|db|deploy|docs|qa>`;
- add or update the row in §3 in the same PR (or, for a one-commit fix, in the
  commit itself). The PR is the claim; the row is the index.

### 1.3 Dependencies
Write `Depends on #NNNN` / `Blocks #NNNN` in the PR body and in the §3 row.
A dependent PR merges only after the one it depends on, then merges `main` in.

### 1.4 Completion and deploy
A row moves to `DONE` only with: merge commit on `main` **and** a successful
`Deploy to VPS` run for a commit that contains it (deploy = production). Owner-gated
DB work additionally needs its `APPLIED_LEDGER.md` entry. "Merged but not deployed"
is `WAITING (deploy)`, not `DONE`. Production verification level is stated
honestly: `LIVE_VERIFIED` (walked in production), `CI_ONLY`, `NOT_VERIFIED`.

### 1.5 Stale owners — never take over active work by mistake
A claim is **live** if any of: a push to its branch, a PR comment/review answer, or
activity in its named session within the last **24 h**. It is **stale** only when
all three are older than 24 h. A stale claim is marked `STALE?` in §3 with the
evidence; it may be taken over only after (a) the owner says so, or (b) 24 h more
pass after the `STALE?` mark with no reaction. Taking over = new commits on top
(merge, never rebase/force-push someone else's branch) and a PR comment saying so.
Never close, delete or reset another session's branch or PR.

### 1.6 Migration lane — one production DB change at a time
- Only one session holds the **migration lane** (§2). Take it by editing §2 before
  `apply_migration`; release it after the ledger entry and guard pins are pushed.
- RED migrations: owner approval must name *that* migration; approval for one never
  covers another (owner rule repeated 2026-10-27/28).
- The shared guard pin lists (`docs/APPLIED_LEDGER.md`,
  `apps/web/lib/guards/*migration*` counters, `booking-engagement-end-v1.test.ts`
  migration set) conflict between any two DB PRs. The PR merged second resolves the
  conflict by merging `main` in; the session holding the lane goes first.
- A migration applied in production MUST be on `main` within 24 h, or be recorded
  in §4 "drift" with the reason. Production must never hold SQL that `main` lacks
  without a written note (re-run hazard).

### 1.7 Deploy lane
`deploy-vps.yml` deploys `main` after Quality Gates; merges serialize there. A
session merging a change that needs a post-deploy check writes `WAITING (deploy)`
and verifies after the run for its commit succeeds. Do not merge while another
session's owner-gated production step (migration apply, live send) is mid-flight in
§2 unless the PRs are independent.

### 1.8 Hand-off
A session that stops writes, in its PR body (or §3 row): current head SHA, what is
proven, what is left, exact next step, and anything waiting on the owner. A
session's transcript is not a hand-off — other sessions may not be able to read it.

### 1.9 What blocks what (no artificial blocks)
Classify every blocker as one of: `SECURITY/DATA` (real stop), `INFRA/CI`,
`NOT_VERIFIED` (unproven, not known broken), `OWNER` (only the owner can do it).
An unrun synthetic E2E is `NOT_VERIFIED` for its own feature only; it never blocks
independent work or launch of other features (owner order 2026-10-28).

---

## 2. Lanes (edit before use, clear after)

| Lane | Holder | Since | What |
|---|---|---|---|
| migration (prod DB) | — free — | | last: `external_referral_reprocess_candidates_v2` applied 2026-10-28 04:47Z by session `…AygGqFo3aoB76NrV` (#2843) |
| live sends (e-mail to real people) | — free — | | last: partner referral reprocess DONE 2026-10-28 05:46Z — 45/45 unique addresses sent, 0 failed, 0 duplicates (see D-3) |
| deploy | — serial via `deploy-vps.yml` — | | production = `c3f440fc` (#2850, contains #2843), healthy 2026-10-28 05:45Z |

---

## 3. Work register — snapshot 2026-10-28 ~06:20Z

Sources: GitHub PRs/Actions, production migration ledger, session list and
transcripts readable from the coordinator session. Status per §1.4.

### 3.1 Active executors

| Session | Where | Doing | State |
|---|---|---|---|
| `session_016CYcDuhGGEA75ruJ3zXD99` "projekto perėmimas" | owner's computer | #2849 merge after CI; platform functional + UX audit (owner order 04:48Z); RED-draft conflict upkeep | IN_PROGRESS |
| `session_011vBC1iAygGqFo3aoB76NrV` "darbų perimimas" | owner's computer | #2843 merge → dry run → 1 control → 3 sends; read-only journey audit | IN_PROGRESS |
| `session_011vBC1hnVKqGvExp129bfjT` coordinator | cloud | this register, inventory, plan | IN_PROGRESS |
| `session_011vBC1hntPRyoM4yRJKKcG2` | owner's computer | other repository (Agentai OS) — not this repo | n/a here |

~45 older sessions are idle; most end with an owner question (merge, secret, billing).
Those questions are collected in §5, not re-asked per session.

### 3.2 Recent work (last 48 h)

| PR | Goal | Owner of work | State | Prod |
|---|---|---|---|---|
| #2841 | safe reprocess of unsent partner referrals (RED, approved) | `…AygGqFo3` | DONE | migration + code live |
| #2845 | invited person arriving without link is still the addressee | `…16CYcDu` | DONE | live |
| #2846 | invitations-for-me carries partner source (RED, approved for this one) | `…16CYcDu` | DONE | live, `51a3518` |
| #2847 | synthetic invited-worker provision/revoke/purge mechanism | `…16CYcDu` | DONE (code) | workflow `prod-qa-invited-provision` never run → invited-worker E2E **NOT_VERIFIED** (owner: parked, do not ask again) |
| #2848 | public header brand not cut on phones | `…16CYcDu` | DONE | LIVE_VERIFIED 320/360/375 |
| #2843 | never re-mail an address from an older duplicate referral (RED, approved 10-28) | `…AygGqFo3` | DONE | merged `7e64b332`, deployed `c3f440fc`; ledger `20261028044705`; sends finished (D-3) |
| #2849 | public site opens light; one-sentence sign-up intro (11 locales) | `…16CYcDu` | WAITING (CI → merge, owner-authorized) | not yet |
| #2844 | synthetic data instead of personal e-mails in tests/docs | unknown | WAITING (owner: legal wording) | CI green; touches `docs/legal/*` — owner decides |
| #2840 | zero paid AI budget — metered providers off unless owner opens | unknown | WAITING (review) | CI green, mergeable, 9 behind `main`. Risk checked: `AI_PAID_PROVIDERS_ALLOWED` unset on the VPS → default `false` passes the env schema; `AI_GEMINI_ENABLED=false` already, so no production behaviour change. An empty value would fail env validation at boot — never set it to "". |
| #2839 | DB restore procedure doc | unknown | WAITING (review) | CI green, docs-only (runbook), no regression risk |
| #2842 | paid-terms legal draft | unknown | WAITING (legal/owner) | — |
| #2828 | premium action cards visual proposal | unknown | WAITING (owner visual) | — |

### 3.3 Owner-gated (RED, draft, `needs-human-gate`) — 33 open

Kept mergeable by `…16CYcDu` (conflict upkeep only). None may be applied or merged
without an owner approval naming it.
#2816 #2812 #2811 #2809 #2806 #2795 #2752 #2747 #2746 #2739 #2738 #2713 #2707 #2704
#2701 #2693 #2685 #2682 #2647 #2474 #2471 #2463 #2454 #2441 #2440 #2420 #2418 #2410
#2362 #2235 #2227 #2209 #2203.

### 3.4 Stale non-draft PRs (`STALE?`, >7 days no push)

#2642 (owner waiver needed), #2455, #2449, #2447 (draft, owner hold), #2438, #2419,
#2403 (waiver), #2377, #2370, #2356 (dependabot). Owner decides keep/close; nobody
closes them on the coordinator's say-so.

---

## 4. Duplicates, conflicts, drift

| Id | Finding | Risk | Next step |
|---|---|---|---|
| D-1 | Production holds `project_forecasts_v1` (ledger `20261025045152`) and `history_period_precision_and_registry_v1` (`20261025050302`); `main` has neither file; #2738 / #2739 are RED drafts. **Verified 2026-10-28:** the applied SQL equals the PR files exactly once comments and the `begin;`/`commit;` wrapper are removed (normalized md5 `c82d17ef…` and `f4c1f2cd…` on both sides) — CONTENT_ONLY, nothing extra in production. | re-run hazard only if someone applies the files again | **No re-apply, no rollback.** Safe path: owner approves merging #2738 and #2739 *as already applied* (no `apply_migration` step); the merge adds the `APPLIED_LEDGER.md` rows (CONTENT_ONLY) and the guard pins. #2738 also ships app code (forecast cron route, VPS cron entries) — that part is a feature launch the owner approves with it. |
| D-2 | `market_lifecycle_closed_outcome_v1` is applied and its file is on `main`, but #2746's title still says "NOT applied". | misleading status | fix the PR title/body when #2746 is next touched |
| D-3 | #2843 duplicate protection. **Sends finished 2026-10-28 05:45–05:46Z**, before the stricter conditions written in session `…16CYcDu` reached the sending session. Protection used: v2 candidate list (`lower(trim())` address match, already-sent addresses excluded), `reissue_external_referral_v1` row lock (`FOR UPDATE`) + `already_sent` / `has_account` / expiry / consent re-check + resend cap 3, every run under `flock -n` on the VPS, script manual-only (no cron, no timer). Proven in DB: 45 unique addresses sent, ledger 0 duplicate recipients, 0 rows resent twice, the duplicate row never mailed; eligible now 0. | Residual: the DB itself has no address-level lock between `reissue` and `mark` — two concurrent runs outside `flock` could mail one address twice. No send is pending. | Before ANY future reprocess run: keep `flock` as the only entry, or (owner-approved RED) move the address check + an advisory lock on the normalized address into `reissue_external_referral_v1`, with a concurrency test. |
| D-4 | Both active sessions edit the same migration pin/guard files (`APPLIED_LEDGER.md`, `booking-engagement-end-v1.test.ts`, baseline guards). #2846 and #2843 already conflicted. | merge conflicts | §1.6 lane rule |
| D-5 | Two read-only platform audits ran at once (one per active session). The `…AygGqFo3` audit (2026-10-28) covered signed-out journeys + invite/signup code: 3×P1, 7×P2, no fixes yet. | duplicated effort | the session that fixes invite/signup claims it in §3 first; the other audit skips that area |
| D-6 | `company-governance` prod walk never passed (3 runs). Last 40296167812 (10-26): T-2 `invalid_assignee`. Cause verified in prod DB: the trainee slot (`qa.worker+multiw`) is engaged by Alfa but has **0 company memberships**; `assign_training_v1` assigns only active members. Spec defect, not a production defect. | walk red; T-* unproven | GREEN spec fix: trainee = the QA manager (active manager member of Alfa) — branch `fix/cc/governance-walk-trainee`. Owner question: should engaged (non-member) workers be assignable to training? (RED if yes.) |
| D-7 | Two counts of the function matrix: local 275-row matrix (`_agent-workspaces/labourmarketai/matrix/functionality-matrix-2026-10-23.md`, not in git) PASS 194 / FAIL 8 / BLOCKED 39 / NOT_VERIFIED 18 / NOT_IMPLEMENTED 16; public `docs/master/LABOURMARKET-FUNCTIONAL-AUDIT.md` 71/274 LIVE_PROVEN (stale since #2640, 10-21). Matrix rows 4.3/4.16 cite run 39960149411, which concluded failure. | two truths | regenerate the public summary from the matrix (counts and run ids only); re-cite 4.3/4.16 to 40315387466 |

---

## 4a. QA evidence (prod walks, `prod-qa-walk.yml`)

| Claim | Level | Evidence |
|---|---|---|
| Marketplace walk 6/6 | LIVE_VERIFIED | run 40200714397 (10-25, `d9b1a38f5`); earlier 40072913099, 40047419163 |
| Brigade + B2B 13/13 | LIVE_VERIFIED | run 38231306190 (10-12, `e68a59876`); `company-chain` last green 40315387466 (10-26); `brigade-formation` 39985839991 (10-23) |
| 275-function matrix | PASS rows LIVE_VERIFIED; the rest as counted in D-7 | local matrix (D-7); 149 PASS rows cite a prod-qa run id |
| Last walk failures | — | `company-governance` 40296167812 (D-6); weekly rotation 40177765214 (10-25); `billing-test-mode` 39884833436 (10-23); manual `role-routes` 39978076973 (10-23) |
| No run in the last 400 | NOT_VERIFIED | `admin-console`; `invited-worker` (owner: parked) |

Every other walk spec: last run green between 10-23 and 10-28.

## 5. Open owner items (collected once)

- Approve or reject each RED draft individually (§3.3); D-1 first (merge #2738/#2739 as already applied — SQL verified identical).
- D-3 hardening (RED): DB-level address lock in `reissue_external_referral_v1` before any future reprocess run.
- D-6 product question: training for engaged (non-member) workers.
- #2844 legal wording.
- `prod-qa-invited-provision` dispatch — parked by owner 2026-10-28; do not re-ask.
- `GOV-1` read-only DB secret for CI gates; product-truth owner decisions ORG-2,
  EVID-2, MKT-7, COM-6, COM-8 (see `product-truth.mjs`).
- Stale PR keep/close (§3.4).

## 6. How to update

Edit §2/§3 in the same PR as the work. Keep it a snapshot: delete `DONE` rows older
than 14 days (they live on in git history and the tracker). Date the §3 heading.
