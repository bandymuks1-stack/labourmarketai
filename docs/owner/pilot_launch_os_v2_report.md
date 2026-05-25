# Pilot Launch OS v2 — Owner Report

Branch: `feat/pilot-launch-os-v2`
Base: `origin/main` @ `89d218a` (post-PR #67)
Date: 2026-05-25

## What ships

A single sprint covering operations, policies, communication, sports-team vocabulary, premium-visual direction, in-app pilot readiness, organisation-profile audit, and admin command-center extensions.

### Phase 0 — Baseline
- `docs/owner/pilot_launch_baseline_v1.md` — main SHA, deploys, applied migrations, open PRs, PR #18 standing block.

### Phase 1 — Tester operations docs (4 files)
- `docs/pilot/TESTER_START_HERE_LT.md` — short, plain, human onboarding for testers (no corporate walls).
- `docs/pilot/TESTER_START_HERE_EN.md`
- `docs/pilot/OWNER_TEST_SESSION_SCRIPT_LT.md` — owner can paste this directly to first testers.
- `docs/pilot/PILOT_FEEDBACK_REVIEW_PROCESS_LT.md` — daily 15-min review playbook (language_feedback → pilot_telemetry → unknown phrases → draft signals → weekly brief).

### Phase 2 — Product policies (5 files)
- `account-and-role-model-v1.md` — personal account vs worker vs organisation; roles are lenses.
- `organization-profile-creation-policy-v1.md` — two-tier (pilot exploration / serious operation); rekvizitai required at Tier 2; no fake companies; multi-org / multi-country.
- `pilot-terms-and-responsibility-v1.md` — what testers are agreeing to + platform commits.
- `risk-monitoring-and-fraud-response-v1.md` — manual-review-first; admin doesn't routinely read private bodies.
- `journal-evidence-and-correction-policy-v1.md` — supersede semantics + correction-request flow + hash chain.

### Phase 3 — Communication v1 (migration + UI)

> **Naming note (revised in-PR after the pre-apply production diagnostic):**
> The v1 message table is **`conversation_messages`**, not `messages`.
> Production already contained a legacy `public.messages` chain
> (`messages` → `threads` → `matches` with `thread_id` / `sender_id` /
> `sent_at` columns, RLS via a `can_access_thread` `security definer`
> helper) that predates this repo's migration ledger. It is empty
> (0 rows) and not referenced by current app code. To avoid an
> impossible-to-cleanly-apply collision, the v1 message table was
> renamed to `conversation_messages`. The legacy chain is left
> untouched and will be reviewed in a separate, careful retirement
> slice.

- **Migration `0021_communication.sql`** — adds `conversations`, `conversation_participants`, `conversation_messages` + `is_conversation_participant(uuid)` helper (security invoker). RLS: SELECT participants-or-admin; INSERT conversation_messages requires `author_id = auth.uid()` AND participation; participants update only their own `last_read_at`; conversation_messages append-only. Grants to authenticated only.
- **Server action `lib/communication/actions.ts`** — `createConversation` / `sendMessage` / `markConversationRead`, tagged-result, no service_role, precise LT/EN error mapping (including RLS denial → "Negalima rašyti šiame pokalbyje").
- **Pages** —
  - `/[locale]/dashboard/communication` (thread list, RLS-scoped).
  - `/[locale]/dashboard/communication/[conversationId]` (thread detail + composer + `MarkReadOnMount`).
- **`CommunicationComposer`** — plain textarea + send. No file upload. No fake delivered/read indicators. Telemetry events: `communication_message_send_clicked` / `communication_message_sent` / `communication_message_send_error`.
- **LT + EN copy** — full `communication.*` namespace with v1Notice ("v1: messages update on page refresh, not real-time").

### Phase 4 — Sports-team operating model
- `docs/vision/company-as-sports-team-model-v1.md` — vocabulary map (team / player / lineup / bench / match / scout / trophy) and the explicit "this is doc-only, no schema rename" stance.
- `docs/audit/team-management-gap-audit-v1.md` — what exists today, what's missing, and the smallest safe next implementation slice (roster card on company / agency dashboard).

### Phase 5 — Visual design direction
- `docs/design/visual-upgrade-mission-control-v1.md` — premium dark surfaces, module cards over widgets, live core indicator, system-level typography. 3-5 high-impact routes ordered by ROI/risk (admin command center first; dashboard second; profile / communication / workspaces later). Implementation strategy: one route per PR with before/after screenshots; **no global redesign in this PR**.

### Phase 6 — In-app pilot readiness card
- `apps/web/components/app/pilot-readiness-card.tsx` — server component, mounted above the journey rail on the worker dashboard. Surfaces "Bandomoji versija" badge + body + a Conversations link + the feedback-widget hint + a privacy note pointing to the policy doc.

### Phase 7 — Organisation profile creation audit
- `docs/audit/organization-profile-creation-gap-audit-v1.md` — data-model gaps (no `registration_code`, no `correspondence_address`, no multi-country support) + three proposed implementation slices (A copy warning, B rekvizitai migration, C Tier-2 gate). All deferred to focused follow-up PRs.

### Phase 8 — Agent OS command center
- `/lt/dashboard/admin/agent-os` extended with a live counts panel ("Pilot command center"): events 24h, errors 24h, language reports open, drafts total. Pulled via admin RLS from `pilot_events` / `language_feedback` / `pilot_drafts`. Honest "—" placeholder when a table is missing.
- `/lt/dashboard/admin` hub gets a fourth tile linking `/dashboard/communication`.

## Required checks

| Gate | Result |
|---|---|
| `pnpm -F web lint` | green |
| `pnpm -F web typecheck` | green |
| `pnpm -F web test` (vitest) | **545 / 545** passed (29 files) |
| `pnpm -F web build` | green |

New guards:
- `lib/guards/communication-migration-0021.test.ts` — three tables exist + RLS enabled + participant-scoped policies + messages append-only + helper is `security invoker` + grants only to `authenticated` + actions never use `service_role` + composer never uploads files + UI never RENDERS fake delivered/read/typing.
- `lib/guards/pilot-launch-docs.test.ts` — every Phase 0-7 doc exists at its expected path + content sanity (organisation policy mentions multi-org/multi-country/no-fake-companies; pilot terms enumerates what the platform does NOT commit to; vision doc maps sports terms to product schema; design doc lists the high-impact routes).
- `lib/guards/product-readiness.test.ts` SPRINT_BASELINE bumped 20 → 21 with rationale.

## Safety proof

- Migration 0021 ships but **NOT auto-applied to production** (per `CLAUDE.md`).
- Additive only — no DROP / no ALTER drop / no DELETE FROM.
- No `service_role` runtime client. Communication helper + actions + admin pages all use the user-scoped supabase client + RLS.
- No env / secrets / billing / Vercel changes.
- No external analytics SDK.
- No keystroke logging, screen recording, hidden tracking.
- No raw journal / profile / CV / comment text added to telemetry.
- No fake AI / matching / verified / confirmed claims.
- Communication is **never public** — RLS participant-scoped + admin-only fallback + auth-gated `/dashboard` tree.
- Admin pages all `requireSuperadmin(locale)` server-side AND RLS admin-only.
- **PR #18 untouched.**

## Migration apply (owner action)

Use the standing `/goal Supabase production migration check` flow on `0021_communication`. Until applied, the communication pages render an empty list / error banner cleanly; the rest of the app keeps working.

## Owner smoke checklist (after applying 0021)

1. Login as a tester on production. Verify the dashboard now shows the **Bandomoji versija** card above the journey rail.
2. Open `/lt/dashboard/communication` — should be empty for a fresh tester. Render is clean.
3. As admin (via SQL or another route), insert a conversation + add the tester as participant. They see it on next refresh.
4. From the thread detail page, send a message. Verify it appears for the participant.
5. As admin, open `/lt/dashboard/admin/agent-os`. The new **Pilot command center** panel shows live counts for events/errors/language reports/drafts. "—" appears if the underlying table is missing.
6. Open `/lt/dashboard/admin` hub — verify the **Pokalbiai** tile links to the communication list.
7. Switch to non-admin, hit `/lt/dashboard/admin/*` URLs — expect redirect to `/lt/dashboard`.

## What testers can do now

✅ Tester signup, profile/CV save, Work Journal create/edit/delete, language feedback, draft saves, all already shipped.
✅ Conversations: read incoming messages, reply, mark-read pulse, see unread badge.

## What is deferred (intentionally)

- Visual uplift implementation slices (Phase 5 doc-only; each route lands as a focused PR per `docs/design/visual-upgrade-mission-control-v1.md`).
- "Roster / lineup" UI on company/agency dashboards (Phase 4 audit's slice A; needs its own PR).
- Rekvizitai migration + Tier-2 gate (Phase 7 audit's slices B & C).
- Communication: starting a new conversation from the UI (composer exists for sending; thread-creation launcher is a separate slice).
- Communication: pretty layout / 3-column desktop (Phase 5 implementation backlog item).
- Status flips on the language-feedback / pilot-telemetry inboxes (still read-only v1).
- PR #18 — manager confirmation backbone.

## Final command for the owner

```
/goal Supabase production migration check for PR #<NN> migration 0021_communication.
First read-only verify whether conversations + conversation_participants + conversation_messages
tables exist, RLS enabled, participant-scoped SELECT, append-only messages, no public
exposure. If missing and safe production access is available, ask for --apply before
mutating. After apply, re-run verifier and report live state.
```
