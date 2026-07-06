# Owner-Decision Execution Report v1 — combined run of 2026-07-06

Final report of the combined owner-decision execution run performed on
2026-07-06. Every claim below was re-verified against `git log`,
`gh pr view`, and the files on `origin/main` at commit `0365318` before
this report was written. This document changes no product code; it only
records the true final state.

## Merged PRs in this run

| PR | Branch | Squash SHA | Title |
|---|---|---|---|
| [#671](https://github.com/bandymuks1-stack/labourmarketai/pull/671) | `docs/mobile-store-assets-execution-final-v1` | `af11a0c4ee0305d6845b6e41b2a8c940c79a885d` | docs(mobile): store-assets execution pack final v1 — owner decisions locked, SW owner-gated |
| [#672](https://github.com/bandymuks1-stack/labourmarketai/pull/672) | `docs/landing-visual-replacement-implementation-plan-v1` | `cc80eb5f698894e178fd0124db5424391ca7845b` | docs(marketing): landing visual replacement implementation plan v1 |
| [#673](https://github.com/bandymuks1-stack/labourmarketai/pull/673) | `feat/conversation-source-relation-v1` | `036531805e28b11aebc5ba6852ce0a23d8ea98b4` | feat(conversations): conversation source relation v1 — human-gate approved |

All three are `MERGED` (confirmed via `gh pr view` on 2026-07-06).

## 1. MFA — BLOCKED (owner action required), honestly not started

- The Supabase TOTP toggle for project `gorgitwvdzxbnaxhrsrw` is **not
  confirmed enabled**. There is no client API to read the toggle state
  from the session side, and a direct network probe was
  permission-denied, so no session-side verification was possible.
- **No enrollment UI was built. No fake MFA exists anywhere in the
  product.** Nothing pretends MFA is available while the backend toggle
  is unverified.
- Unblock path (owner):
  1. Flip the TOTP toggle and verify it per
     `docs/security/mfa-totp-toggle-verification-v1.md` (merged in #667).
  2. Then issue the command:
     `implement feat/mfa-enrollment-benefit-ui-v1 per docs/security/mfa-enrollment-readiness-pack-v1.md`.

## 2. Conversation source relation — LIVE end to end

- PR #673 `feat/conversation-source-relation-v1` merged (squash SHA
  `036531805e28b11aebc5ba6852ce0a23d8ea98b4`) after explicit owner
  review and authorization. The migration header carries
  `-- @human-gate-approved`; migration-safety CI was green.
- Migration `supabase/migrations/20260706210000_conversation_source_relation.sql`
  was **APPLIED to production** via Supabase MCP. Production migration
  ledger entry: version `20260706203715`, name
  `20260706203715/20260706210000_conversation_source_relation`.
- Production-verified shape:
  - Nullable `source_type` on `public.conversations` with a closed
    4-type CHECK constraint: `scouting`, `accepted_service_request`,
    `demand_interest`, `accepted_booking`.
  - Nullable `source_id` on `public.conversations`.
  - `conversation_source_context(uuid[])` — SECURITY DEFINER,
    `search_path=public`, stable.
  - Grants: `authenticated` EXECUTE only; `public` and `anon` revoked.
  - An unauthenticated call over real conversation ids returned 0 rows
    — participant scope proven at fire time.
  - All existing rows have NULL source columns — forward-only behavior
    proven (no backfill, no rewrite of history).
- Rollback exists:
  `supabase/rollbacks/20260706210000_conversation_source_relation.down.sql`
  — drops the RPC and the two columns only, nothing else.
- App side:
  - Exactly 4 sanctioned callers stamp the source, each only after its
    own existing gate has held.
  - The communication UI shows a source line with a link-back where
    context exists; threads without context render the neutral card.
  - Honest-degradation fallbacks for `42703` (missing column → plain
    no-source insert) and `42883` (missing RPC → empty context map).
  - i18n: LT/EN/RU keys under `communication.source.*`.
  - Guard suite: `apps/web/lib/guards/conversation-source-relation.test.ts`
    — 38 executed tests (33 declarations, two loop-expanded blocks over
    the 4 relations and 3 locales) covering the closed type set,
    insert-only stamping, migration safety markers, grants, rollback
    scope, reader degradation, UI rendering, and i18n presence.

## 3. Mobile store assets — repo-side COMPLETE, owner inputs pending

- PR #671 (`af11a0c`) locked the owner decisions into
  `docs/mobile/mobile-store-assets-execution-pack-v1.md`:
  - PWA-first; Android TWA first; Capacitor/iOS deferred.
  - Service worker gated on offline-strategy approval.
  - A 12-step run-order table for the full store submission.
- Owner-remaining inputs (nothing repo-side can proceed without them):
  icon art decision, maskable-icon approval, offline-strategy approval,
  screenshot approval + review, Play metadata approval, support
  contact, feature graphic, Play Console account, TWA signing key,
  data-safety questionnaire answers.
- **No store submission was performed.** No placeholder or fake assets
  were generated or committed.

## 4. Landing replacement — plan READY, live edit not started (by design)

- PR #672 (`cc80eb5`) merged
  `docs/marketing/landing-visual-replacement-implementation-plan-v1.md`:
  - 11-position layout plan grounded in the current code.
  - A fake→honest replacement table mapped to the real files.
  - A 4-slice PR train (PR-A = hero + capability strip first).
  - Guards, including a new landing-no-fake-counter assertion set.
  - LT/EN headline shortlist carried from the presentation model.
  - §7 contains the self-contained future implementation command.
- **No landing or public marketing file was touched in this entire
  run** — this is by design, per the plan's explicit non-edit note.
- Unblock path (owner): pick a headline from §3 of the plan and
  green-light with the §7 command; the screenshot capture session is
  shared with the store-assets pack.

## 5. Production DB apply status (project `gorgitwvdzxbnaxhrsrw`)

Two migrations total were applied to production on 2026-07-06:

| Migration | Ledger version | Run |
|---|---|---|
| privacy_request_intake | `20260706160157` | earlier run this day |
| conversation_source_relation | `20260706203715` | this run |

Nothing else was applied. Nothing is pending: future MFA work needs no
migration, and the future landing work touches no DB.

## Owner actions remaining — exact next commands

1. **MFA:** flip + verify the Supabase TOTP toggle per
   `docs/security/mfa-totp-toggle-verification-v1.md`, then command:
   `implement feat/mfa-enrollment-benefit-ui-v1 per docs/security/mfa-enrollment-readiness-pack-v1.md`
2. **Store pack:** work through the owner rows in
   `docs/mobile/mobile-store-assets-execution-pack-v1.md` (icon art,
   maskable approval, offline strategy, screenshots, Play metadata,
   support contact, feature graphic, Play account, TWA signing key,
   data-safety answers).
3. **Landing:** pick a headline and issue the green-light command from
   `docs/marketing/landing-visual-replacement-implementation-plan-v1.md` §7.
4. **Optional cleanup:** delete leftover deregistered worktree folders
   `C:\Users\Mano\Documents\labourmarketai-wt-*` (inert `node_modules`
   residue only; no live state).

## Honest-state rules note

This run followed the repo's honest-state doctrine throughout: no fake
MFA (no UI shipped while the backend toggle is unverified), no fake or
placeholder store assets, no fake landing data (the no-fake-counter
guard is part of the planned train), and no synthetic data written to
production. Where the system cannot verify a capability (missing
column, missing RPC, missing toggle), it degrades honestly instead of
pretending.
