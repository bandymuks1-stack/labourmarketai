# COORDINATION REGISTER — who is doing what, right now

The ONE place where parallel sessions (Claude Code on the owner's computer, cloud
sessions, Codex, manual work) see each other's claims, dependencies, migration and
deploy lanes, and hand-offs. It is shared project data, not one chat's memory.

**What this file is NOT** (it points to these, never copies them):

| Truth | Canonical home |
|---|---|
| **Status of every function (LIVE_VERIFIED / PASS_CI_ONLY / FAIL / BLOCKED / NOT_VERIFIED / NOT_IMPLEMENTED / OPTIONAL_TEST)** | [`FUNCTION_REGISTER.md`](FUNCTION_REGISTER.md) — the ONE per-function register; read before every task |
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
0. Read [`FUNCTION_REGISTER.md`](FUNCTION_REGISTER.md): a `LIVE_VERIFIED` function is not re-tested or re-built
   without a concrete regression or a change that can affect it (owner order 2026-10-28).
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
| deploy | — serial via `deploy-vps.yml` — | | production = `0e5f4b3e0` (#2925), deployed 2026-11-02 06:26Z, healthy. Walks: sequential queue, ≥6 min after each deploy (brake e) |


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

## 3. Work register — snapshot 2026-11-02 ~08:50Z

Owner order 2026-11-02 ("vieningas koordinavimas"): `local_8d793dee` stays the ONE coordinator; every
active session and window works from THIS file. No second coordination register, no new overall audit.

### 3.0 Rules for every executor (binding)
1. **One task = one executor.** The row in §3.1 names it. Nobody else starts the same work; a duplicate
   is merged into the row's owner or stopped only after its results are handed over (PR, branch, note).
2. **Before starting any work:** `git fetch origin`, read this §3 on `main`, read
   [`FUNCTION_REGISTER.md`](FUNCTION_REGISTER.md), run `gh pr list --state open` and check the area is not
   already claimed (§1.1). Work outside your row → ask the coordinator first.
3. **Status words stay separate** (owner, binding): `CODE_COMPLETE` (code + CI green) ≠ `MERGED` (on
   `main`) ≠ `DEPLOYED` (a `Deploy to VPS` run contains it) ≠ `LIVE_VERIFIED` (walked in production).
4. Every significant state change goes to the coordinator, who publishes ONE consolidated report
   (live / being fixed / blocked / waiting for the owner) and keeps this file current.
5. Priority: P0 = the real core product working and critical defects; extra features run in parallel.

### 3.1 Active executors

| Session | Owns (single executor) | Open PRs | Depends on | State |
|---|---|---|---|---|
| `local_8d793dee` coordinator | PR integration, CI, Codex, deploy, production verification, both registers; D-4/D-5 mailbox walks | #2903 (RED), #2921, #2914, #2915 | owner: D-4 secrets, RED OK for #2903 | IN_PROGRESS |
| `local_13cb59b3` lane A | the 7 reconciled rows + production proof of partial rows; brigade as a unit (DEM-6) | #2927 (stacked on #2914), #2930 | #2914 | IN_PROGRESS |
| `local_00be3967` mobile | web parity (journal correction, messages, notifications, projects); store-submission preparation | #2929 | owner: store accounts | IN_PROGRESS |
| `local_3951ad81` ChatGPT security | C-3 token audience, X-2 curated toolset, consent wording, data minimisation | #2918 (RED), #2923 (RED), #2924 | owner: D-10, X-2, waiver for #2924 | WAITING (owner) |
| `nonstop-pilot-need-limit` (P0, assigned by coordinator) | paid pilot organization refused `over_open_need_limit`: a member holding the platform admin role resolved to `admin_internal` instead of the organization's plan | #2933 (RED draft) | owner: RED approval | CODE_COMPLETE pending CI |
| `local_14a855e7` growth export | daily aggregate registrations / Living CV export | #2886 (RED) | — | BLOCKED by owner order (no merge, deploy or apply); idle |
| `local_aa901800` "projekto perėmimas" | ESCO cold locales | #2463 (RED) | owner approval | WAITING (owner) — conflict upkeep only, no new work |
| `local_056d9f7f` (Agentai OS coordinator) | other repository; its labourmarketai work (#2886) is assigned through this file | — | — | n/a here |

Older sessions (`…16CYcDu`, `…AygGqFo3`, cloud `…hnVKqGvExp`, `local_07992559`, `local_430c3337`) are idle and
hand-over complete; they start nothing without an assignment here.

### 3.2 In flight and last 24 h (status stages kept apart)

| PR | Goal | Executor | CODE_COMPLETE | MERGED | DEPLOYED | LIVE_VERIFIED |
|---|---|---|---|---|---|---|
| #2917 | brigade offered and matched as a unit | lane A | ✓ | ✓ | ✓ | ✓ walk 41350506578 (19/19) |
| #2913 | six production-applied migrations restored byte-exact (RED, approved) | coordinator | ✓ | ✓ | ✓ (no production change) | ✓ parity gate 41342643253 |
| #2916 | mobile: correct a journal entry | mobile | ✓ | ✓ | n/a (app build) | Android vs production ✓; iOS NOT_VERIFIED (sign-in refused; auth logs show no rate limit — the cause is the credentials the app sent, under investigation by the mobile lane) |
| #2928 | mobile: messages | mobile | ✓ | ✓ | n/a (app build) | NOT_VERIFIED |
| #2919 | failed notification/project reads never answer empty | coordinator | ✓ | ✓ | ✓ | NOT_VERIFIED |
| #2920 | project forecast beside the course, computed on read | lane A | ✓ | ✓ | ✓ | NOT_VERIFIED |
| #2922 | MCP profile.get description; ChatGPT sign-in note | ChatGPT security | ✓ | ✓ | ✓ | NOT_VERIFIED |
| #2925 / #2926 | register-gaps walk; circuit-breaker fix | lane A | ✓ | ✓ | ✓ | walk runs feed #2927 |
| #2914 | full scope 288, parity refresh | coordinator | ✓ (Codex re-review) | — | — | — |
| #2915 | completion map | coordinator | ✓ | — | — | — |
| #2927 / #2930 | register evidence 3.8, 4.6, 6.18, 9.18; G-3 fix | lane A | ✓ | — | — | evidence runs named in the PR |
| #2929 | mobile in-app notifications | mobile | CI running | — | — | — |
| #2903 → #2921 | D-4 reset by real mail → D-5 invited path by real mail | coordinator | ✓ (Codex clean) | — | — | BLOCKED on D-4 secrets |
| #2918 / #2923 / #2924 | C-3, X-2, consent wording | ChatGPT security | ✓ (CI green, Codex clean) | — | — | owner gate |

### 3.3 Owner-gated (RED, draft, `needs-human-gate`) — 39 open (2026-11-02)

Conflict upkeep by the session that opened each (§3.1), otherwise by the coordinator. None may be
applied or merged without an owner approval naming it.
#2923 #2918 #2903 #2886 #2816 #2812 #2811 #2809 #2806 #2795 #2752 #2747 #2746 #2739 #2738
#2713 #2707 #2704 #2701 #2693 #2685 #2682 #2647 #2474 #2471 #2463 #2454 #2441 #2440 #2420
#2418 #2410 #2362 #2235 #2227 #2209 #2203 #2165 #1816.

### 3.3a Owner-approved, QUEUED — not started (do not begin before the start conditions)

| Item | Approved | Priority | State | Start conditions |
|---|---|---|---|---|
| Job-offer intake → public listing → candidate sign-up → Living CV → application → employer review (growth mechanism of the existing platform, not a new product; LabourMarket.ai + Agentai OS data processing + Nonstop Group commercial links) | owner, 2026-11-01 | P1, after current P0 | QUEUED, NOT STARTED — owner: coordinator `local_8d793dee` | (1) current P0 work finished; (2) core user journeys verified in production; (3) no open P0 blocker; (4) this register checked; (5) proven no duplication of existing intake / vacancy store / opportunities / interest / Living CV components |

Binding notes for that item: reuse the existing ingestion and vacancy store; keep source,
link, fetch date and publishing-right status per listing; never invent missing fields;
auto-publish only with a confirmed lawful basis, everything else to a review queue; no
full copying of third-party ads without permission; Agentai OS may process data only —
the ban on automatic replies to company mail stays; core publishing and candidate sign-up
stay free; no revenue projections from unconfirmed placement commissions; first pilot =
50 real offers, staged, browser-verified (desktop + mobile), with measured views,
sign-ups, applications and returning users. No new agent, radar or parallel project.

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
| D-11 | Possible overlaps in the OAuth/MCP area: #2806 (tokens only at the connector door) vs #2918 (C-3 audience binding); #2707 (scopes behind a flag) vs #2923 (curated assistant toolset); #2812 (user-controlled grants) vs #2924 (consent wording). | two competing implementations | owner of the comparison: `local_3951ad81`; it proposes supersede / keep per pair; nothing is closed before its content is handed over |
| D-10 | **Inbound reachability from GitHub runners, 2026-10-28 only** (none in the 80 walk runs before): ≈06:23–06:36Z (deploy SSH connect timeout; walk health no answer), ≈06:59Z (T-3 `ERR_TIMED_OUT`), 07:57Z (walk health no answer). Every event seen from GitHub-hosted runners; the coordinator's browser samples (3 s, incl. across a deploy at 07:16Z) never failed; Supabase edge logs show the VPS app calling the DB at its normal rate throughout. | P1 INFRA (GitHub→VPS path; users not shown affected) | owner: VPS logs (nginx/sshd/firewall, fail2ban) or provider network for those minutes; read-only SSH for the coordinator was requested |

---

## 4a. QA evidence (prod walks, `prod-qa-walk.yml`)

| Claim | Level | Evidence |
|---|---|---|
| Marketplace walk 6/6 | LIVE_VERIFIED | run 40200714397 (10-25, `d9b1a38f5`); earlier 40072913099, 40047419163 |
| Brigade + B2B 13/13 | LIVE_VERIFIED | run 38231306190 (10-12, `e68a59876`); `company-chain` last green 40315387466 (10-26); `brigade-formation` 39985839991 (10-23) |
| 275-function matrix | PASS rows LIVE_VERIFIED; the rest as counted in D-7 | local matrix (D-7); 149 PASS rows cite a prod-qa run id |
**Status classes (owner, 2026-10-28, binding):** `LIVE_VERIFIED` = really checked in production ·
`REGRESSION` = a new defect appeared · `NOT_VERIFIED` = not checked yet · `OPTIONAL_TEST` = an extra test
that does not block launch. A finished, LIVE_VERIFIED item is not re-checked without a new concrete defect,
regression or a change that could affect it.

| Item | Class | Evidence |
|---|---|---|
| Payments — Stripe LIVE chain (checkout → webhook → pilot plan) | **LIVE_VERIFIED** | real 1 € LIVE payment 2026-10-23, webhook fired, Nonstop Group pilot plan active 30 days (owner-confirmed) |
| `billing-test-mode` walk (Stripe TEST scenario) | **OPTIONAL_TEST** | never executed (pilot org not armed in TEST; production stays LIVE, owner 10-28: do not switch, no staging for it). Not a payment defect |
| `invited-worker` walk | OPTIONAL_TEST | owner-parked 2026-10-28; do not re-ask |
| rota-repeat 40659497014 · chat-continuity 40662743591 · documents-approvals 40663181329 (2026-10-28) | LIVE_VERIFIED | after #2855/#2857 deploys |
| jobs-search J-1..J-6 40645813917 | LIVE_VERIFIED | D-8 not reproduced |
| `company-governance` | NOT_VERIFIED (T-5 defect fixed by #2857, deployed) | 40654524480: D-1..D-5, T-1..T-4 PASS, T-5 FAIL → #2857; re-run queued after the walk cool-down |
| `admin-console` 40668817886 | NOT_VERIFIED | owner refusal ✓; worker → `/lt/dashboard/admin` timed out 45 s (cause open: slow refusal vs network) |
| Self-serve sign-up (worker / company / agency) | NOT_VERIFIED | isolated CI walk #2861 (local Supabase) in progress; no production synthetic accounts (owner) |
| Agency roles/permissions | NOT_VERIFIED | no walk covers it |

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

Only items that genuinely need the owner. Resolved or reclassified items are removed (2026-10-28).

- **Hostinger:** send the drafted inbound-loss ticket (D-10; provider network fault = probable, not proven).
- **Executor worktrees:** owner approved up to 3 temporary worktrees over the 20 limit; the guard has no
  override, so the owner creates them (lt-informal-tu, agency-roles-isolated, ux-p1-p2-batch). The
  permanent limit stays.
- **UX P1-3:** public job page `/jobs/[id]` shows title, contract and date only — access policy is the owner's call.
- Remaining RED drafts, each on its own (§3.3); D-1 (#2738/#2739 as already applied) first.
- D-6 product question: training for engaged (non-member) workers (RED #2816).
- #2844 legal wording; #2842 paid terms (legal).
- `GOV-1` read-only DB secret for CI gates; product-truth owner decisions ORG-2, EVID-2, MKT-7, COM-6, COM-8.
- **Open security blocker (2026-11-01):** one CI live gate is not active; owner action pending. Details and the exact step are in the private record.
- **Backups (13.5):** add the scoped `SUPABASE_ACCESS_TOKEN` secret, so that `db-backup.yml` runs its restore proof (#2906).
- **D-4 / D-5:** the QA mailbox is the mailbox's own address (the host refuses plus addresses); owner adds the three `production-qa` secrets. The old synthetic invitation was REVOKED 2026-11-02 (owner-approved, exactly one row); deleting the old synthetic account waits for the owner after the read-only scope check (private record). Then RED #2903 → #2921 → `provision-invited` → walks.
- **Shared VPS (13.1):** remediation #2911 + agentai#1226 live since 2026-11-01; 72 h verdict due 2026-11-04 (details private).

Removed as resolved: #2855 and #2858 (APPLIED, LIVE_VERIFIED 2026-10-28, ledgers 20261028081810 /
20261028091725); D-3 hardening (= #2855); Stripe TEST arming (OPTIONAL_TEST, not a launch blocker);
VPS read-only access (granted, diagnosis done); worktree policy cleanup (done within policy: 75 → ~68).

## 6. How to update

Edit §2/§3 in the same PR as the work. Keep it a snapshot: delete `DONE` rows older
than 14 days (they live on in git history and the tracker). Date the §3 heading.
