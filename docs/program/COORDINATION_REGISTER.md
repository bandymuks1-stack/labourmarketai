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

## 3. Work register — snapshot 2026-11-02 ~13:10Z

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
| `local_8d793dee` coordinator | PR integration, CI, Codex, deploy, production verification, both registers; dispatches every production-qa walk; owner-decision journeys J-12, J-14, J-17 | #2914, #2915, #2935 | — | IN_PROGRESS |
| `local_816618a9` j15-alert-mail | **J-15** alert / e-mail without signing in (4.9, 5.7, 5.9): production walk through the real QA mailbox, reusing the #2883 isolated proof | — | coordinator dispatches the walk after merge | IN_PROGRESS |
| `local_b55e3e39` j2-evid2-red | **J-2** journal → manager confirms: the EVID-2 integrity item (2.20) prepared as a RED draft | — | owner: EVID-2 | IN_PROGRESS |
| `local_1a4a2a4f` j13-buyer-provider | **J-13** buyer → provider: non-customer becomes a customer in production (6.4) + RED-1 request → offer/contract draft | — | owner: RED-1 | IN_PROGRESS |
| `local_13cb59b3` lane A | the 7 reconciled rows + production proof of partial rows; brigade as a unit (DEM-6) | #2927 (stacked on #2914), #2930 | #2914 | IN_PROGRESS |
| `local_00be3967` mobile | web parity (journal correction, messages, notifications, projects); Android and iOS runs kept apart, device runs from `main` only (iOS correction re-run on `main` assigned 2026-11-02); store-submission preparation | #2929 | owner: store accounts (J-17); RED #2937 for project detail | IN_PROGRESS |
| `local_3951ad81` ChatGPT security | C-3 token audience, X-2 curated toolset, consent wording, data minimisation | #2918 (RED), #2923 (RED), #2924 | owner: D-10, X-2, waiver for #2924 | WAITING (owner) |
| `local_50daa866` nonstop-pilot-limit | #2933 LIVE_VERIFIED; worker role from the own worker profile in chat/MCP dispatch | #2937 (RED) | owner: RED approval | WAITING (owner) |
| `local_14a855e7` growth export | daily aggregate registrations / Living CV export | #2886 (RED) | — | BLOCKED by owner order (no merge, deploy or apply); idle |
| `local_aa901800` "projekto perėmimas" | ESCO cold locales | #2463 (RED) | owner approval | WAITING (owner) — conflict upkeep only, no new work |
| `local_056d9f7f` (Agentai OS coordinator) | other repository; its labourmarketai work (#2886) is assigned through this file. **INFRA P0 handed over 2026-11-02 18:40Z:** host OOM evidence (12:06 and 15:01 UTC kills in `agentai-scheduler`, no memory limit) — required: a hard memory limit + the cause of the growing scheduled job fixed (owner: a bigger server alone is not enough) | — | Agentai OS reply: job, PR, deploy time | WAITING (Agentai OS) |

Older sessions (`…16CYcDu`, `…AygGqFo3`, cloud `…hnVKqGvExp`, `local_07992559`, `local_430c3337`) are idle and
hand-over complete; they start nothing without an assignment here.

### 3.1a The six open user journeys (owner order 2026-11-02 "19/19") — one executor each

15 / 19 complete (J-2 and J-13 proven 2026-11-02). NOT_VERIFIED is never counted as FAIL without evidence.

| Journey | State | Works in production | Missing / blocker | Kind of work | Executor | Shortest path to LIVE_VERIFIED |
|---|---|---|---|---|---|---|
| J-2 journal → manager confirms | **complete** — journal-confirm 41478434884 (4/4); was unverified | record → send → manager confirms / returns → Living CV (journal-confirm 41281666555, 3/3) | EVID-2 RESOLVED by owner decision 0028 (2026-11-02): self-declaration is lawful and never a block; the lane checks the data model against each 0028 rule and proposes only the minimal change for a rule not met | test (#2942) + only-if-needed minimal change | `local_b55e3e39` | rule check → journal-confirm walk proving self-declaration, separation and independent confirmation |
| J-12 institution → qualification | partial (11.2, 11.7 NOT_VERIFIED; 11.10 NOT_IMPLEMENTED) | institution, learner link, compass, practice, outcomes, reporting (11.1, 11.3–11.6) | **ARCH-3 decided by the owner 2026-11-02:** a learner may ASK to join a cohort; the institution's authorised person accepts membership and confirms practice and work done; the learner may keep their own history without confirmation, labelled self-declared (decision 0028). **D-15 decided:** recording work experience stays existing functionality; formal recognition of prior learning (RPL) is a separate later stage, an assessor's procedure, never an automatic qualification. Practice against a formal requirement (SKL-9) stays open **Built 2026-11-02:** RED draft #2959 (learner join request + institution accept, migration 20261102160000, NOT applied; scratch-PG proof 43/43; walk spec `cohort-join-request` included, dispatch only). GREEN #2960 records J-12 and the D-15 RPL design in decision 0028 | owner approval + apply of #2959 (RED); RPL: owner names the first assessor and requirement set | `local_b55e3e39` (assigned 2026-11-02) | apply #2959 → dispatch `prod-qa-walk.yml -f spec=cohort-join-request` (pass = 5/5) |
| J-13 buyer → provider | **complete** — buyer-workspace 41480104268 (9/9); RED-1 #2946 is the next extension; was partial | buyer workspace record + draft request (buyer-workspace 40377604733); service request loop (marketplace 41284728549) | non-customer → customer path never walked in production; accepted request does not become an offer/contract (RED-1) | test + small UX + RED draft | `local_1a4a2a4f` | extended buyer-workspace walk; RED-1 owner decision |
| J-14 organization buys a plan | blocked | plan catalogue (7.1); paid pilot (7.5 pilot only) | **7.28 missing in the live terms (2026-11-02 read):** price VAT basis, billing period, automatic renewal, how to cancel and when, refund rules, B2C 14-day withdrawal + waiver for an immediately started service (checkout checkbox + e-mailed confirmation do not exist yet), complaint handling, consumer authority (VVTAT), liability limitation, notice of term/price changes, chargebacks. Present: seller identity, governing law. Draft #2842 covers most but not liability or change notice, and has placeholders. **Stripe Tax #2685**: RED draft (migration-safety on a GRANT), switch `BILLING_STRIPE_TAX_ENABLED` off; needs owner Stripe-dashboard acts (live VAT registration, seller tax id, tax behaviour on the price, webhook events), migration apply, switch last; companion #2701 (drop the unproven VAT promise). **MKT-7** = gate G-7 pricing readiness (done 2026-09-05) + gate G-8 live-activation env (recorded as set); charging is limited by the pilot organisation list. No new payments are activated without a separate owner approval | owner + legal | coordinator (owner decisions) | terms text (legal) → #2701 + #2685 → billing walk |
| J-15 alert / e-mail without signing in | partial — **instant job alerts + alert e-mail LIVE_VERIFIED** (4.9, 5.7: alert-mail 41488266687, 9/9); **weekly digest e-mail (5.9) is a separate mandatory check, PASS_CI_ONLY** | alerts, alert e-mail, saved search, in-app digest; the Monday 07:00 UTC digest run itself ran 2026-11-02 (13 in-app digests) | digest e-mail never sent because nobody in production has turned on digest e-mail (consent-first, default off) — not a defect; an e-mail proof needs a consenting synthetic account that logged work and did not visit before the Monday run | test (two-part walk: setup this week, check Mon 2026-11-09 after 07:05 UTC) + owner approval for the QA account — **setup DONE 2026-11-03**: provision 41584448612 success; digest-setup 41584540254 walk 6/6 passed (consent stored, one journal entry, signed out, account kept; read-only DB check: synthetic, active, consent on, entry today, 0 live sessions). The run shows red only because its session-revoke clean-up counts the session the walk had already signed out (403) as not revoked | `local_816618a9` | Monday 2026-11-09 07:00 UTC run → digest-check (CI schedule 07:20 UTC; nobody signs in to the account before it) |
| J-17 install from a store | blocked | Android and iOS apps run against production (8.17, 8.18) | owner accounts: Google Play (US$25 one-time; a personal account needs a 12-tester / 14-day closed test, an organisation account needs a free D-U-N-S number), Apple Developer (US$99/year; organisation needs D-U-N-S + legal entity), Expo EAS (free plan is enough to build and submit once; no Mac needed). Minimum first year US$124. Repo already has bundle ids, EAS profiles, privacy labels, listing texts (pack 2026-10-14, being refreshed for messages / notifications / projects); missing: `eas init`, submit profile, signing keys, review account, real screenshots, owner approval of icon and listing. Nothing is published without permission | owner accounts; mobile QA continues (#2940 auto-merge, #2941 Codex P2 fix) | `local_00be3967` | owner store accounts → closed-test listing → install walk |

### 3.2 In flight and last 24 h (status stages kept apart)

| PR | Goal | Executor | CODE_COMPLETE | MERGED | DEPLOYED | LIVE_VERIFIED |
|---|---|---|---|---|---|---|
| #2917 | brigade offered and matched as a unit | lane A | ✓ | ✓ | ✓ | ✓ walk 41350506578 (19/19) |
| #2933 | an organization's plan applies to a platform admin acting in it (RED, owner-approved) | nonstop-pilot-need-limit | ✓ | ✓ `233b2e7c8` | ✓ | ✓ 2026-11-02 — MCP create + Chrome as the affected member (details private) |
| #2913 | six production-applied migrations restored byte-exact (RED, approved) | coordinator | ✓ | ✓ | ✓ (no production change) | ✓ parity gate 41342643253 |
| #2916 | mobile: correct a journal entry | mobile | ✓ | ✓ | n/a (app build) | Android vs production ✓; ✓ from `main` @bdb27bb88: Android 41451882387, iOS 41451829006 (attempt 2 of 2; attempt 1 lost the simulator screen after sign-in, not a product defect) — correction draft → confirm passed on both |
| #2928 | mobile: messages | mobile | ✓ | ✓ | n/a (app build) | ✓ list, conversation opened, reply draft previewed (not sent) — Android 41451882387, iOS 41451829006 from `main` |
| #2919 | failed notification/project reads never answer empty | coordinator | ✓ | ✓ | ✓ | NOT_VERIFIED |
| #2920 | project forecast beside the course, computed on read | lane A | ✓ | ✓ | ✓ | NOT_VERIFIED |
| #2922 | MCP profile.get description; ChatGPT sign-in note | ChatGPT security | ✓ | ✓ | ✓ | NOT_VERIFIED |
| #2925 / #2926 | register-gaps walk; circuit-breaker fix | lane A | ✓ | ✓ | ✓ | walk runs feed #2927 |
| #2914 | full scope 288, parity refresh | coordinator | ✓ (Codex re-review) | — | — | — |
| #2915 | completion map | coordinator | ✓ | — | — | — |
| #2927 / #2930 | register evidence 3.8, 4.6, 6.18, 9.18; G-3 fix | lane A | ✓ | — | — | evidence runs named in the PR |
| #2929 | mobile in-app notifications | mobile | ✓ | ✓ `bdb27bb88` | n/a (app build) | list ✓ on both platforms (same runs); mark-all-read not exercised (nothing unread) |
| #2940 / #2941 | mobile: driver address read-back; projects list + detail | mobile | Codex requested | — | — | project detail BLOCKED until RED #2937 |
| #2903 → #2921 | D-4 reset by real mail → D-5 invited path by real mail | coordinator | ✓ | ✓ `3543c13bc` / `c2580a328` | ✓ (test code) | ✓ mail-reset 41428606490 (2/2), invited-worker 41430482903 (7/7) |
| #2918 / #2923 / #2924 | C-3, X-2, consent wording | ChatGPT security | ✓ (CI green, Codex clean) | — | — | owner gate |

### 3.3 Open-PR audit (owner order 2026-11-02 "visų atvirų PR patikrų ir blokavimų auditas")

77 PRs open at the audit (79 found; #2935, #1421 closed as superseded, evidence kept on the PRs).
A failing `Vercel` status is stale (Vercel was removed) and blocks nothing. RED / `needs-human-gate`
PRs are never merged or applied without an owner approval naming them.

**Technical — fixed in the current flow by an existing executor**

| PR | Blocker | Executor | Action | Owner OK |
|---|---|---|---|---|
| #2959 | `quality`: 4 migration guards (new migration file vs baselines / ordering) | `local_b55e3e39` | guard baselines + timestamp order; stays RED draft | yes (apply) |
| #2941 | CI running after 3 Codex P2 fixes | `local_00be3967` | auto-merge once Codex is clean | no |
| #2961, #2962 | CI running | mobile / J-12 executors | auto-merge on | no |
| #2844 | was behind main (all checks green 10-27) | coordinator | branch updated, auto-merge on | no |
| #2154, #2455 | behind main | coordinator | branch updated, auto-merge | no |
| #2738, #2739, #2410 | conflicts; their migrations are already on main via #2913 | `local_13cb59b3` | rebase without the migration, land the app code; GREEN only if nothing RED remains | no if GREEN |
| #2454 | `signup-isolated` fails | `local_3951ad81` | fix the walk; stays RED (edits a prod-qa workflow) | yes |
| #2682 | conflicts (pilot pass name / term / amount display) | coordinator | rebase; billing = RED class | yes |
| #1617 + #1619 | CodeQL `Analyze` fails because init and analyze must move together | — | merge as a pair after rebase (low priority) | no |
| #1620, #1622–#1625, #2356 | Dependabot bumps behind main, not on main | — | regroup / rebase in one dependency batch after P0 | no |

**Owner decisions (RED / waiver / strategy)** — by product value: #2693 (read grant so vacancy retention
can run), #2747 (free workers discoverable by default), #2474 (free plan 3 profiles + VIP), billing chain
#2441 → #2647 → #2685 (+ #2701 copy) → #2704, #2209 (country filter), #2746 → #2713 (listing lifecycle,
goods purchases), #2471 (external profile links consent v3), #2707 (MCP scopes + gate waiver), #2362 (165
dates), DB batch #2420 / #2418 / #2440 / #1045, J-12 #2959, RED-1 #2946, #2937 (worker role in chat/MCP),
C-3 #2918 → X-2 #2923, #2924 / #2642 / #2403 (product-gate waivers), #2886 (owner hold), #2463 (ESCO cold
locales), #2235, #2227, #2203, #2165, #1816, #2816, #2812, #2811, #2809, #2806, #2795, #2752 (legal),
#2842 (paid terms draft, legal).

### 3.4 Stale / superseded — owner decides keep or close (nobody closes them on the coordinator's say-so)

**Closed 2026-11-02 under the owner's conditional approval** (branches, migrations and history kept; each PR
carries a closing comment). Unique, not-yet-built requirements are carried here with their origin PR:

| Closed PR | Why | Carried requirement (origin) |
|---|---|---|
| #1225 landing FOCUS | already on main: #1231 (FOCUS = restored previous landing) and #1232 (FOCUS default) | none |
| #2438 master audit 2026-10-16 | its owner decisions N-1…N-13 are resolved or tracked elsewhere (#2439, #2442, #2433, #2432 merged; #2444 superseded by #2451; #2440, #2441 open in §3.3) | **reference only, never merged:** growth strategy F-1 (shareable, consent-based confirmed work record), F-2 (company side as weekly operations + crew-lead invite loop), F-3 (finish the money path first), cold-start per participant group, ten country plans, KPI definitions, 30/60/90 roadmap, PRODUCT_MASTER_SPEC (SUPPORTING) — on branch `docs/cc/master-audit-2026-10-16` (origin #2438); reuse when growth work starts (§3.3a) |
| #740 voice_journal_jobs migration | voice is deferred (no transcription host; COM-6, V-2) | when voice reopens: one owner-scoped job table, disclosure acknowledged before recording, transcript ≤ 60k, audio retention ≤ 30 days, one job → at most one journal entry, worker/admin read only, RPC-only writes, right-to-erase RPC — design on branch `feat/voice-journal-jobs-migration-v1` (origin #740) |
| #2915 completion map 2026-11-01 | the 288 statuses live only in FUNCTION_REGISTER (one register) | planning columns not in the register: effort per function, critical path, about 185–295 agent days, conditional targets (core mid-December 2026, full scope February 2027, preliminary) — on branch `docs/cc/completion-map-288` (origin #2915) |

**Database backup — OPERATIONAL 2026-11-03** (owner approval the same day: one read-only backup role through the existing authorised access; no new API key). Read-only backup role created (read all incl. RLS-protected data, no write/admin), its connection string stored in the existing `SUPABASE_BACKUP_DB_URL` slot without ever being shown. `db-backup.yml`: drill run 41636950462 and full run 41637888590 both SUCCESS — dump, restore into a throw-away PostgreSQL with every key table matching the source exactly, encryption, copy on the VPS; an encrypted copy also kept off the VPS (checksums identical). Nightly 03:30 UTC from now on. Details and the credential inventory are in the private record.

**Database backup completeness — PASS 2026-11-03** (owner P0 the same day: explain the 284 tables that can be read versus the 253 restored; check every schema a restore needs, the permissions, and the restore procedure). PR #3005. Findings:
- **284 versus 253:** 284 is the base tables in the public, accounts and file-storage schemas. The former drill's 253 counted views too: 249 product tables plus 4 views.
- **The real gap:** the drill's 195 restore errors hid missing access policies and one constraint. The drill now creates the platform roles and extensions first, and only the one harmless error remains.

Backup scope now:
- the product data;
- accounts;
- file-storage metadata;
- the migration ledger;
- the stored FILES and the scheduled-job definitions, as a second encrypted bundle beside the dump (14-day rotation).

Left out on purpose, with reasons in the runbook (§9.1.0): the platform's secrets store and its realtime runtime.

Proof:
- **Drill from main,** run 41664420591: every schema object type matches the source exactly; every table's row count is inside its source window; every file came back byte for byte; every scheduled job was exported.
- **Full run,** run 41665452921: both encrypted files reached the VPS and decrypt correctly. A copy is also kept off the VPS, with identical checksums.
- **Receiver:** the VPS receiver from main was installed once, with the owner's approval; the old copy is kept.

The restore procedure is documented end to end in the runbook (§9.1.1).

**Open:** the first SCHEDULED full-scope nightly, 2026-11-04 03:30 UTC. Check it after it runs and add its run id here.

**Owner decisions 2026-11-03 (public launch)**

| Item | Decision | Executor | Done when |
|---|---|---|---|
| Country + city on public job ads for signed-out visitors | APPROVED in principle, when known and lawfully public; title and employer stay withheld | `local_1a4a2a4f` | RED draft (migration, access check, privacy assessment, rollback) → separate owner approval → apply → walk |
| Waiver `public-acquisition-route-jobs` | "I approve adding ONLY PR 2991 and PR 2984 to the existing public-acquisition-route-jobs waiver pullRequests list." — nothing else changes | `local_f7fa8877` (#2991), `local_1a4a2a4f` (#2984) | both merged with only those two numbers added in both pins |
| GoogleOther + Applebot-Extended | prepare allowing them, with a Cloudflare rate limit; assess robots.txt, content use, SEO/GEO; general security restrictions stay | `local_1a4a2a4f` (plan), owner (Cloudflare) | plan delivered; owner applies |
| #2828, #2370 | judge against direction A: #2828 drop tilt + 5 locales; #2370 resolve conflicts; visual comparison before merge | `local_f7fa8877` | comparison shown → owner visual approval |
| #2989 | sign-up button visible at 360×740 as well; real sign-up check in Chrome | `local_f7fa8877` | measured + Chrome check after deploy |
| #2988 | all four privacy-review fixes; refusal removes the campaign from the account and from new events; merge only after an independent re-check + CI PASS | `local_13cb59b3`, coordinator re-check | re-check pass → merge → production check |
| J-12 | baseline learning-group journey COMPLETE (11.7 recognition-chain 41617507405); 11.10 RPL stays the later D-15 stage | — | done (#2990) |

**Owner decisions 2026-11-03 (later the same day)**

| Area | Decision | Conditions | Executor | Next |
|---|---|---|---|---|
| Design | Direction **A "Ramus darbo stalas"** is the platform direction; B = optional dark theme; from C only subtle mobile elements | keep the logo and brand identity; P0 mobile sign-up, role-based primary navigation, job cards with place / employer / pay when known; P1 unify cards, typography, forms, journal, Living CV, HR, projects; P2 dark theme and effects; current-vs-proposed comparison before any system change; small PRs, each checked in Chrome and on mobile; no second UI system; Radix only per component; evaluate axe-core | `local_f7fa8877` (UX/UI, proposal #2982) | P0 PRs |
| Campaign analytics | Consent management approved IF non-essential cookies are used | first check whether attribution can be kept lawfully without non-essential storage; if consent is needed: a clear accept / refuse choice, no non-essential storage before consent; fix UTM through Google sign-in and conversion measurement; #2886 stays blocked | `local_13cb59b3` | legal/technical check → PR(s) |
| SEO | #2981 sitemap fix | after deploy: sitemap coverage, which URLs should be indexable (53,095 is not a target), Search Console submission (owner's account) | `local_1a4a2a4f` | post-deploy check |
| Paid plans | Continue pricing and legal-terms preparation | no real price change without a separate approval | `local_50daa866` (terms draft from #2842), `local_1a4a2a4f` (plans proposal, private) | drafts |
| J-12 | Applied: #2959 (2026-11-02 23:52:56Z) and the security fix #2977 (2026-11-03 07:59:24Z); #2979 (members not available, never 0) and #2983 (accept is really two-step) | LIVE_VERIFIED only after the full production PASS | coordinator | walk after #2983 deploy |

**Owner decisions 2026-11-03** (recorded verbatim in the PRs; executors in §3.1):

| PR | Decision | Conditions | Executor | Next |
|---|---|---|---|---|
| #2937 | APPROVED | keep worker / organization / assistant rights separate; the assistant never gets more than the user; after deploy verify real chat and mobile project scenarios in production | coordinator (merge), mobile `local_00be3967` (project detail re-run) | merge after CI on current main → deploy → prod walks |
| #2959 | APPROVED WITH CONDITIONS | learners may request; an external manager / agency may decide ONLY with an explicit, limited, revocable per-group delegation from the institution — not in this PR, so external roles get no access by default (separate verified PR); administering a group never confirms practice, hours, competences or a qualification; actor, origin and authority basis traceable; one journal, one hours ledger; self-declared history stays possible and separate; before the production migration: backup state, rollback and RLS/grants checked; Chrome J-12 walk after deploy | `local_b55e3e39` (narrow deciders), coordinator (pre-apply checks, apply, walk) | narrowed PR → checks → apply → walk |
| #896, #897 | CARRY OVER AND CLOSE | all unique financial, accounting, payment, audit and security requirements into ONE canonical financial-architecture decision file with links to the historical PRs; close only after the carry-over is checked complete; no payment activation, no pricing change | `local_13cb59b3` | decision-file PR → completeness check → close both |
| #2419 | REPLACE WITH A SMALL NEW PR | compare with Agentai OS; keep unique requirements; close the old PR with a link; minimal, non-duplicating; no automatic deploy, no new external access, no cost | `local_1a4a2a4f` | new PR (no auto-merge) → close #2419 |
| J-15 digest | unchanged | the scheduled setup (11-03) and check (11-09) stay as planned | `local_816618a9` | — |

**Kept open for the owner** — independent read-only reviews 2026-11-03 (not by the PRs' authors):

- **#2937** (worker role from the caller's own worker profile in chat/MCP; RED, 5 files, no migration, CI green) —
  review verdict **APPROVE-SAFE**: the role comes only from `workers.profile_id = auth.uid()` (server-resolved, also
  under an OAuth bearer); every newly reachable worker action re-checks ownership in its own RPC; only `worker` is
  added, no company/agency/admin gate and no confirmation-token change. Residual risk low. Non-blocking follow-ups:
  a behavioural test for a failed worker read and for an agency-only caller with an own worker row; the
  opportunities page (`requireRoleOrRedirect("worker")`) should reuse the same rule.
- **#2959** (J-12 learner join request; RED, unapplied) — verdict **APPROVE-WITH-CONDITIONS**: proof 43/43 re-run +
  11 attack probes correct; definer functions, auth.uid() bound, authenticated-only grants, no RLS change; only
  `manages_organization` may decide, never one's own request. Conditions being fixed by `local_b55e3e39` before the
  owner decides: unverified typed name labelled + confirm on accept; re-request cooldown after a decline; `added_by`
  hidden from the learner; archived organization refused; walk checks the switch first and archives its group.
  Owner must confirm that `external_manager` (possibly an agency) counts as an authorised decider. Shared follow-up:
  `engagement_contexts` duplicate race (same as invitations).
- **#2419** (AI monitoring) — CONFLICTING and failing typecheck; its egress premise is superseded by #2433. Unique,
  not on main: classify quota / timeout / provider-unavailable from `route_reason`, split price-missing from
  budget-blocked, `ai-failing` = technical failures ÷ attempted runs (privacy refusals and the disabled runtime
  excluded), `ai_outcome_*_7d` metric rows. Agentai OS has no LabourMarket AI-health monitor (no duplicate).
  Recommended: close #2419 and carry exactly that into one small GREEN PR off main (≈1–2 h, 4 files, no migration),
  reusing the provider-chain failure vocabulary — owner go-ahead.
- **#896 + #897** — main's gates G-7/G-8 decide WHEN selling is allowed, never WHETHER it pays for itself; that second
  question exists only in these PRs. **One requirements list (origin #896/#897, 2026-07-28):**

| ID | Requirement | On main |
|---|---|---|
| CSP-001 | no deliberate long-term loss; a subsidy names its funding source | absent |
| CSP-002 | economic model before anything paid goes public | partly (activation gates, no model recorded) |
| CSP-003 | free tier ≈ 60–70 % of base value, funded by the paid model | absent |
| CSP-004 | natural free → paid progression, no artificial blocking (review only) | absent |
| CSP-005 | LMC is an internal economy, not a discount | partly (LMC flags off; 1 LMC = €1 invariant) |
| FSR-001 | unit cost known before launch | partly (AI cost metering only) |
| FSR-002 | no "unlimited" without a technical abuse bound | partly (AI run cap; paid plan has no numeric bound on open positions) |
| FSR-003 | growth must not scale losses | partly (AI cap only) |
| FSR-004 | no subsidy funded by future investment | absent |
| FSR-005 | before paid activation: payer, what is paid for, unit cost, margin | partly (payer only) |
| Gate ×11 | commercial gate conditions (assessment, unit cost, margin, payer, unlimited bound, scaling losses, negative margin, future-funded subsidy, LMC as discount) | absent |
| Fields | economic-model fields per sellable item; feature-economics fields (owner, payer, cost/revenue driver, margin model, decision) | absent |
| BHE-39 | 39 health metrics: revenue (MRR excludes top-ups), unit economics, margin, cost (12; only AI measured), LMC (6), adoption (6), composite | raw data only |
| Plan / LMC health | per-plan margin and risk; LMC liability + backing ratio | absent |
| Warnings ×8 | LOSS_RISK, NEGATIVE_MARGIN, LOW_MARGIN < 30 %, UNLIMITED_RISK, HIGH_AI_COST > 25 %, EXPENSIVE_FEATURE, LMC_LIABILITY_GROWING, SUBSIDY_RISK | absent |
| Score | 8 weighted parts = 100; refuses to score below 5 measurable parts; unmeasured ≠ 0 | absent |

  Already enforced, never rebuild: G-7/G-8 + live-key block, LMC kill switches, no money in code / null never
  unlimited, AI cost metering, per-organization AI run cap. Overlapping open PRs (none duplicates): #2441, #2647,
  #2474 (VIP = subsidy), #2682 (pilot amount for revenue), #2704 / #2685 / #2701 (net-of-VAT basis).
  Recommended carrying path: one decision file with CSP/FSR verbatim + the list above, a pointer under MKT-7, an
  owner row for the economic model of the live Organization plan / trial / pilot pass / VIP grant; re-point the
  citations of unmerged PRs in `apps/web/lib/product-gate/axioms.ts` (:119, :122, :128, :137, :140) and
  `docs/PRODUCT_CONSTITUTION.md:239-241`; then close #896/#897. Their code is not rebased (it imports the closed
  #895's catalogue); a faithful gate would turn RED on the live paid plan until an owner assessment or dated
  exception exists.

Still recommended for an owner keep/close decision: rescope #2165 (referral pipeline already on main),
#1577, #1835. Leave parked: #2198 (voice), #2377, #2370 (owner visual), #1211, #1166.

---|---|---|---|---|
| Job-offer intake → public listing → candidate sign-up → Living CV → application → employer review (growth mechanism of the existing platform, not a new product; LabourMarket.ai + Agentai OS data processing + Nonstop Group commercial links) | owner, 2026-11-01 | P1, after current P0 | QUEUED, NOT STARTED — owner: coordinator `local_8d793dee` | (1) current P0 work finished; (2) core user journeys verified in production; (3) no open P0 blocker; (4) this register checked; (5) proven no duplication of existing intake / vacancy store / opportunities / interest / Living CV components |

Binding notes for that item: reuse the existing ingestion and vacancy store; keep source,
link, fetch date and publishing-right status per listing; never invent missing fields;
auto-publish only with a confirmed lawful basis, everything else to a review queue; no
full copying of third-party ads without permission; Agentai OS may process data only —
the ban on automatic replies to company mail stays; core publishing and candidate sign-up
stay free; no revenue projections from unconfirmed placement commissions; first pilot =
50 real offers, staged, browser-verified (desktop + mobile), with measured views,
sign-ups, applications and returning users. No new agent, radar or parallel project.

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
- **Resolved 2026-11-01:** the live migration-parity gate is active and PASSES on `main` (run 41342643253). The six missing repository files were restored by #2913, with no production change. The separate Codex security review of #2913 did not run; the code review passed.
- **Backups (13.5):** add the scoped `SUPABASE_ACCESS_TOKEN` secret, so that `db-backup.yml` runs its restore proof (#2906).
- **D-4 / D-5: DONE 2026-11-02.** #2903 and #2921 merged; `production-qa` restricted to `main`. mail-reset 41428606490 PASS 2/2 (1.3 / J-16), invited-worker 41430482903 PASS 7/7 (J-6 complete); the synthetic account was erased by the platform erasure runner. Open: owner approval to delete the one remaining pseudonymised synthetic invitation (scope checked: exactly 1 row, nothing references it).
- **Shared VPS (13.1):** remediation #2911 + agentai#1226 live since 2026-11-01; 72 h verdict due 2026-11-04 (details private).

Removed as resolved: #2855 and #2858 (APPLIED, LIVE_VERIFIED 2026-10-28, ledgers 20261028081810 /
20261028091725); D-3 hardening (= #2855); Stripe TEST arming (OPTIONAL_TEST, not a launch blocker);
VPS read-only access (granted, diagnosis done); worktree policy cleanup (done within policy: 75 → ~68).

## 6. How to update

Edit §2/§3 in the same PR as the work. Keep it a snapshot: delete `DONE` rows older
than 14 days (they live on in git history and the tracker). Date the §3 heading.

## 7. Open items (audit 2026-11-05)

The one list of open items, from the owner's order of 2026-11-05. It extends §3.3, §3.4 and §5 and doesn't replace them.

- **Nothing was closed or deleted.** A row starting "Proposal only" needs a decision first.
- **Priorities are suggestions** from the audit, in the P0–P4 order. The coordinator may change them.
- **"coordinator assigns" means no executor is named yet.**
- **"not re-checked"** means the row rests on the record or PR body, not on a fresh check.
- **A private row is only a pointer.** Its detail stays in the private matrix folder (`open-items-2026-11-05`).
- **IDs are stable.** New items take the next number, and an ID is never reused.

### PR check (owner order 2026-11-05)

Every PR open at 2026-11-05 06:28 UTC (74, 69 at the first audit) has one class, in the Type column. Its reason and evidence are in the Source column. **Nothing was closed;** closing is the owner's call.

| Class | PRs | Meaning |
|---|---|---|
| reikalingas | 9 | Still needed, technical work left (no conflict, no owner gate) |
| pasenęs | 4 | Out of date, nothing replaced it: parked or needs a rebuild |
| pakeistas kitu | 2 | Another merged PR did this; proposal only |
| konfliktuojantis | 34 | Still needed, conflicts with `main` |
| blokuotas | 18 | No conflict; waits for the owner, legal or another PR |
| paruoštas sujungti | 7 | No conflict or gate, checks pass and ran in the last 14 days |

A PR fitting several classes takes the first that applies, in this order: pakeistas kitu, pasenęs, konfliktuojantis, blokuotas, paruoštas sujungti, reikalingas. The rest is listed under "also", so a conflicting PR may still need the owner.

Limits: mergeability and checks are a snapshot. The 8 dependency PRs were compared with `main`'s versions, not installed. For #1577 and #1045 the live database state wasn't read. Applied state of RED migrations wasn't read: they're classed by their PR, not by production.


### Open items

| ID | Item | Type | Priority | Executor | Depends on | Done when | Rows | Source |
|---|---|---|---|---|---|---|---|---|
| OI-1 | #3089: Open fix: a saved profile row shows at once and is not stored twice. | paruoštas sujungti | P0 | coordinator assigns |  | PR merged with quality green and the Codex findings resolved, and walk profile-cv-history step P-9 passes after the deploy | 2.5, 2.7, 2.8 | PR #3089: clean, checks pass, no gate. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-2 | #3083: Open database change for faster job search, waiting for a measurement and an owner decision. | blokuotas | P0 | owner decides, then coordinator |  | Owner approves or rejects this exact migration after the two-import measurement of v5; if approved it is applied and first-search time under the limit is measured in production | SR-1, JS-2 | PR #3083: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-3 | #2996: Open change for search-engine sitemap paging awaiting owner decision. | konfliktuojantis | P0 | owner decides, then coordinator |  | Owner approves; rebased PR drops the #2994 commit; deepest sitemap shard answers under the anon time limit in a production check | SEO-3, IDX-12 | PR #2996: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 2 ok, 0 failing, 0 running, last run 1 d ago. full check |
| OI-4 | #2682: Open fix to how a short plan is displayed. | konfliktuojantis | P0 | owner decides, then coordinator |  | Rebased; pilot pass shows its plan name, a fixed end date and no cancelled wording, proven by account page walk | 7.4, 7.20 | PR #2682: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 8 ok, 0 failing, 0 running, last run 13 d ago. full check |
| OI-5 | #2642: Open fix to the saved-jobs view awaiting an owner waiver. | konfliktuojantis | P0 | owner decides, then coordinator |  | Owner gives waiver sentence; rebased; saved-jobs view never says nothing saved when it could not read | 4.4 | PR #2642: conflicts with main and is still needed; also: needs the owner; 1 failing checks. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 10 d ago. full check |
| OI-6 | #2403: Open fix to wrongly labelled job ads, partly overtaken by a merged fix. | konfliktuojantis | P0 | owner decides, then coordinator |  | Re-measure whether the Specialistofficer-type collisions persist after #2803; if yes rebase with waiver, if no close |  | PR #2403: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 20 d ago. deep check |
| OI-7 | #3082: Open tool: restore a stored backup into a throw-away database. | paruoštas sujungti | P1 | j15 (merge: owner or coordinator) |  | Codex findings fixed and merged; one run of the script on a stored encrypted pair prints the key-table counts inside the windows | 13.5 | PR #3082: clean, checks pass, no gate. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-8 | #3047: Open billing safety fix awaiting owner approval. | blokuotas | P1 | owner decides, then coordinator |  | Owner approves; route answers 409 pilot_pass_active while the pilot pass switch is on, proven by test-checkout-route test and one production request | 7.4, 7.15 | PR #3047: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-9 | #2918: Open access-control hardening awaiting owner approval. | blokuotas | P1 | owner decides, then coordinator |  | Owner approves; merged; a token issued for another resource is refused at app/api routes, proven by test and one production check |  | PR #2918: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 2 d ago. full check |
| OI-10 | #2811: Open access-control hardening awaiting owner decision. | blokuotas | P1 | owner decides, then coordinator | #2806 | Owner approves; #2806 merged; third-party tokens reach the database only through the connector door, proven by the isolated job (#2809) |  | PR #2811: waits for the owner; also: needs the owner; waits for #2806; 1 failing checks; draft. GitHub mergeable/unstable, checks 7 ok, 1 failing, 0 running, last run 9 d ago. full check |
| OI-11 | #2809: Open test-pipeline addition awaiting owner approval. | blokuotas | P1 | owner decides, then coordinator |  | Owner approves; workflow merged; the isolated job runs green on a PR |  | PR #2809: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 9 d ago. full check |
| OI-12 | #2806: Open access-control hardening awaiting owner approval. | blokuotas | P1 | owner decides, then coordinator |  | Owner approves; merged; third-party tokens are accepted only at the connector door |  | PR #2806: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 9 d ago. full check |
| OI-13 | #2693: Open database permission change awaiting owner decision. | konfliktuojantis | P1 | owner decides, then coordinator |  | Rebased; owner approves; vacancy retention run protects saved ids without a permission error | 10.20 | PR #2693: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 8 d ago. full check |
| OI-14 | #2454: Open test addition awaiting owner approval. | blokuotas | P1 | owner decides, then coordinator |  | Owner approves; merged; the walk mcp-oauth-client passes from main | 10.3 | PR #2454: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 9 ok, 0 failing, 0 running, last run 2 d ago. full check |
| OI-15 | Employer hire decision closes the need with visible history; agency commissions and agency-to-agency cooperation (vision lines 107-108). | approved requirement | P1 | coordinator assigns |  | Prod walk: employer marks a candidate hired, the need closes, history shows decision, actor and time; agency commission and agency-to-agency parts each have their own row or an owner-dated deferral | 4.30, E-5 | docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md:103 |
| OI-16 | Private item, see the private record | private | P1 | see private record |  | See private record |  | Private record |
| OI-17 | Private item, see the private record | private | P1 | see private record |  | See private record |  | Private record |
| OI-18 | Private item, see the private record | private | P1 | see private record |  | See private record |  | Private record |
| OI-19 | A person accepted as an employee through an invitation may not appear in the roster-based pages. Latent; no production case yet. | unfinished integration | P1 | owner decides, then coordinator | owner store decision (Option 1 GREEN readers or RED accept fn) | Accepted employee invitation shows the person in roster-driven surfaces (people, hours quick-entry, timesheet import, brigades); walk org-roster covers it |  | Private record |
| OI-20 | Hours imported through two paths could be counted twice. Latent; no case yet. | unfinished integration | P1 | coordinator assigns |  | Unit tests: same person, same day in both stores counted once with provenance for both; one import engine plan recorded |  | Private record |
| OI-21 | Sign-up was last proved before later page changes and needs a fresh production walk. | declared working unproven | P1 | coordinator assigns | one walk at a time, outside deploys | Production sign-up walk passes on a build after #2999; list of 13 groups re-walked with run ids | 1.1 | Private record |
| OI-22 | Private item, see the private record | private | P1 | see private record |  | See private record |  | Private record |
| OI-23 | Built functions with no browser proof in production; the per-function list comes with the catalogue in `FUNCTION_REGISTER.md` | proof gap | P1 | coordinator assigns | One walk at a time (§1.7a) | Every built user-facing function has a production browser walk or a recorded real-user action named in its row, or its row says why a browser can't prove it | many | Register evidence column |
| OI-24 | #2993: Open change to show country and city on public job ads. | konfliktuojantis | P2 | owner decides, then coordinator |  | Migration renumbered after the latest version on main; owner approves; signed-out job ads show country and city where lawful, proven by a production walk | SEO-10, JS-7 | PR #2993: conflicts with main and is still needed; also: needs the owner; 2 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 2 failing, 0 running, last run 1 d ago. full check |
| OI-25 | #2984: Open SEO fix: job board page 2 and later have their own canonical. | reikalingas | P2 | coordinator assigns |  | quality failure fixed, PR marked ready and merged; page 2 of the job board returns its own canonical URL | SEO-8 | PR #2984: checks failing; also: 1 failing checks; draft. GitHub mergeable/blocked, checks 7 ok, 1 failing, 0 running, last run 1 d ago. full check |
| OI-26 | #2946: Open database change awaiting owner decision. | konfliktuojantis | P2 | owner decides, then coordinator |  | Owner approves; rebased; applied; a provider turns an accepted service request into a draft offer, proven by walk | C-4 | PR #2946: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 2 d ago. full check |
| OI-27 | #2816: Open change so organizations can assign training to employees. | konfliktuojantis | P2 | owner decides, then coordinator |  | Rebased; owner approves the SQL; an organization assigns training to an active employee in a walk | 11.8, HR-4 | PR #2816: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 9 d ago. full check |
| OI-28 | #2795: Open booking change needing a rebase and owner decision. | konfliktuojantis | P2 | owner decides, then coordinator |  | Rebased; owner approves; acknowledged booking clash is recorded, proven by walk orders-bookings step O-5 | 3.35, 5.13, PRJ-3 | PR #2795: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 8 d ago. full check |
| OI-29 | #2747: Open privacy change awaiting rebase and owner decision. | konfliktuojantis | P2 | owner decides, then coordinator |  | Rebased onto main; owner approves; free workers appear in discovery by default with an off switch, proven by walk | 2.35, 4.17 | PR #2747: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 8 ok, 0 failing, 0 running, last run 8 d ago. full check |
| OI-30 | #2746: Open marketplace lifecycle change awaiting owner decision. | blokuotas | P2 | owner decides, then coordinator |  | Owner approves; applied; closed listings keep their outcome and a discarded draft never reopens, proven by walk | 6.2 | PR #2746: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-31 | #2209: Open change to filter job ads by country, needs rebuild. | pasenęs | P2 | owner decides, then coordinator | #3083 | Rebuilt on the latest search function; owner approves; Norway and Sweden ads filter on /jobs | 4.4 | PR #2209: written against an older search function; needs a rebuild; also: conflicts with main; needs the owner; waits for #3083; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 27 d ago. full check |
| OI-32 | A person can see which adjacent professions their evidenced skills open and how to change career, as a tracked function with a production proof. | approved requirement | P2 | coordinator assigns |  | FUNCTION_REGISTER has a row 'Adjacent directions from evidenced skills' and a scenario row 'person changes profession'; a prod walk step shows at least 1 adjacent profession with its basis on /cv for a synthetic worker with evidence and the honest empty state for one without; status set from that run |  | docs/PRODUCT_CONSTITUTION.md:77 |
| OI-33 | A school leaver or graduate finds an internship, apprenticeship or first-job opportunity and the same person moves from learner to worker. | approved requirement | P2 | coordinator assigns | L-4; apply state of 20260903130000 to be confirmed | FUNCTION_REGISTER row 'Internship / apprenticeship opportunity type' with prod proof: an employer posts one, a learner with a student relationship finds it on the board with the type badge and raises a hand; scenario 'first job' PASS or FAIL recorded |  | docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md:68 |
| OI-34 | Product-truth journey data must stop calling the learner-join link BROKEN now that J-12 and 11.2 are LIVE_VERIFIED, or ARCH-3 must say why zero usage still breaks it. | unfinished integration | P2 | coordinator assigns | ARCH-3 owner decision (taken 2026-11-02 in decision 0028 J-12) | product-truth prints 2 broken links and none for the learner-join step, citing walk 41611766407; capability-register and product-graph-journeys guard tests pass | 11.2 LIVE_VERIFIED vs product-truth BROKEN | apps/web/lib/product-gate/journey-register.ts:267 |
| OI-35 | Admin company verification queue decides who counts as a verified company and gates what buyers reach; it needs a register row and a walk. | declared working unproven | P2 | coordinator assigns |  | FUNCTION_REGISTER row 'Company verification review' with prod walk: admin approves one synthetic company, its status changes to verified and the gated read opens; refusal path stays closed |  | docs/CAPABILITY_INVENTORY.md:367 |
| OI-36 | Users can report a listing, offer, message or person, and an operator sees the report; needed before care or other public services open. | security | P2 | coordinator assigns | SC-14 owner scope; admin queue pattern 9.1 | A signed-in user can file a report on a listing, offer and conversation; admin console lists it; prod walk covers file, list, resolve; privacy review recorded |  | docs/policies/risk-monitoring-and-fraud-response-v1.md:15 |
| OI-37 | Self-employed specialist: public service pages and sitemap, an onboarding door for the self-employed role, a service subject list. | ux | P2 | owner decides, then coordinator | owner approval of RED RPC for 6.21 | Signed-out Chromium at 390 px opens a public service list and one service page, both in the sitemap; a self-employed door exists in onboarding; prod walk marketplace extended to cover it | SC-4, SC-13, 6.21, IDX-6 (Owner, then GREEN executor) | docs/program/FUNCTION_REGISTER.md:689 |
| OI-38 | Approved: a company can pause a published need and resume it. Not built yet; no register row. | approved requirement | P2 | coordinator assigns |  | customer_requests accepts paused; adapters.ts maps pause/resume for demand; matching, scouting and open-needs ceiling exclude paused; marketplace prod walk pauses and resumes a need |  | Private record |
| OI-39 | Private item, see the private record | private | P2 | see private record |  | See private record |  | Private record |
| OI-40 | Owner approved an employer-side recognition read in October; whether it is live was never recorded. | unfinished migration | P2 | coordinator assigns | read-only to_regprocedure check | to_regprocedure returns the function in prod or ledger lists its version; people page shows recognitions to an engaged employer; if absent, apply via MCP under the 2026-10-08 approval |  | Private record, not re-checked |
| OI-41 | Private item, see the private record | private | P2 | see private record |  | See private record |  | Private record |
| OI-42 | Some managers cannot pick an organization they are allowed to act for. | unfinished integration | P2 | coordinator assigns |  | Picker lists every organization the RPC would accept; test with a manager without engagement |  | Private record, not re-checked |
| OI-43 | Forecast storage is deployed but the scheduled job is not installed. | unfinished integration | P2 | coordinator assigns | VPS install by coordinator | Cron entries present; a project with enough recorded work shows a forecast; walk | PRJ-2 | Private record, not re-checked |
| OI-44 | Private item, see the private record | private | P2 | see private record |  | See private record |  | Private record |
| OI-45 | Walks stopped on 2026-10-25 need a one-time check against the register. | declared working unproven | P2 | coordinator assigns | one walk at a time | Each spec has a run id in the register or a reason | various | Private record, not re-checked |
| OI-46 | #3021: Open database cleanup awaiting owner decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Owner approves; PR rebased onto main so quality is green; index dropped and board read time unchanged in production |  | PR #3021: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 1 d ago. full check |
| OI-47 | #3019: Open database performance change awaiting owner decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Owner approves; PR rebased, quality green, 22 policies rewritten and advisor auth_rls_initplan count falls |  | PR #3019: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 1 d ago. full check |
| OI-48 | #2924: Open change to the permission screen, waiting for an owner decision. | blokuotas | P3 | owner decides, then coordinator |  | Owner gives the waiver sentence for this PR number; quality green; consent screen shows each permission in plain words in all locales | 10.3, 10.4 | PR #2924: waits for the owner; also: needs the owner; 1 failing checks; draft. GitHub mergeable/blocked, checks 7 ok, 1 failing, 0 running, last run 3 d ago. full check |
| OI-49 | #2923: Open change to what assistants can reach, awaiting an owner decision. | blokuotas | P3 | owner decides, then coordinator | #2918 | Owner decides X-2; #2918 merged; this rebased onto main; scope toolset live and ChatGPT connector walk still passes | 10.4 | PR #2923: waits for the owner; also: needs the owner; waits for #2918; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 2 d ago. full check |
| OI-50 | #2886: Open reporting export on owner hold. | blokuotas | P3 | owner decides, then coordinator |  | Owner lifts the hold or rejects; if lifted the export returns daily aggregates for a complete UTC day | 9.14 | PR #2886: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-51 | #2842: Draft legal text awaiting review. | blokuotas | P3 | owner + lawyer |  | Lawyer and owner review the draft; accepted text is published as the live terms or the PR is closed |  | PR #2842: waits for legal review; also: needs the owner; needs legal review; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 1 d ago. full check |
| OI-52 | #2812: Open access-control work needing a clean rebuild. | pasenęs | P3 | owner decides, then coordinator | #2707, #2806 | Rebuilt as a small diff on top of merged #2806/#2707 (or owner closes it); owner approves; people can choose and revoke permissions | 10.3, 10.4 | PR #2812: embeds other PRs and main; needs a clean rebuild; also: needs the owner; waits for #2707, #2806; 3 failing checks; draft. GitHub mergeable/unstable, checks 5 ok, 3 failing, 0 running, last run 9 d ago. full check |
| OI-53 | #2752: Open legal text change awaiting review. | blokuotas | P3 | owner + lawyer |  | Owner/lawyer approve the wording; merged before the free-tier AI switch is turned on |  | PR #2752: waits for legal review; also: needs the owner; needs legal review; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 10 d ago. deep check |
| OI-54 | #2713: Open marketplace change needing a rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator | #2746 | Rebased after #2746; owner approves; a buyer sends a goods purchase request with delivery fields, proven by walk | 6.13, C-3 | PR #2713: conflicts with main and is still needed; also: needs the owner; waits for #2746; draft. GitHub conflicting/dirty, checks 8 ok, 0 failing, 0 running, last run 8 d ago. full check |
| OI-55 | #2707: Open access-control work awaiting owner decision. | blokuotas | P3 | owner decides, then coordinator | #2806 | Owner decides whether this scope design or #2923 is the one; the chosen one merges with flag off and a test pinning unchanged behaviour | 10.4 | PR #2707: waits for the owner; also: needs the owner; waits for #2806; 1 failing checks; draft. GitHub mergeable/blocked, checks 7 ok, 1 failing, 0 running, last run 9 d ago. full check |
| OI-56 | #2704: Open billing display work awaiting owner and legal. | blokuotas | P3 | owner decides, then coordinator | #2685 | Owner and legal clear PAY-4; merged; organization invoices show in the billing section for a paying organization | 7.20, PAY-4 | PR #2704: waits for the owner; also: needs the owner; waits for #2685; draft. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 12 d ago. full check |
| OI-57 | #2701: Open billing copy awaiting legal confirmation. | konfliktuojantis | P3 | owner + lawyer | #2685 | Rebased; owner confirms the tax registration; checkout copy no longer promises tax handling that is not proven | 7.29, PAY-4 | PR #2701: conflicts with main and is still needed; also: needs the owner; needs legal review; waits for #2685; draft. GitHub conflicting/dirty, checks 8 ok, 0 failing, 0 running, last run 12 d ago. full check |
| OI-58 | #2685: Open billing work needing rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator | #2441, #2647 | Rebased; owner approves; tax evidence is recorded and reviewed, switched off until cleared | 7.15, 7.29, PAY-4 | PR #2685: conflicts with main and is still needed; also: needs the owner; waits for #2441, #2647; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 10 d ago. full check |
| OI-59 | #2647: Open billing test work awaiting owner decisions. | konfliktuojantis | P3 | owner decides, then coordinator | #2441 | Rebased; owner approves package sizes (MDD-03); a test top-up credits once per payment |  | PR #2647: conflicts with main and is still needed; also: needs the owner; waits for #2441; draft. GitHub conflicting/dirty, checks 8 ok, 0 failing, 0 running, last run 14 d ago. full check |
| OI-60 | #2474: Open pricing change awaiting rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner approves; free plan opens three worker profiles per organization | 4.22, 7.10, 7.22, 7.27 | PR #2474: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 10 d ago. full check |
| OI-61 | #2471: Open privacy change awaiting rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner approves; external profile links are shared only through the worker consent | 2.10, 4.18 | PR #2471: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 7 ok, 0 failing, 0 running, last run 16 d ago. full check |
| OI-62 | #2463: Open data housekeeping awaiting rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner approves the delete and vacuum; cold locales archived on the VPS and hot set kept | 2.17 | PR #2463: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 7 ok, 0 failing, 0 running, last run 16 d ago. full check |
| OI-63 | #2441: Open billing safeguard needing rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner approves; with the live switch off a live checkout answers 503 live_not_enabled |  | PR #2441: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 19 d ago. full check |
| OI-64 | #2440: Open database safeguard awaiting owner decision. | blokuotas | P3 | owner decides, then coordinator |  | Owner approves; applied; null owner is refused in append_assistant_message, proven by DB test |  | PR #2440: waits for the owner; also: needs the owner; 1 failing checks; draft. GitHub mergeable/blocked, checks 6 ok, 1 failing, 0 running, last run 19 d ago. full check |
| OI-65 | #2420: Open database performance change needing rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner approves; the 10-minute count skips the full scan when nothing changed |  | PR #2420: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 20 d ago. full check |
| OI-66 | #2418: Open performance change needing rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner approves; the badge count uses one read |  | PR #2418: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 20 d ago. full check |
| OI-67 | #2362: Open data correction awaiting rebase and approval. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner gives final approval; 165 dates corrected with before/after counts matching | 2.28 | PR #2362: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 7 ok, 0 failing, 0 running, last run 21 d ago. full check |
| OI-68 | #2235: Open database change needing rebase and decision. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner approves; expiry sweeps run as service role only |  | PR #2235: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 7 ok, 0 failing, 0 running, last run 26 d ago. full check |
| OI-69 | #2227: Open ingestion safeguard needing rebase. | konfliktuojantis | P3 | owner decides, then coordinator |  | Re-assess against main cadence; if still wanted rebase and owner approves, else close |  | PR #2227: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 26 d ago. deep check |
| OI-70 | #2203: Open finance work needing rebuild. | konfliktuojantis | P3 | owner decides, then coordinator |  | Re-scope against the finance layers now on main; owner approves; project-to-invoice chain walk passes | 3.12, 7.30 | PR #2203: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 27 d ago. deep check |
| OI-71 | #2165: Open sign-up flow work awaiting review. | konfliktuojantis | P3 | owner decides, then coordinator |  | Rebased; owner reviews; inbound worker path from the partner site reaches existing signup |  | PR #2165: conflicts with main and is still needed; also: needs the owner; draft. GitHub conflicting/dirty, checks 1 ok, 0 failing, 0 running, last run 12 d ago. full check |
| OI-72 | #1816: Old database draft needing re-scope. | konfliktuojantis | P3 | owner decides, then coordinator |  | Re-scope against 11 locales on main; owner approves or closes |  | PR #1816: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 6 ok, 1 failing, 0 running, last run 45 d ago. deep check |
| OI-73 | #1577: Old catalogue draft needing comparison. | konfliktuojantis | P3 | owner decides, then coordinator |  | Compare with catalogue on main; if office professions are still missing rebuild, else close | 2.12 | PR #1577: conflicts with main and is still needed; also: needs the owner; 2 failing checks; draft. GitHub conflicting/dirty, checks 5 ok, 2 failing, 0 running, last run 59 d ago. deep check |
| OI-74 | #1045: Old admin-tool fix, needs a re-test. | konfliktuojantis | P3 | owner decides, then coordinator |  | Test pnpm admin:promote against production permissions; if it still fails rebuild, else close |  | PR #1045: conflicts with main and is still needed; also: needs the owner; 1 failing checks; draft. GitHub conflicting/dirty, checks 1 ok, 1 failing, 0 running, last run 90 d ago. deep check |
| OI-75 | A person gets a real learning or reskilling option (named course or provider with source) linked to a skill gap, not only institution-run groups. | approved requirement | P3 | owner decides, then coordinator | owner decision: content partner or licence, or explicit out-of-scope (audit section 5 item 4) | Owner decision recorded in COORDINATION section 5; then either a FUNCTION_REGISTER row exists with a prod walk where a skill gap on a job shows at least 1 learning option with source and date and no invented course, or the row states OUT_OF_SCOPE with the owner decision date |  | docs/PRODUCT_CONSTITUTION.md:76-77 |
| OI-76 | Register row says NOT_IMPLEMENTED but accommodation is already a publishable listing subject; split what exists (listing) from what is missing (beds, booking, assignment to project). | unfinished integration | P3 | owner decides, then coordinator | owner scope for vision section 8 | 6.22 split into 'housing listing' (status from a prod listing walk with subject accommodation) and 'housing booking and assignment' (NOT_IMPLEMENTED with owner decision) | 6.22 NOT_IMPLEMENTED vs 6.2 LIVE_VERIFIED listings | docs/program/FUNCTION_REGISTER.md:1008 |
| OI-77 | Vision section 19 marks housing, invoices, other channels and automations as MUST; the register triage classes the same rows OPTIONAL_OR_UNPLANNED with no executor. | approved requirement | P3 | owner decides, then coordinator | owner invoicing rules per country (7.30); owner scope (6.22) | For each of 6.22, 7.30, 5.20, 5.21, 6.23 either a named executor and date in COORDINATION section 3, or an owner-dated change of the vision section 19 line to optional | 6.22, 7.30, 5.20, 5.21, 6.23 (all NOT_IMPLEMENTED, 'None now') | docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md:280 |
| OI-78 | Partner reputation and risk flags (risk_flagged, limited access, blocked with evidenced cause) as internal access control. | approved requirement | P3 | coordinator assigns |  | Row exists; the three states are stored per partner, visible only to operators, and a prod walk shows a flagged partner loses direct-contact release; or an owner note drops it |  | docs/product/partner-risk-and-reputation-policy.md:8 |
| OI-79 | Commercial gate and business-health score (CSP/FSR, 11 gate conditions, 39 metrics, 8 warnings) are held by review only; no register row and no executor for the gate or FIN-1. | approved requirement | P3 | owner decides, then coordinator | owner FIN-1 answers | FUNCTION_REGISTER row 'Commercial gate and business health'; FIN-1 answered for the live plan, trial, pilot pass and VIP; a test fails when a paid item lacks an assessment and axioms A-10 and A-11 move to machine |  | docs/DECISIONS/0029-commercial-sustainability-and-business-health.md:6 |
| OI-80 | Care and home help: owner scope, a care service subject, safeguarding and trust rules, then public search. | approved requirement | P3 | owner decides, then coordinator | owner scope; abuse report function; ESCO mapping of caregiver and teacher | Owner scope recorded in COORDINATION section 5; if in scope: care subject exists, safeguarding rule documented, search for slaugytojas returns care ads, prod walk family request to carer | SC-14 (Owner) | docs/program/FUNCTION_REGISTER.md:699 |
| OI-81 | Older person or pensioner gets a plain-language page and an assisted route (phone or helper) into the product. | ux | P3 | coordinator assigns | SC-14 scope | One plain page in lt and en reachable from home; assisted route decided; moderated test with one older person recorded in the register | SC-15 (Owner); SC-16 test unscheduled | docs/program/FUNCTION_REGISTER.md:700 |
| OI-82 | Worker is told in the product when a held document or certificate is about to expire. | approved requirement | P3 | coordinator assigns |  | Row exists; prod walk with a synthetic document expiring in 7 days shows the bell item and attention entry, and clears when renewed |  | docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md:40 |
| OI-83 | Recognition by an institution is created but never compared with a requirement. Subject-side display is a code-only slice. | approved requirement | P3 | coordinator assigns |  | requirement-ledger.ts takes recognition rows and shows institution and validity beside the state; guard says it is not a score; unit tests; stale comments in worker-project-asks.ts corrected | 11.7 (creation only); journey J-12 text | Private record |
| OI-84 | Small copy and label fixes from the 11-03 audit are not tracked as register rows. | unfinished integration | P3 | coordinator assigns |  | Each remaining item has a PR or is closed with reason in the register |  | Private record, not re-checked |
| OI-85 | Two database performance items from the audit have no register row. | unfinished migration | P3 | owner decides, then coordinator | owner RED approval for index drops | Supply-count refresh runtime under a stated bound over 7 days; unused indexes dropped via RED with rollback |  | Private record, not re-checked |
| OI-86 | Forecast cadence exists in code; owner control through chat is not built and has no row. | approved requirement | P3 | coordinator assigns | forecast cron (PRJ-2) | Owner can read and set the mode for the own organization through chat/MCP with confirmation; test |  | Private record |
| OI-87 | Private item, see the private record | private | P3 | see private record |  | See private record |  | Private record |
| OI-88 | Supply-feed attribution and apply-link questions from October are still unanswered. | owner order | P3 | owner decides, then coordinator | owner | Decision recorded; backfill run or declared unnecessary |  | Private record, not re-checked |
| OI-89 | A monitor issue has breached for days with nobody assigned. | issue | P3 | coordinator assigns | invitation mail enabled#2519 | Policy chosen (resend, close, or expire); monitor returns OK and closes itself |  | issue #2836 |
| OI-90 | Live: breaching because AI is switched off pending an owner decision. | issue | P3 | owner decides, then coordinator | owner D-7 | Provider decision recorded; monitor OK or threshold re-based; surfaces say honestly that AI is off | 10.6, 13.17 | issue #2698 |
| OI-91 | Three October UX items are owner-gated and not in the register. | ux | P3 | owner decides, then coordinator | owner choice; billing-adjacent copy gate | Mislabelled count re-read; owner decisions recorded; changes shipped or declined |  | Private record, not re-checked |
| OI-92 | Private item, see the private record | private | P3 | see private record |  | See private record |  | Private record |
| OI-93 | Private item, see the private record | private | P3 | see private record |  | See private record |  | Private record |
| OI-94 | #3088: Docs note: one production walk at a time. | paruoštas sujungti | P4 | j15 (merge: owner or coordinator) |  | PR merged to main (docs only) |  | PR #3088: clean, checks pass, no gate. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-95 | #3041: Superseded by already-merged CI memory fixes. | pakeistas kitu | P4 | coordinator assigns |  | Proposal only: Close the PR; DEL-2 stays as the register says | DEL-2 | PR #3041: merged #3040 and #3048 gave CI the same memory fix; main already has the heap setting; also: conflicts with main. GitHub conflicting/dirty, checks 8 ok, 0 failing, 0 running, last run 0 d ago. full check |
| OI-96 | #3008: Superseded by a merged fix to the underlying count. | pakeistas kitu | P4 | coordinator assigns | #3004 | Proposal only: Close the PR after one look at the reports hub documents tile on an agency with a real zero | 3.31 | PR #3008: merged #3004 fixed the count underneath. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 1 d ago. full check |
| OI-97 | #2970: Open monitoring fix, reviewed. | paruoštas sujungti | P4 | coordinator assigns |  | PR merged; ai-failing counts technical failures over attempted runs in the monitor |  | PR #2970: clean, checks pass, no gate. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 2 d ago. full check |
| OI-98 | #2377: Design concepts awaiting an owner choice. | blokuotas | P4 | owner decides, then coordinator |  | Owner chooses A, B, C, hybrid or reject; PR merged or closed accordingly |  | PR #2377: waits for the owner; also: needs the owner; draft. GitHub mergeable/clean, checks 7 ok, 0 failing, 0 running, last run 21 d ago. full check |
| OI-99 | #2370: Design port awaiting conflicts resolved and visual approval. | konfliktuojantis | P4 | owner decides, then coordinator |  | Conflicts resolved, visual comparison shown, owner approves visually, then merged |  | PR #2370: conflicts with main and is still needed; also: needs the owner; 1 failing checks. GitHub conflicting/dirty, checks 7 ok, 1 failing, 0 running, last run 1 d ago. full check |
| OI-100 | #2356: Dependency update. | reikalingas | P4 | coordinator assigns |  | Dependency batch decides: bump next and its eslint config together or close |  | PR #2356: checks failing; also: 1 failing checks. GitHub mergeable/blocked, checks 6 ok, 1 failing, 0 running, last run 2 d ago. compared with main |
| OI-101 | #2198: Voice work parked until voice reopens. | blokuotas | P4 | owner decides, then coordinator |  | When voice reopens: bundle merged and verify-live passes on a real host | 2.30, 5.15 | PR #2198: waits for the owner; also: needs the owner. GitHub mergeable/clean, checks 7 ok, 0 failing, 0 running, last run 28 d ago. full check |
| OI-102 | #1835: Old test work, likely superseded. | konfliktuojantis | P4 | coordinator assigns |  | Re-run the walk on main as new spec or close |  | PR #1835: conflicts with main and is still needed. GitHub conflicting/dirty, checks 7 ok, 0 failing, 0 running, last run 43 d ago. deep check |
| OI-103 | #1625: Dependency update. | konfliktuojantis | P4 | coordinator assigns |  | One dependency batch after P0; merged or closed |  | PR #1625: conflicts with main and is still needed. GitHub conflicting/dirty, checks 7 ok, 0 failing, 0 running, last run 28 d ago. compared with main |
| OI-104 | #1624: Dependency update. | reikalingas | P4 | coordinator assigns |  | One dependency batch after P0; typecheck and e2e pass with the new version |  | PR #1624: last checks are 58 days old, re-run them. GitHub mergeable/clean, checks 7 ok, 0 failing, 0 running, last run 58 d ago. compared with main |
| OI-105 | #1623: Dependency update. | konfliktuojantis | P4 | coordinator assigns |  | One dependency batch after P0 |  | PR #1623: conflicts with main and is still needed. GitHub conflicting/dirty, checks 7 ok, 0 failing, 0 running, last run 28 d ago. compared with main |
| OI-106 | #1622: Dependency update. | paruoštas sujungti | P4 | coordinator assigns |  | One dependency batch after P0 |  | PR #1622: clean, checks pass, no gate. GitHub mergeable/clean, checks 11 ok, 0 failing, 0 running, last run 2 d ago. compared with main |
| OI-107 | #1620: Dependency update. | reikalingas | P4 | coordinator assigns |  | One dependency batch after P0 |  | PR #1620: last checks are 58 days old, re-run them. GitHub mergeable/clean, checks 7 ok, 0 failing, 0 running, last run 58 d ago. compared with main |
| OI-108 | #1619: Dependency update. | reikalingas | P4 | coordinator assigns | #1617 | Merged together with #1617 |  | PR #1619: checks failing; also: 1 failing checks. GitHub mergeable/unstable, checks 5 ok, 1 failing, 0 running, last run 58 d ago. compared with main |
| OI-109 | #1617: Dependency update. | reikalingas | P4 | coordinator assigns | #1619 | Merged together with #1619 |  | PR #1617: checks failing; also: 1 failing checks. GitHub mergeable/unstable, checks 5 ok, 1 failing, 0 running, last run 58 d ago. compared with main |
| OI-110 | #1211: Parked design work. | pasenęs | P4 | owner decides, then coordinator |  | Owner decides keep or close |  | PR #1211: parked design work, untouched for about 77 days; also: conflicts with main; needs the owner; draft. GitHub conflicting/dirty, checks 6 ok, 0 failing, 0 running, last run 77 d ago. full check |
| OI-111 | #1166: Parked design research. | pasenęs | P4 | owner decides, then coordinator |  | Owner decides keep or close |  | PR #1166: parked design research, untouched for about 80 days; also: needs the owner; 1 failing checks. GitHub mergeable/unstable, checks 5 ok, 1 failing, 0 running, last run 80 d ago. full check |
| OI-112 | Decide and track the ideas, venture and mentorship parts of the canonical definition (today only job-interest 'Ideas Integration v1' exists). | approved requirement | P4 | owner decides, then coordinator | owner scope decision | FUNCTION_REGISTER rows 'New ideas / ventures' and 'Mentorship' exist, each NOT_IMPLEMENTED with owner decision or OUT_OF_SCOPE with date; no public copy claims them |  | docs/PRODUCT_CONSTITUTION.md:77 |
| OI-113 | Worker life layer: opt-in partner offers for housing, travel and shopping with the five anti-company-store rules and a consent switch default OFF. | approved requirement | P4 | coordinator assigns | 6.22 housing scope; owner doctrine text for the five rules | Owner records keep or drop; if kept, FUNCTION_REGISTER row exists and a guard fails when an employer can read a worker's purchases |  | docs/handoffs/HANDOFF_s12_life_layer.md:5 |
| OI-114 | Carried reference requirements from closed #2438 (growth loops F-1..F-3, cold-start per group, KPI definitions), reused only when growth work starts. | approved requirement | P4 | coordinator assigns | #2896 job-intake growth item | KPI definitions become a register section with each metric having an owner and a read; or the #2896 PR cites the branch as its source | carry table only | docs/program/COORDINATION_REGISTER.md:263 |
| OI-115 | Live but orphaned; folds into the AI provider decision. | issue | P4 | owner decides, then coordinator | owner D-7 | Evidence note posted or issue closed as folded into D-7 |  | issue #2425 |
| OI-116 | Resolved on the server side; issue still open. | issue | P4 | owner decides, then coordinator | owner refresh in ChatGPT | Proposal only: Close with the diagnosis link | 10.1 | issue #2349 |
| OI-117 | Fixed by the automated erasure executor; issue still open. | issue | P4 | coordinator assigns |  | Proposal only: Close referencing #2442 and the erasure receipts |  | issue #856 |
| OI-118 | Superseded by the function register. | issue | P4 | coordinator assigns |  | Proposal only: Close as superseded by the register; remaining admin-role proof tracked in rows | register | issue #2659 |
| OI-119 | Directive carried out; issue still open. | issue | P4 | coordinator assigns |  | Proposal only: Close with links; LMC wallet top-up/UI/refunds stay deferred (B6 rows 7.8-7.26) | FUNCTION_REGISTER | issue #2628 |
| OI-120 | Stale duplicate tasks. | issue | P4 | coordinator assigns |  | Proposal only: Close as stale |  | issue #311; issue #312 |
| OI-121 | Tracks a closed PR. | issue | P4 | coordinator assigns |  | Proposal only: Close referencing #2439 | 2.31 | issue #32 |
| OI-122 | Some in-repo notes still describe applied migrations as pending. | unfinished migration | P4 | coordinator assigns |  | Comments and inventory updated to the ledger |  | Private record, not re-checked |
| OI-123 | Two owner dashboard settings from October have no row. | owner order | P4 | owner decides, then coordinator | owner dashboards | Both settings changed and checked; resubmission result noted | 13.9 (related only) | Private record, not re-checked |
| OI-124 | Remote branches: 1,588 belong to merged PRs, 111 to closed PRs, and 28 never had a PR | branches | P4 | owner decides, then coordinator |  | Proposal only: the owner decides on cleanup. Before any deletion, the closed-PR and no-PR branches are checked for unique commits |  | `git ls-remote`, PR list |
| OI-125 | #3090: feat(program): function map generated from the one register | reikalingas | P3 | coordinator assigns |  | PR merged, or the owner decides otherwise |  | PR #3090: checks running. GitHub mergeable/blocked, checks 5 ok, 0 failing, 2 running, last run 0 d ago. state only, new PR |
| OI-126 | #3091: docs(program): EU language coverage, search plan by country, IDX-9 decision | paruoštas sujungti | P3 | coordinator assigns |  | PR merged, or the owner decides otherwise |  | PR #3091: clean, checks pass, no gate. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. state only, new PR |
| OI-127 | #3093: docs(register): production results of profile-cv-history and jobs-search | paruoštas sujungti | P3 | coordinator assigns |  | PR merged, or the owner decides otherwise |  | PR #3093: clean, checks pass, no gate. GitHub mergeable/clean, checks 8 ok, 0 failing, 0 running, last run 0 d ago. state only, new PR |
| OI-128 | #3094: fix(seo): the privacy description uses the brand name LabourMarket.ai | reikalingas | P3 | coordinator assigns |  | PR merged, or the owner decides otherwise | GEO-6 | PR #3094: checks running. GitHub mergeable/blocked, checks 7 ok, 0 failing, 1 running, last run 0 d ago. state only, new PR |
| OI-129 | #3095: docs(program): function map data with plain Lithuanian catalogue | reikalingas | P3 | coordinator assigns |  | PR merged, or the owner decides otherwise |  | PR #3095: checks running. GitHub mergeable/blocked, checks 5 ok, 0 failing, 3 running, last run 0 d ago. state only, new PR |
