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
| coordination (this file) | **session `local_8d793dee` "LabourMarket.ai projekto koordinavimas" — the ONE main coordinator** | 2026-10-28 06:37Z (owner order: single control centre) | keeps §2–§5 current, integrates PRs into `main`, owns deploy follow-up. Earlier holders `…16CYcDu` / `…AygGqFo3` / cloud `…hnVKqGvExp` handed over (§2b) and become executors only on this coordinator's assignment |
| migration (prod DB) | — free — | | last: `referral_send_address_guard_v1` (#2855) applied 2026-10-28 08:18Z, ledger `20261028081810`, by `local_8d793dee` on owner approval of #2855 at `35e749fc3`. Pending RED (needs its own approval): #2858 |
| live sends (e-mail to real people) | reprocess: manual only, under `flock`; **do not run `resolve_reservations` until #2858 is applied** | 2026-10-28 09:00Z | partner intake mails live (each through the address lock since `ae60b244`). Ledger `invitation` since 10-26: 51 mails / 51 recipients, 0 duplicates; 15 rows `pending/not_sent` |
| deploy | — serial via `deploy-vps.yml` — | | production = `ae60b244` (#2855) 08:58Z, healthy. Walks: use a sequential queue that waits ≥6 min after each deploy (brake e) |


### 2a. Handover `…16CYcDu` → `…AygGqFo3` (owner order, 2026-10-28 ~06:30Z)

- **#2843**: merged 05:04Z (`7e64b332`); migration `external_referral_reprocess_candidates_v2` = ledger `20261028044705`; production `/api/health` build `c3f440fc` (06:31Z, contains #2843; #2849 and #2852 not deployed yet).
- **45 vs 48** (production DB, read-only, 06:30Z): `email_send_ledger_v1` kind `invitation` since 10-26 = **48 events, 48 unique recipient hashes, 0 duplicates** (20:11Z 10-27 → 05:46Z 10-28). Partner referral rows `nonstop`: 74 rows / 72 unique addresses; `sent` = 48 rows = 48 unique addresses. Of these, **45 went through `reissue` (`resend_count` = 1)** — the reprocess batch, "45/45" — and **3 are first sends (`resend_count` = 0)**, never reissued. 0 rows resent twice; the 2 addresses with duplicate rows were mailed once each. 48 = 45 reissued + 3 first sends; no address received two mails. Which path sent the 3 first sends is not distinguishable from the DB alone.
- **#2852**: auto-merge (enabled 05:55Z by the owner account) completed — **merged 06:08Z (`b0747e50`)** before the handover order, so it could not be switched off; result left for the coordinator to check.
- **#2738 / #2739**: NOT merged, untouched. #2738 ships the forecast recompute route + VPS cron entries — merging it can **activate the forecast cron** → needs its own owner decision on that effect, separate from the as-applied ledger fix (D-1).
- **D-3**: see the D-3 row: the remaining gap is no address-level DB lock between `reissue` and mark-sent, plus the repo script missing `flock`. Proposed fix (RED, owner approval by name): advisory lock on `lower(trim(email))` inside `reissue_external_referral_v1`, an in-flight refusal, a same-address-sent refusal, `flock` in the repo script, and a two-session concurrency test.
- **Governance walk (D-6)**: spec defect — trainee slot has 0 company memberships; `assign_training_v1` assigns active members only. Fix shipped in #2852 (trainee = Alfa member); no walk run since its merge. Owner product question = RED #2816.
- **`…16CYcDu` stopped**: regression queue halted after search-support-privacy (rota-repeat run had already started on Actions); D-8 jobs-search re-run NOT started. #2840 / #2839 not merged (left to coordinator). No new PRs, migrations or sends started.

### 2b. Single control centre (owner order, 2026-10-28 06:37Z)

- Session `local_8d793dee` "LabourMarket.ai projekto koordinavimas" (owner's computer, worktree
  `labourmarket-project-coordination-6df501`) is the **only** main coordinator: PR integration into
  `main`, deploy follow-up, executor assignment, this register. No competing coordination process.
- Previous coordinators: "LabourMarket.ai darbų perimimas" (`…AygGqFo3`, idle), "LabourMarket.ai
  projekto perėmimas" (`…16CYcDu`), cloud coordinator (`…hnVKqGvExp`, handed over). Their results are
  taken over here (§2a, #2851 content merged into this file); they start no new work without an
  assignment from this coordinator. Cloud sessions cannot be messaged from here → coordination with
  them goes through GitHub and this file.
- Status vocabulary (owner, binding): `CODE_COMPLETE` ≠ `MERGED` ≠ `DEPLOYED` ≠ `LIVE_VERIFIED`.
  A green synthetic walk is not a real-user journey confirmation.

---

## 3. Work register — snapshot 2026-10-28 ~06:45Z

Sources: GitHub PRs/Actions, production migration ledger, session list and
transcripts readable from the coordinator session. Status per §1.4.

### 3.1 Active executors

| Session | Where | Doing | State |
|---|---|---|---|
| `session_016CYcDuhGGEA75ruJ3zXD99` "projekto perėmimas" | owner's computer | was: platform functional + UX audit, regression queue (stopped at handover §2a) | HANDED OVER — executor on assignment only |
| `session_011vBC1iAygGqFo3aoB76NrV` "darbų perimimas" | owner's computer | was: #2843 sends (done), D-1 proof, #2839/#2840 review | HANDED OVER — idle |
| `session_011vBC1hnVKqGvExp129bfjT` coordinator | cloud | was: this register, D-1/D-3 evidence, QA-evidence recovery (#2851, folded in here) | HANDED OVER |
| `local_8d793dee` "projekto koordinavimas" | owner's computer | **main coordinator** (§2b): PR integration, deploy, P1 fixes, executor assignment | IN_PROGRESS |
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
| #2849 | public site opens light; one-sentence sign-up intro (11 locales); theme follows in-app navigation | `…16CYcDu` | merged `5c8e61b3` | NOT DEPLOYED: production `c3f440fc` at 06:31Z → visual check after deploy |
| #2844 | synthetic data instead of personal e-mails in tests/docs | unknown | WAITING (owner: legal wording) | CI green; touches `docs/legal/*` — owner decides |
| #2840 | zero paid AI budget — metered providers off unless owner opens | coordinator `local_8d793dee` | MERGED `99b7db82` 2026-10-28 07:12Z | updated with `main`, CI green on the fresh base; no production behaviour change (paid providers already off) — DEPLOYED with the next deploy after `83af6a82` |
| #2839 | DB restore procedure doc | coordinator `local_8d793dee` | MERGED `c8e08bf5` 06:54Z, DEPLOYED | docs only |
| #2853 | coordination register: single main coordinator, #2851 folded in | coordinator | MERGED `83af6a82`, DEPLOYED 07:16Z | #2851 CLOSED as duplicate |
| #2854 | invite/signup UX (audit P1-1, P1-2, P2-3, P2-4) | coordinator | MERGED `f5c0e88f`, DEPLOYED | signup skeleton LIVE_VERIFIED (SSR); closed-invite + existing-address branches NOT_VERIFIED live (need a closed token) |
| #2855 | D-3 address-level send guard: advisory lock, reservation, intake reserve, v3 candidates, recovery, fail-closed ledger, `flock` | coordinator | **APPLIED** 08:18Z (ledger `20261028081810`) · **VERIFIED** · **MERGED** `ae60b244` 08:40Z · **DEPLOYED** 08:58Z | evidence below (D-3) |
| #2857 | training register shows only the active workspace's courses (governance T-5) | coordinator | MERGED, deploy pending | proof = company-governance re-run (queued) |
| #2858 | recovery counts only THIS reservation's ledger row (Codex P2 on #2855) | coordinator | **RED draft, NOT applied** | latent: 0 reservations; needs owner approval naming #2858 |
| #2859 | missing job → board link; invite resend reaches the invited address (audit P2-2, P2-7) | coordinator | auto-merge on CI | — |
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
| D-1 | Production holds `project_forecasts_v1` (ledger `20261025045152`) and `history_period_precision_and_registry_v1` (`20261025050302`); `main` has neither file; #2738 / #2739 are RED drafts. **Verified 2026-10-28:** the applied SQL equals the PR files exactly once comments and the `begin;`/`commit;` wrapper are removed (normalized md5 `c82d17ef…` and `f4c1f2cd…` on both sides) — CONTENT_ONLY, nothing extra in production. Independently confirmed by the cloud coordinator with a stricter normalization (all whitespace removed): `1db83314…` / `214d501f…`; branch files last changed before the apply (03:37Z / 03:48Z vs 04:51Z / 05:03Z, 2026-10-25). | re-run hazard only if someone applies the files again | **No re-apply, no rollback.** Safe path: owner approves merging #2738 and #2739 *as already applied* (no `apply_migration` step); the merge adds the `APPLIED_LEDGER.md` rows (CONTENT_ONLY) and the guard pins. #2738 also ships app code (forecast cron route, VPS cron entries) — that part is a feature launch the owner approves with it. |
| D-2 | `market_lifecycle_closed_outcome_v1` is applied and its file is on `main`, but #2746's title still says "NOT applied". | misleading status | fix the PR title/body when #2746 is next touched |
| D-3 | **CLOSED by #2855 (2026-10-28).** Pre-check 08:17Z: not applied, function bodies = repo (`c6e48da2`/`041f7a45`), 50 sent / 50 addresses, sent fp `cb5aa823…`, all-partner fp `3ee82a30…`, ledger 50/50. Applied once 08:18Z. Post-check: 6 functions body-md5 = repo, all SECURITY DEFINER `public, pg_temp`, anon/authenticated/public cannot execute; both fingerprints unchanged; 0 reservations. Safe production calls (no write, no mail): reserve/reissue on a sent row → `already_sent`; reserve on a real duplicate row of a mailed address → `address_already_sent`; resolve → `not_reserved` / `invalid_ledger_hash`; v3 = v2 = 15 rows. PG16 throwaway cluster: 12-way race ×6 → 1 ok / 11 refused; two-session wait; crash, provider failure, recovery R1–R8, rollback refusal + exact restore. After deploy 08:58Z: old 50 rows fp unchanged; +1 intake mail 08:45Z to a new address. | residual: #2858 (latent) | — |
| D-4 | Both active sessions edit the same migration pin/guard files (`APPLIED_LEDGER.md`, `booking-engagement-end-v1.test.ts`, baseline guards). #2846 and #2843 already conflicted. | merge conflicts | §1.6 lane rule |
| D-5 | Two read-only platform audits ran at once (one per active session). The `…AygGqFo3` audit (2026-10-28) covered signed-out journeys + invite/signup code: 3×P1, 7×P2, no fixes yet. | duplicated effort | the session that fixes invite/signup claims it in §3 first; the other audit skips that area |
| D-6 | `company-governance`: T-2 fixed (#2852). Run 40654524480 (08:09Z): D-1..D-5, T-1..T-4 PASS; **T-5 FAIL = real defect**: a manager of Alfa+Gama working in Gama saw Alfa's course (RLS correct; workspace scoping missing, decision 0024) → #2857. T-6 skipped. | walk red until #2857 deployed | re-run in the walk queue |
| D-7 | Two counts of the function matrix: local 275-row matrix (`_agent-workspaces/labourmarketai/matrix/functionality-matrix-2026-10-23.md`, not in git) PASS 194 / FAIL 8 / BLOCKED 39 / NOT_VERIFIED 18 / NOT_IMPLEMENTED 16; public `docs/master/LABOURMARKET-FUNCTIONAL-AUDIT.md` 71/274 LIVE_PROVEN (stale since #2640, 10-21). Matrix rows 4.3/4.16 cite run 39960149411, which concluded failure. | two truths | regenerate the public summary from the matrix (counts and run ids only); re-cite 4.3/4.16 to 40315387466 |
| D-8 | `jobs-search` 40640097643 (05:48Z) J-6 "save job" failed. **Re-run 40645813917 (06:47Z, `b0747e50`): 6/6 PASS incl. J-6** (save, find in saved view, remove). | intermittent, not reproduced — cause NOT_VERIFIED | LIVE_VERIFIED 06:47Z; if J-6 fails again, trace button → `saveVacancyAction` → `savePublicVacancy` |
| D-9 | Inactive locales da/et/lv/no/sv: 5 817 of 15 191 keys, 22–44 % `[EN]` placeholders. Active six (lt/en/ru/nl/de/pl) complete, 0 placeholders, no untranslated prose (catalog audit 2026-10-28). | blocks only those five markets (they redirect to /en) | coordinator: translation pipeline without paid APIs (owner order 2026-10-28), with placeholder/ICU/length QC — not started |
| D-10 | **Inbound reachability from GitHub runners, 2026-10-28 only** (none in the 80 walk runs before): ≈06:23–06:36Z (deploy SSH connect timeout; walk health no answer), ≈06:59Z (T-3 `ERR_TIMED_OUT`), 07:57Z (walk health no answer). Every event seen from GitHub-hosted runners; the coordinator's browser samples (3 s, incl. across a deploy at 07:16Z) never failed; Supabase edge logs show the VPS app calling the DB at its normal rate throughout. | P1 INFRA (GitHub→VPS path; users not shown affected) | owner: VPS logs (nginx/sshd/firewall, fail2ban) or provider network for those minutes; read-only SSH for the coordinator was requested |

---

## 4a. QA evidence (prod walks, `prod-qa-walk.yml`)

| Claim | Level | Evidence |
|---|---|---|
| Marketplace walk 6/6 | LIVE_VERIFIED | run 40200714397 (10-25, `d9b1a38f5`); earlier 40072913099, 40047419163 |
| Brigade + B2B 13/13 | LIVE_VERIFIED | run 38231306190 (10-12, `e68a59876`); `company-chain` last green 40315387466 (10-26); `brigade-formation` 39985839991 (10-23) |
| 275-function matrix | PASS rows LIVE_VERIFIED; the rest as counted in D-7 | local matrix (D-7); 149 PASS rows cite a prod-qa run id |
| Last walk failures | — | `company-governance` 40296167812 (D-6); weekly rotation 40177765214 (10-25); `billing-test-mode` 39884833436 (10-23); manual `role-routes` 39978076973 (10-23) |
| No run in the last 400 | NOT_VERIFIED | `admin-console`; `invited-worker` (owner: parked) |

| Regression queue 2026-10-28 (`…16CYcDu`) | LIVE_VERIFIED / PARTIAL | living-cv-growth 40634954858 ✓, calendar-planning 40635527214 ✓, notifications-inapp 40639605465 ✓, jobs-search 40640097643 (J-6 ✗, D-8); project-execution 40640668466 ✓, search-support-privacy 40641351546 ✓; rota-repeat started (result not collected); chat-continuity, documents-approvals not run (queue stopped at handover) |

Every other walk spec: last run green between 10-23 and 10-28.

## 4a. QA evidence (recovered 2026-10-28 by the cloud coordinator, #2851; counts and pointers only)

The 275-function matrix rows are **private** (owner decision, issue #2659 report 11). They live in
`_agent-workspaces/labourmarketai/matrix/results-A.tsv … results-F.tsv` (+ `set_result.py`,
`build_matrix.py`) on the owner's computer. This file records only the public summary and run ids.

| Evidence | Source | Level |
|---|---|---|
| **275-function matrix, 2026-10-28 04:37Z:** PASS 194 · FAIL 8 · BLOCKED 39 · NOT_VERIFIED 18 · NOT_IMPLEMENTED 16 | session `…16CYcDu` report | private rows; summary only |
| per direction (PASS/FAIL/BLOCKED/NOT_VERIFIED/NOT_IMPLEMENTED) — A 42/0/6/2/0 · B 29/1/2/2/2 · C 46/0/3/3/0 · D 30/1/12/2/6 · E 40/4/9/3/1 · F 7/2/7/6/7 | `build_matrix.py` output | sums to the totals |
| last changes: 1.12 referral network BLOCKED→PASS; 1.13 transactional e-mail BLOCKED→PASS; 5.7 notification e-mail BLOCKED→NOT_VERIFIED; 8.5 nine markets stays BLOCKED; 1.4 invited worker NOT_VERIFIED | same | |
| Marketplace production walk 6/6 PASS | run 40200714397, 2026-10-25, `d9b1a38` | LIVE_VERIFIED (synthetic) |
| Company-chain production walk 13/13 PASS | run 40203656710, 2026-10-25, `fb77433` | LIVE_VERIFIED (synthetic) |
| 5 open QA-SYNTHETIC needs left by walks that do not close their own needs: 3 × `agency-chain`, 1 × `brigade-formation`, 1 × failed `orders-bookings` run 40200190351 | session `…F5h3jc1d`, 2026-10-25 | cleanup fix NOT started — free |
| Marketplace lifecycle not walked in production: edit, resume, withdraw, permanent delete | same | NOT_VERIFIED |

Rule: each change of a row's status from a merged PR or a production walk is reported here as a
one-line delta (row id, old → new, evidence id). Missing intermediate matrix versions (10-23 → 10-28)
are NOT evidence that functions failed.

## 5. Open owner items (collected once)

- **#2858 (RED):** approve by name → apply; until then `resolve_reservations` is not run.
- **D-10:** VPS inbound reachability (provider/network) — owner check, or read-only SSH for the coordinator.
- **UX P1-3:** public job page `/jobs/[id]` shows title, contract and date only (no country, employer, description, apply path) — access policy is the owner's call.
- **Worktrees:** 75 registered vs the 20 limit (`workspace-guard.ps1`) → no parallel executor worktrees can be created; approve a policy cleanup of merged/closed-PR worktrees (4-point check, `git worktree remove` without `--force`).

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
