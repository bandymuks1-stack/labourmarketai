# Launch blocker burn-down v1

> Generated 2026-07-06. Baseline: `origin/main` @ **d18a8ae** (autonomous
> train #658–#665 merged on top of the quality train #646–#657).
> **Docs only — no code, no migrations, no landing/marketing files
> touched.**
>
> This is the DELTA companion to the launch-readiness status board
> (`docs/launch/launch-readiness-status-board-v1.md`, PR #658): what
> stopped being a blocker since the board was written, what is left, and
> the exact owner commands that unblock each remaining item. The board
> stays the canonical "full picture" document — this file does not repeat
> its tables. If this file and a newer PR disagree, the newer PR wins.

---

## 1. No longer a blocker (closed by #658–#665)

Everything below merged to `main` after the board's baseline (`db7b1b3`):

| Was | Closed by | What changed |
|---|---|---|
| No single current picture of launch state; every agent re-audited from scratch | #658 `de03bc0` | Launch-readiness status board v1 (`docs/launch/launch-readiness-status-board-v1.md`) — done vs owner-gated vs safe next work, in one file |
| Stale public legal copy claimed data exports don't exist (board §8 "stale public legal copy" item) | #659 `bc8bebd` | `legal.privacy` + `legal.dataProtection` copy corrected in LT/EN/RU to match the live self-service export; a stale-claim guard now pins it. Fixed as an honesty correction in legal i18n keys only — **no landing/marketing pages were edited**, and owner-voice privacy-policy wording remains owner-gated (§4 below) |
| Store-asset work had no owner-workable package (board §6 steps 1–2 were prose) | #660 `ac053a2` | Mobile store assets owner pack (`docs/mobile/mobile-store-assets-owner-pack-v1.md`): exact icon specs, maskable rules, listing drafts, TWA commands, and a 9-item owner checklist. The *research/spec* work is done; only the owner inputs remain (§5 below) |
| Conversation source-relation decision required re-research at decision time | #661 `c04d349` | Owner review pack (`docs/launch/conversation-source-relation-review-pack-v1.md`): verified caller map with file paths, RLS constraints, rollback + test plan. Decision is now one yes/no read (§2 below) |
| Notification spine had thinner regression cover | #662 `2f33bb5` | Spine guards expanded 15 → 30 tests (catalogue integrity, seen-writer wiring, badge honesty). **No defects found** — the spine is as honest as the board claimed |
| Route smoke covered 22 routes (board §10 item 3 asked for more) | #663 `7eb7774` | Primary route smoke expanded 22 → 35 authenticated routes (13 new in-app surfaces) |
| MFA enrollment PR had no ready-to-execute plan; owner action was buried in a long model doc | #664 `59c96d7` | MFA enrollment readiness pack (`docs/security/mfa-enrollment-readiness-pack-v1.md`): verified current state, the ONE owner toggle (Supabase TOTP), SDK flow, UI states, LT/EN/RU copy drafts, guards, rollback. **MFA is NOT live and not claimed to be** (§2 below) |
| Booking lifecycle had thinner regression cover | #665 `d18a8ae` | Booking lifecycle guards expanded 12 → 24 tests + full transition matrix + expired-status honesty. **No defects found** |

Also standing from the earlier trains (see board §1–§2 for the full list):
audit PR train #640–#645, quality train #646–#657, and the
`booking_requests_seen` migration already **applied to production** —
do not re-apply.

Net effect: the *investigation and preparation* side of the launch-blocker
list is exhausted. Every remaining blocker is now either an owner decision
with a ready decision package, or clearly-scoped technical work.

## 2. Owner-gated — decision packages ready (read → decide → done)

Each of these is one owner read + one decision. No agent research remains.

| # | Decision | Ready package | Owner action |
|---|---|---|---|
| 1 | Privacy-request intake RPC | PR #653 (draft) + `docs/compliance/privacy-requests-v1.md` | Review SQL, add `-- @human-gate-approved`, mark ready, merge, apply via Supabase MCP (see §7.1) |
| 2 | Conversation source relation — yes/no | `docs/launch/conversation-source-relation-review-pack-v1.md` (#661) | Read §"decision statement" at the bottom; answer yes/no. If yes, a dedicated migration PR follows (still owner-gated at apply time) |
| 3 | MFA enrollment | `docs/security/mfa-enrollment-readiness-pack-v1.md` (#664) | Flip the Supabase TOTP toggle (see §7.2) + approve the LT/EN/RU copy drafts in the pack; then the enrollment PR is a mechanical slice |
| 4 | Store assets | `docs/mobile/mobile-store-assets-owner-pack-v1.md` (#660) | Supply ≥1024px icon source art (or approve mechanical export of `app-icon.svg`), approve LT/EN listing drafts, pick the support contact |
| 5 | Landing replacement model | `docs/marketing/landing-replacement-model-v1.md` (#657) | Approve the model (+ pricing pilot paragraph wording); then one implementation PR per surface |
| 6 | Full consolidated decision list (10 items) | Board §9 | Items 7–10 of the board (demand pipeline, dormant locales, naming merge, legal-copy owner wording) are lower-priority and unchanged |

### 2.1 PR #653 state — verified live 2026-07-06

`gh pr view 653 --json state,isDraft` returns `state: OPEN`,
`isDraft: true` ("feat(privacy): DRAFT privacy-request intake RPC —
needs-human-gate"). Unchanged: still a draft, still owner-gated, NOT
merged, NOT applied. Its worktree (`../labourmarketai-wt-migration`)
belongs to that draft — do not touch it. The deletion-request form on
`/dashboard/privacy` continues to degrade honestly ("not accepted yet")
until this is applied.

## 3. Still technical work (safe autonomous candidates, no owner input)

Carried over from board §10, minus what #662/#663 already delivered:

1. **Service-worker offline PR** — policy already decided (cache static
   assets + honest offline fallback, never authed HTML). Unblocks the Play
   quality bar later, improves PWA now. Update the `pwa-baseline` guard
   pins in the same PR. This is the highest-value remaining autonomous
   slice.
2. **Consent list in settings** — read-only section rendering the consent
   flags already stored (gdpr-readiness §6.3). Ordinary RLS reads.
3. **Remaining guard extensions** (audit §15): anchor-target existence,
   undefined-class scan, interactive-style-requires-handler lint.
   (Route-smoke expansion is done — #663.)
4. **i18n-debt ratchet extension** to all dormant locales
   (`TRACKED_LOCALES` currently da/de only) — debt visibility, no copy
   changes.
5. **Stale draft close/keep recommendation** — #516, #511, #510, #507,
   #486 (historical docs/audit drafts) and #379 (old RED-migration feature
   draft) are largely superseded by the merged trains. An agent may write
   a per-PR close/keep recommendation; closing is the owner's call.

## 4. Legal/privacy gated

Delta since the board (§8): the stale "no export bundle" claim inside the
in-app legal i18n copy is FIXED (#659). What remains is unchanged:

- **Erasure intake**: blocked on PR #653 (§2.1). The deletion itself stays
  a manual owner action after identity verification; automation is a
  separate lawyer-aware PR.
- **Lawyer items (⚖️, all open)**: lawful-basis confirmation per data
  class, processor list/DPA sufficiency, breach-notification thresholds,
  third-party names in journal entries, append-only correction model in
  privacy copy.
- **Privacy-policy wording** is owner voice — agents do not draft it.
- Any *public marketing-page* privacy claims fall under §6, not here.

## 5. Store/asset gated

Delta since the board (§6): steps 1–2 now have an exact owner pack (#660);
nothing is submitted, no wrapper exists. Remaining, in order:

1. Owner: icon source art decision + listing drafts approval + support
   contact (pack §1, §4 — the 9-item checklist).
2. Agent (after 1): mechanical PNG icon PR + manifest entries +
   apple-touch-icon link + guard update.
3. Agent (any time): service-worker PR (§3.1 above — Play quality bar).
4. Owner-only: Play developer account + signing key → `assetlinks.json` →
   Bubblewrap TWA build → internal testing → listing approval.
5. Screenshots must show REAL product states — guard pins no `screenshots`
   manifest field until real ones exist.

iOS App Store remains DEFERRED by decision; add-to-home-screen is the iOS
story.

## 6. Landing / public-marketing gated

**Unchanged since the board (§5) — nothing was touched, deliberately.**
The R4 fake-numbers inventory is still live on the public site (animated
fake counters, ~90 fake map tooltips, fake demand/agency cards, the
"Dar nepradėjome veiklos…" pricing FAQ sentence, internal jargon leaks).

The replacement model (#657, `docs/marketing/landing-replacement-model-v1.md`)
is approved-pending-owner. Per repo rules, agents must not edit landing/
public marketing pages autonomously even to remove fake numbers. After
owner approval: one implementation PR per surface, keeping
`placeholders:check` and the honesty-copy guards green with LT/EN/RU
parity.

## 7. Recommended next owner commands (exact, in order)

The highest-leverage 30 minutes of owner time, in sequence:

### 7.1 Unblock privacy-request intake (PR #653) — ~10 min

```bash
gh pr view 653 --web        # read the SQL + PR body checklist
# In the PR's migration file, confirm the SQL is the twin of the approved
# help-request RPC (20260705260000), then add the human-gate marker:
#   -- @human-gate-approved
gh pr ready 653
gh pr checks 653 --watch
gh pr merge 653 --squash
# Then apply the migration via Supabase MCP per the PR body's apply flow
# (never `db push`). Post-apply verification steps are in the PR body.
```

### 7.2 Enable MFA TOTP (Supabase dashboard) — ~2 min

1. Supabase dashboard → project `gorgitwvdzxbnaxhrsrw` → **Authentication
   → Multi-Factor Authentication**.
2. Enable **TOTP (App Authenticator)** only (free plan; do NOT enable
   Phone/SMS).
3. Leave "maximum enrolled factors" at default (10).
4. Reply "TOTP enabled + copy approved" (copy drafts are in the pack §
   copy section) → the enrollment PR proceeds as a mechanical slice.

Reference: `docs/security/mfa-enrollment-readiness-pack-v1.md`.

### 7.3 One yes/no: conversation source relation — ~5 min

Read `docs/launch/conversation-source-relation-review-pack-v1.md`,
answer the decision statement at the bottom (yes/no). If yes, a dedicated
migration PR follows and comes back to you for the apply gate.

### 7.4 Store assets inputs — ~10 min

Work the 9-item checklist in
`docs/mobile/mobile-store-assets-owner-pack-v1.md`: icon source decision,
LT/EN listing draft approval, support contact.

### 7.5 Landing replacement approval — read when ready

Read `docs/marketing/landing-replacement-model-v1.md` and approve/edit the
model + pricing pilot paragraph. This is the single biggest public-trust
item (it removes the fake counters and the "we haven't started operating"
sentence), but it needs your wording judgement — no command, just the
read + approval.

### Suggested reading order (if time-boxed)

1. `docs/launch/launch-readiness-status-board-v1.md` (the full picture)
2. This file (what changed + your exact commands)
3. PR #653 body (§7.1)
4. `docs/security/mfa-enrollment-readiness-pack-v1.md` (§7.2)
5. `docs/launch/conversation-source-relation-review-pack-v1.md` (§7.3)
6. `docs/mobile/mobile-store-assets-owner-pack-v1.md` (§7.4)
7. `docs/marketing/landing-replacement-model-v1.md` (§7.5)

---

## 8. Honesty footer

- Nothing in this document claims launch readiness. The authenticated
  product's known blockers are owner decisions, not missing code; the
  public site still overstates live activity until §6 is resolved.
- The two guard-expansion PRs (#662, #665) found **zero defects** — that
  is regression insurance, not new capability, and is reported as such.
- Keep-current rule from the board applies here too: update this file in
  the same PR that changes any status above, instead of re-auditing.
