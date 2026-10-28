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
| coordination (this file) | session `…16CYcDu` "projekto perėmimas" | 2026-10-28 ~06:00Z (owner order) | keeps §2–§5 current; does not steer other sessions without their agreement |
| migration (prod DB) | — free — | | last: `external_referral_reprocess_candidates_v2` (ledger `20261028044705`, #2843) |
| live sends (e-mail to real people) | session `…AygGqFo3aoB76NrV` | 2026-10-27 | partner referral reprocess 41/45 done; **last sends frozen until D-3 is closed** |
| deploy | — serial via `deploy-vps.yml` — | | `/api/health` `build` is the truth (a run title can name a newer SHA than the one it deploys) |

---

## 3. Work register — snapshot 2026-10-28 ~06:00Z

Sources: GitHub PRs/Actions, production migration ledger, `/api/health`, session list.

### 3.1 Active executors

| Session | Doing | Area it owns (no overlap) | State |
|---|---|---|---|
| `…16CYcDu` "projekto perėmimas" (owner's computer) | coordination; whole-platform functional + UX audit and regression walks; RED-draft conflict upkeep; onboarding/invitation app code | §3.5 journeys, `apps/web` UX, design, guard baselines | IN_PROGRESS |
| `…AygGqFo3` "darbų perimimas" (owner's computer) | partner-referral reprocess and live-send lane (#2841/#2843) | `lib/invitations/external-referral-*`, `ops/vps/lm-referral-reprocess.sh`, reissue migrations | IN_PROGRESS |
| `…hnVKqGvExp` coordinator (cloud) | created this register (#2850) | handed over to `…16CYcDu` | DONE |
| other-repo sessions (Agentai OS, Nonstop) | not this repository | — | n/a |

### 3.2 Recent work (last 48 h)

| PR | Goal | Session | State | Production |
|---|---|---|---|---|
| #2841 | safe reprocess of unsent partner referrals (RED, approved) | `…AygGqFo3` | DONE | migration + code live |
| #2843 | never re-mail an address from an older duplicate referral (RED) | `…AygGqFo3` | DONE (merged `7e64b33`, migration `20261028044705`) | live; **D-3 open** |
| #2845 | invited person arriving without the link is still the addressee | `…16CYcDu` | DONE | live `2e4ae2b` |
| #2846 | invitations-for-me carries the partner source; server settles the role (RED, approved for this one) | `…16CYcDu` | DONE | live `51a3518`, ledger `20261028034356` |
| #2847 | synthetic invited-worker provision/walk/revoke/purge | `…16CYcDu` | DONE (code) | invited-worker E2E **NOT_VERIFIED** (owner parked; do not re-ask) |
| #2848 | public header brand never cut on phones | `…16CYcDu` | DONE | LIVE_VERIFIED 320/360/375 |
| #2849 | public site opens light; short sign-up intro (11 catalogs); theme follows in-app navigation | `…16CYcDu` | merged `5c8e61b` | WAITING (deploy) → visual check |
| #2850 | this register | coordinator | DONE | docs |
| #2840 | zero paid AI budget | `…16CYcDu` | READY: CI green, CLEAN, no overlap with `main` since its base | owner merge decision |
| #2839 | DB restore procedure (+ `docker rm -fv` volume fix from review) | `…16CYcDu` | READY after CI on `b2d449a` | owner merge decision |
| #2844 | synthetic data instead of personal e-mails in tests/docs | unknown | CI green, CLEAN | owner/legal decision (not touched) |
| #2842 | paid-terms legal draft | `…16CYcDu` | WAITING (legal/owner) | — |

### 3.3 Owner-gated (RED, draft, `needs-human-gate`)

List unchanged (see this file's git history). `…16CYcDu` keeps #2693 #2713 #2738 #2739 #2747 #2795
mergeable (counter-only merges; all MERGEABLE at 2026-10-28 06:00Z). `migration-safety` stays red on
them by design until the owner approves each one by name.

### 3.4 Stale non-draft PRs — unchanged (owner keep/close).

### 3.5 QA evidence by user journey (production walks; run id = GitHub Actions run)

| Journey | Evidence | Level |
|---|---|---|
| Worker: onboarding → Work Journal → Living CV | fresh-activation `40546035425` (2/2; CV hours = own DB hours, 0 confirmed); living-cv-growth `40634954858` (2026-10-28) | LIVE_VERIFIED |
| Invited worker without the link | code live (#2845/#2846); walk mechanism #2847 | NOT_VERIFIED (owner-parked) |
| Company: need → candidates → owner/admin isolation | fresh-activation `40546035425`; company-chain `40315387466` **13/13** | LIVE_VERIFIED |
| Marketplace | marketplace `40200714397` **6/6**; marketplace-goods-services `40164310896` 14/14 | LIVE_VERIFIED (10-25) |
| Orders / bookings | orders-bookings `40361384432` O-0..O-8 | LIVE_VERIFIED (10-26) |
| Calendar / shifts | calendar-planning `40635527214` (2026-10-28); rota-repeat queued | LIVE_VERIFIED |
| Notifications (in-app) | notifications-inapp `40639605465` (2026-10-28) | LIVE_VERIFIED |
| Job search | jobs-search `40640097643`: J-1..J-5 pass; **J-6 save-job fails (D-6)** | PARTIAL |
| Profile / CV history | profile-cv-history `40182648408` 21/21 | LIVE_VERIFIED (10-25) |
| Agency chain | agency-chain `40357361254` 8/8 | LIVE_VERIFIED (10-26) |
| Work verification | work-verification `40300016332` 6/6 | LIVE_VERIFIED (10-26) |
| Governance (decisions / training) | company-governance `40296167812`: D-1..D-5 + T-1 pass; **T-2 fails (D-7)** | PARTIAL |
| Mobile surfaces | mobile-surfaces `40195784343` 5/5; public pages 320–1280 checked 2026-10-28 | LIVE_VERIFIED |
| Languages | active 6 catalogs (lt/en/ru/nl/de/pl) complete, 0 placeholders, no untranslated prose; inactive 5 partial (D-8) | VERIFIED (catalog audit) |
| 275-function matrix | PASS 194 · FAIL 8 · BLOCKED 39 · NOT_VERIFIED 18 · NOT_IMPLEMENTED 16 (owner-private file; counts only here) | — |

Pending walks (queued by `…16CYcDu`): project-execution, search-support-privacy, rota-repeat,
chat-continuity, documents-approvals; jobs-search re-run for D-6.

---

## 4. Duplicates, conflicts, drift

| Id | Finding | Class | Next step |
|---|---|---|---|
| D-1 | #2738 / #2739 migrations are **already in production** (`20261025045152`, `20261025050302`) and **content-identical** to the PR files: forecast trigger body md5 equal after removing comments (`346feb54…`), 15 triggers, 4 RLS tables, 3 policies; all 7 history columns present. `main` lacks the files. | drift (re-run hazard) | owner: approve merging #2738/#2739 **as applied** (no re-apply; `APPLIED_LEDGER.md` CONTENT_ONLY rows). Both PRs also ship app code (forecast recompute route + VPS cron lines installed by hand; Living CV experience read) — a product decision, not only a ledger fix. |
| D-2 | #2746 title says "NOT applied" though applied | misleading status | fix when touched |
| D-3 | `reissue_external_referral_v1` (production) locks only the ROW (`for update`) and refuses only if THAT row is `sent`; `sent` is written after the mail, outside the transaction. Two concurrent runs: the second waits, still sees `not_sent`, rotates again → **two mails possible**. Cross-row duplicates are excluded only in the read (candidates_v2 + TS). `ops/vps/lm-referral-reprocess.sh` on `main` has **no `flock`**. One run at a time is safe. | SECURITY/DATA (duplicate mail) | lane owner `…AygGqFo3` (or `…16CYcDu` if handed over): RED follow-up — inside `reissue`, `pg_advisory_xact_lock` on `lower(trim(email))`; refuse `in_flight` when `resend_count > 0 and delivery_status = 'not_sent'`; refuse when another referral to the same normalized address is `sent` or in flight; `flock` in the script; local two-session concurrency test. **No further sends until done.** |
| D-4 | shared guard pin files conflict between DB PRs | merge conflicts | §1.6 lane rule; `…16CYcDu` resolves counters |
| D-5 | two audits ran in parallel | duplicated effort | split: `…16CYcDu` = whole-platform functional/UX/walks; `…AygGqFo3` = referral/send lane only |
| D-6 | jobs-search J-6: signed-in "save job" stays disabled > 30 s and no row is written (the action never returned); last green 2026-10-23 | P1 functional (cause NOT_VERIFIED) | `…16CYcDu`: re-run to separate a flake from a regression, then fix |
| D-7 | governance T-2: `assign_training_v1` accepts an assignee only with an active `company_memberships` row; ordinary employees are `engagement_contexts` → `invalid_assignee` | product gap | owner: RED #2816 (accept an active employee engagement) |
| D-8 | inactive locales da/et/lv/no/sv: 5 817 of 15 191 keys, 22–44 % `[EN]` placeholders | blocks those 5 markets only (they redirect to /en) | owner: translation source decision (zero paid AI) |

---

## 5. Open owner items (collected once)

1. D-1: approve #2738/#2739 merge as applied (or record why they were applied ahead).
2. D-3: confirm who implements the reissue concurrency guard (RED, approval by name).
3. D-7: RED #2816.
4. Merge decisions: #2840 (zero paid AI), #2839 (restore doc), #2844 (legal), #2842 (legal draft).
5. D-8: translation source for the 5 inactive locales.
6. Parked (do not re-ask): `prod-qa-invited-provision`.
7. Workspace default theme (public is light since #2849; workspace still dark).
8. Supabase dashboard: enable leaked-password protection (security advisor WARN).

## 6. How to update

Edit §2/§3 in the same PR as the work. Keep it a snapshot: delete `DONE` rows older
than 14 days (they live on in git history and the tracker). Date the §3 heading.
