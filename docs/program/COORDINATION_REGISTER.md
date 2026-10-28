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
| live sends (e-mail to real people) | **CLOSED — no further run until D-3 hardening is approved** | 2026-10-28 05:46Z | partner referral reprocess finished: 48 invitation mails / 48 distinct recipients (ledger), 0 addresses mailed on two rows; 15 rows still `pending/not_sent` |
| deploy | — serial via `deploy-vps.yml` — | | production = `c3f440f` (#2843, #2849, #2850), deployed 2026-10-28 05:34Z |

---

## 3. Work register — snapshot 2026-10-28 ~06:00Z

Sources: GitHub PRs/Actions, production migration ledger, session list and
transcripts readable from the coordinator session. Status per §1.4.

### 3.1 Active executors

| Session | Where | Doing | State |
|---|---|---|---|
| `session_016CYcDuhGGEA75ruJ3zXD99` "projekto perėmimas" | owner's computer | platform functional + UX audit (owner order 04:48Z): Work Journal, Living CV, profiles, calendar, mobile/design, 11 languages; RED-draft conflict upkeep | IN_PROGRESS |
| `session_011vBC1iAygGqFo3aoB76NrV` "darbų perimimas" | owner's computer | received the same coordinator order as the cloud coordinator (see D-6): D-1 proof, #2839/#2840 review, company-governance QA root cause, QA-evidence recovery | IN_PROGRESS |
| `session_011vBC1hnVKqGvExp129bfjT` coordinator | cloud | this register; D-1 and D-3 evidence; QA-evidence recovery (read-only) | IN_PROGRESS |
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
| #2843 | never re-mail an address from an older duplicate referral (RED) | `…AygGqFo3` | DONE | live `c3f440f`; sends finished 05:46Z; DB-level hardening still open (§4 D-3) |
| #2849 | public site opens light; one-sentence sign-up intro (11 locales) | `…16CYcDu` | DONE | live `c3f440f`; post-deploy visual check 320/375/768/1280 not yet recorded |
| #2850 | this coordination register | coordinator | DONE | live `c3f440f` |
| #2844 | synthetic data instead of personal e-mails in tests/docs (touches legal docs) | unknown | WAITING (OWNER — legal wording) | — |
| #2840 | zero paid AI budget — metered providers off unless owner opens | reviewed by `…AygGqFo3` | WAITING (merge `main` in, re-run CI) | CI green on a 2026-10-27 base (10 commits behind); env flag unset on VPS → defaults to off, same as today |
| #2839 | DB restore procedure doc (docs only) | reviewed by `…AygGqFo3` | WAITING (merge) | CI green 2026-10-27; no runtime effect |
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
| D-1 | **Production holds `project_forecasts_v1` (ledger `20261025045152`) and `history_period_precision_and_registry_v1` (`20261025050302`) but `main` has neither file**; their PRs #2738 / #2739 are still RED drafts. No `APPLIED_LEDGER.md` entry on `main`. **Proven identical (2026-10-28, independently by the coordinator and by `…AygGqFo3`):** md5 of the production statement with `--` comments and all whitespace removed equals the md5 of the branch file (`supabase/migrations/20261024130000_project_forecasts_v1.sql`, `…20261024100000_history_period_precision_and_registry_v1.sql`) after also removing its `begin;`/`commit;` wrapper — `1db83314…` and `214d501f…`. The branch files were last changed before the apply (03:37Z / 03:48Z vs 04:51Z / 05:03Z on 2026-10-25). | re-run hazard; guards on `main` don't know the objects; a third PR could collide | **Safe reconciliation (needs one owner approval naming #2738 and #2739, merge only):** merge both PRs **as-applied**, never re-apply; add `APPLIED_LEDGER.md` rows with the production versions above. #2738 also adds a `forecast-recompute` cron line, which takes effect only when the owner re-runs `lm-cron-install.sh` on the VPS. Merge them one after the other (shared guard pin files, §1.6). |
| D-2 | `market_lifecycle_closed_outcome_v1` is applied and its file is on `main`, but #2746's title still says "NOT applied". | misleading status | fix the PR title/body when #2746 is next touched |
| D-3 | #2843 referral re-mail protection. **Outcome so far (read-only, 2026-10-28 ~06:00Z):** 48 `invitation` sends in `email_send_ledger_v1` since 2026-10-27 = 48 distinct recipient hashes (hash = sha256 of salted `trim().toLowerCase()` address); 0 normalized addresses with `delivery_status='sent'` on more than one partner row; max `resend_count` = 1. So **no duplicate mail happened.** The last sends ran at 05:46Z, before the owner's "do not send" order reached any session. **What protects a future run, and what does not:** (1) `reissue_external_referral_v1` locks the row (`FOR UPDATE`) and refuses `delivery_status='sent'`, but the row is marked sent only after the mail goes out, so two overlapping runs could both reissue and mail the same row (bounded by `resend_count < 3`); (2) the cross-row rule "one mail per address" exists only in `external_referral_reprocess_candidates_v2` + TypeScript, **not inside the reissue function**; (3) **no `flock` in the repo** — `ops/vps/lm-referral-reprocess.sh` calls the route directly, and the route has no in-process lock; serialization depended on the operator running one step at a time; (4) no concurrency test exists. | a future or overlapping run could mail one address twice | **Live-send lane closed (§2)** until a RED follow-up (owner approval naming it) adds, inside `reissue_external_referral_v1`: `pg_advisory_xact_lock(hashtext(lower(trim(invited_email))))`, a refusal when any partner row with the same normalized address is `sent` or has `last_sent_at` within 24 h, and a concurrency test; plus `flock -n` in `lm-referral-reprocess.sh`. Owner rule "the session that started a fix finishes it" → proposed to `…AygGqFo3`. |
| D-4 | Both active sessions edit the same migration pin/guard files (`APPLIED_LEDGER.md`, `booking-engagement-end-v1.test.ts`, baseline guards). #2846 and #2843 already conflicted. | merge conflicts | §1.6 lane rule |
| D-5 | Two read-only platform audits are running at once (one per active session). | duplicated effort | split by area: `…16CYcDu` = Journal/CV/profiles/calendar/mobile/languages; `…AygGqFo3` = orders/search/marketplace/notifications/payments/permissions |
| D-6 | **The 2026-10-28 coordinator order reached two sessions** (cloud coordinator and `…AygGqFo3`); both started D-1, #2839/#2840, company-governance and QA-evidence recovery within minutes. The cloud coordinator cannot message sessions on the owner's computer (platform trust rule). | duplicated work; two writers on this file | until the owner decides: `…AygGqFo3` keeps company-governance and #2839/#2840 (it has VPS and `gh` access); the cloud coordinator does not start those and keeps D-1/D-3 evidence and this register. A second writer of this file merges `main` in first. |

---

## 5. Open owner items (collected once)

- Approve or reject each RED draft individually (§3.3); D-1 and D-3 first.
- `prod-qa-invited-provision` dispatch — parked by owner 2026-10-28; do not re-ask.
- `GOV-1` read-only DB secret for CI gates; product-truth owner decisions ORG-2,
  EVID-2, MKT-7, COM-6, COM-8 (see `product-truth.mjs`).
- Stale PR keep/close (§3.4).

## 6. How to update

Edit §2/§3 in the same PR as the work. Keep it a snapshot: delete `DONE` rows older
than 14 days (they live on in git history and the tracker). Date the §3 heading.
