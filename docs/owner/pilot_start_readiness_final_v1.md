# Pilot Start Readiness — Final v1

Date: 2026-05-25
Branch: `feat/pilot-readiness-closure-and-sales-v1`
Base: `origin/main` @ `d15eba3` (post-PR #68)

## Verdict: testers can start

Every critical pilot flow is live on production. The remaining work (org Tier 2 verification, communication launcher UI, sports-team roster card, visual uplift) is for product depth, NOT for blocking first testers.

## Live production state

| Migration | Applied | Notes |
|---|---|---|
| 0017 productivity_units seed + journal RPC | yes (`20260525052545`) | journal save FK ladder complete |
| 0018 journal correction lifecycle | yes (`20260525061459`) | edit-supersede + soft-delete RPCs |
| 0019 language_feedback | yes (`20260525074126`) | admin inbox live |
| 0020 pilot_events | yes (`20260525092209`) | telemetry recording |
| 0021 communication | yes (`20260525102714`) | conversations / participants / conversation_messages (legacy `messages` chain left untouched) |
| All current main code | deployed via Vercel auto-deploy after PR #68 merge | confirmed at sprint start |

## Pilot Start Checklist surface

A live **Pilot Start Checklist** card now sits on `/lt/dashboard/admin/agent-os` showing six "has been observed" signals pulled from the live DB:

1. Login (Google OAuth start events).
2. Work Journal saves.
3. Language reports received.
4. Pilot telemetry recording (last 24h).
5. Company / agency / buyer drafts saved.
6. Conversation messages relayed.

Each row reads ✓ when at least one signal has landed, `·` when nothing yet, `—` when the underlying table isn't applied (defensive against migration drift). Count on the right is the lifetime total.

## Admin visibility audit — clean

Verified that non-admin users never see admin-only links / cards / routes in normal UI:

- `role-switcher.tsx` is the only place rendering a `/dashboard/admin` link, and it's gated behind `isAdmin`.
- `bottom-nav.tsx`, `dashboard-tabs.tsx`, `account-menu.tsx` — zero admin references.
- `agent-os`, `pilot-telemetry`, `language-feedback` route links only render INSIDE the admin tree (which is `requireSuperadmin`-gated).
- Direct URL access to any `/dashboard/admin*` route by a non-admin → server-side redirect to `/dashboard` via `requireSuperadmin(locale)`. RLS double-gates the data layer (SELECT policies use `is_admin()`).

## Auth state

- **Google OAuth** is healthy on production (per the recent `mcp__claude_ai_Supabase__get_logs` window: every PKCE login completed 200/302; zero `redirect_uri_mismatch`, zero `exchange_failed`).
- **Trace ids** (PR #66) wired through GoogleButton → callback → login form, so any future failure correlates across browser console / Vercel logs / Supabase auth log.
- **Preview-host detection** shows a clean LT/EN notice on Vercel preview deployments (Google sign-in not configured for preview origins; testers point at production).

## Communication v1 state

- All three tables live (`conversations`, `conversation_participants`, `conversation_messages`).
- Read-and-reply path works end-to-end: thread list page + thread detail page + composer + `MarkReadOnMount` honest "opened" timestamp.
- **No** thread launcher in UI yet — admin seeds conversations via SQL today. UI launcher = next sprint (PR β).
- No fake delivered/read/typing indicators. Honest "messages update on page refresh" notice in the v1 banner.

## Org profile creation state

- Tier-1 (pilot exploration) currently works: any tester can switch into company / agency / buyer workspace and save a private draft. Drafts are RLS-scoped to the owner.
- **No** copy warning yet before role-switch / draft entry — coming in PR β.
- Tier-2 (rekvizitai-required for serious use) NOT built; full plan in `docs/audit/organization-profile-creation-gap-audit-v1.md`.

## What's deliberately deferred

- Visual mission-control implementation slices (`docs/design/visual-upgrade-mission-control-v1.md` is the north-star; each route lands as a focused PR).
- Sports-team roster card on company/agency dashboards (`docs/audit/team-management-gap-audit-v1.md`'s slice A — its own PR).
- Org Tier-2 migration + verification gate (Workstream E's P2/P3/P4 — separate PRs).
- Risk-signal catalog implementation (Workstream G — docs only first).
- Full live agent runtime (Agent OS v2 — docs + brief script first, runtime later).
- **PR #18** — manager confirmation backbone, untouched per standing block.

## Sales packaging

Four owner-ready docs land in this PR:

- `docs/sales/pilot_offer_v1_LT.md` — what we offer pilot testers (LT).
- `docs/sales/pilot_offer_v1_EN.md` — same (EN).
- `docs/sales/company_intro_message_LT.md` — first message to a pilot company contact.
- `docs/sales/tester_invite_message_LT.md` — first message to an individual tester.

All are honest about pilot scope (no fake marketplace promises, no guaranteed matching, no fake AI). Ready to copy-paste into email / Telegram / LinkedIn / WhatsApp.

## Owner action — next 24 hours

1. (Optional) Send the first tester invite using `docs/sales/tester_invite_message_LT.md`.
2. Login as that tester end-to-end. Use `docs/pilot/OWNER_TEST_SESSION_SCRIPT_LT.md`.
3. Open `/lt/dashboard/admin/agent-os` — verify the new **Pilot Start Checklist** card shows ✓ for the flows the tester exercised.
4. Optionally read the daily review playbook in `docs/pilot/PILOT_FEEDBACK_REVIEW_PROCESS_LT.md` and run the 15-minute loop.

## Reference

- Baseline: `docs/owner/pilot_launch_baseline_v1.md`
- Policies: `docs/policies/*.md`
- Tester docs: `docs/pilot/*.md`
- Agent OS: `docs/agent-os/*.md`
- Visual direction: `docs/design/visual-upgrade-mission-control-v1.md`
- Audits: `docs/audit/*.md`
