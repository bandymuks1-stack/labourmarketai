# Mega-sprint v2 — full project, next layer — owner report

Goal file: `C:\Users\Mano\Downloads\labourmarketai_mega_sprint_full_project_next_layer_v2.md`
Owner away during execution; PRs split into safe slices so you can review at your own pace.

## TL;DR

- **PR A (#72)** — admin visibility guard + pilot command center v2 + support smoke doc. **Open + green.**
- **PR B (this report's branch)** — profile/CV clarity card, org workspace foundation plan, sports-team roster foundation plan + tiny empty-state cards, risk signal catalog + review workflow docs, sales index, final report. **Ready to open.**
- **PR C (deferred to next slice)** — mission-control visual slice on `/dashboard/admin/agent-os`. Scoped, not started.

No production deploy. No migration applied. No autonomous merge. No outreach sent. All five doctrine red lines from the goal honoured: no surveillance, no fake AI / verification, no service_role at runtime, no PR #18 mutation, no admin/internal exposed publicly.

## Priority-by-priority

### P0 — Finish PR #71

Already merged before this sprint started. PR queue clean at session start. No-op for this run.

### P1 — Admin visibility guard (shipped in PR A)

`apps/web/lib/guards/admin-visibility.test.ts` — 3 pinning tests:

1. No JSX outside the admin tree may render `/dashboard/admin` link literals without going through an `isAdmin`-gated component. Allowlist: `role-switcher.tsx` only.
2. No admin-label literals ("Admin", "Adminas", "Pilot Command Center") in JSX outside the admin tree.
3. Every admin page entry must call `requireSuperadmin(locale)` at the top of its default export.

A `stripComments()` helper removes `//` and `/* */` blocks before scanning — earlier false-positive on `support-conversation-launcher.tsx` doc comment was the cause of one re-run.

Audit result: clean. Only `role-switcher.tsx` renders an admin link, and it's gated by the dual `isAdmin` signal (`active_role='admin'` OR `profile_roles` row tagged `admin`).

### P2 — Support chat smoke doc + telemetry sanity (shipped in PR A)

`docs/owner/support_chat_smoke_v1.md` — 5-step walkthrough you can run in ~5 minutes:

1. Tester starts a thread via the launcher pill on `/dashboard/communication`.
2. Admin sees it in `/dashboard/admin/support`, clicks Join.
3. Admin replies.
4. Tester sees reply.
5. Telemetry sanity check — events visible in `/dashboard/admin/pilot-telemetry`, no raw body text in metadata cells.

Telemetry events confirmed allowlisted: `conversation_launcher_opened`, `conversation_started`, `conversation_started_error`, `communication_message_send_clicked`, `communication_message_sent`, `communication_message_send_error`. All metadata keys go through `lib/telemetry/actions.ts` allowlist + 200-char-per-value + 2KB total cap.

### P3 — Pilot Command Center v2 (shipped in PR A)

`apps/web/app/[locale]/dashboard/admin/agent-os/page.tsx` now reads (in one `Promise.all`):

- Existing tiles (logins/journals/language reports/pilot events).
- `supportThreads` — count of `kind='support'` `conversations`.
- `conversationMessages` — count of `conversation_messages`.
- `companyDrafts`, `agencyDrafts`, `buyerDrafts` — per-type pilot draft counts.

New tiles + a drafts-breakdown line render under the existing command-center section. Pilot Start Checklist refactored to reuse the same Promise.all (no duplicate round-trip). The `pilot-readiness-closure` guard was updated to assert the checklist array literal directly (was variable-shape pinned, now key-shape pinned).

### P4 — CV / Profile clarity (shipped in PR B)

- `apps/web/components/app/profile-cv-clarity-card.tsx` — server-only step list. 5 honest steps: Apie mane / patirtis · Įgūdžiai · Darbo žurnalas · Kas paties nurodyta · Kas laukia įrodymų / išorinio patvirtinimo. No fake "100% complete" bar. No fake "verified" badge.
- Mounted on `/dashboard/profile` between the header and `<ProfileTextFirstFlow />`.
- `docs/audit/profile_cv_gap_audit_v2.md` — what the card adds, what stays deferred.
- LT + EN copy added to `messages/{lt,en}.json` under `profileCvClarity.*`.

### P5 — Organisation workspace foundation (shipped in PR B)

`docs/implementation/org_workspace_foundation_plan_v1.md` — five-phase plan:

1. Tier-1 warning ✅ shipped previously.
2. `organization_profiles` table + multi-org-per-account + `organization_countries` sibling for multi-presence.
3. Admin verification review surface.
4. Workspace permission gate keyed off `verification_status`.
5. Billing — explicitly out of scope until verified-org gating exists.

Decision recorded: NO extra status card alongside the existing `OrgTier1Warning` — it would be noise. Warning copy already covers the "Tier-2 required later" expectation.

### P6 — Sports-team roster foundation (shipped in PR B)

- `docs/implementation/team_roster_foundation_plan_v1.md` — five-phase plan (empty-state cards → `team_memberships` schema → availability → assignments → scout/recommendation).
- `apps/web/components/app/team-roster-empty-state.tsx` — single component with `variant: 'company' | 'agency'`.
- Mounted on `/dashboard/company` as **Komandos branduolys** and on `/dashboard/agency` as **Kandidatų rezervas**.
- NO fake members. NO fake stats. Card frames the future model in honest copy; that is the entire deliverable.
- LT + EN copy added under `teamRosterEmpty.{company,agency}.*`.

### P7 — Risk signal catalog + review workflow (shipped in PR B)

- `docs/policies/risk_signal_catalog_v1.md` — 5 statuses (`normal` / `needs_review` / `verification_required` / `temporarily_restricted` / `manually_confirmed_violation`), 6 signal sources (owner-tagged report, journal contradiction, org rekvizitai mismatch, auth anomalies, telemetry-detected abuse, direct admin observation), explicit "the system NEVER does X" list (no ML risk score, no auto-suspend, no public violation publication, no third-party sync, no surveillance).
- `docs/implementation/risk_review_workflow_v1.md` — full schema sketch (`profiles.risk_status` column + `risk_review_log` append-only table + `admin_set_risk_status` security-definer RPC), admin inbox shape, subject-side calm banner, 6 small follow-up PRs.

No migration shipped. Doc-only doctrine layer.

### P8 — Mission-control visual slice (DEFERRED to PR C)

Scoped but not started. Will live on `/dashboard/admin/agent-os` only — depth, glow, gradient panels, command-center HUD aesthetic. No global redesign, no nav rework, no marketing copy change. PR C task in queue.

### P9 — Sales / tester docs polish (shipped in PR B)

Audited the existing `docs/sales/*.md` (pilot offers LT + EN, company intro LT, tester invite LT). They already match the honesty doctrine. Added `docs/sales/README.md` as the discoverability index + a 5-rule "honesty rules these docs follow" checklist, so future edits don't quietly drift.

No outreach sent. No auto-send wiring. Each message stays owner-edited + owner-sent.

### P10 — Final sprint report (this document)

## Files changed in PR B

- `apps/web/components/app/profile-cv-clarity-card.tsx` — new server component.
- `apps/web/components/app/team-roster-empty-state.tsx` — new server component, variant company|agency.
- `apps/web/app/[locale]/dashboard/profile/page.tsx` — mounts clarity card.
- `apps/web/app/[locale]/dashboard/company/page.tsx` — mounts roster card.
- `apps/web/app/[locale]/dashboard/agency/page.tsx` — mounts roster card.
- `apps/web/messages/lt.json` — `profileCvClarity.*` + `teamRosterEmpty.*` keys.
- `apps/web/messages/en.json` — same keys, EN.
- `docs/audit/profile_cv_gap_audit_v2.md` — P4 audit.
- `docs/implementation/org_workspace_foundation_plan_v1.md` — P5 plan.
- `docs/implementation/team_roster_foundation_plan_v1.md` — P6 plan.
- `docs/policies/risk_signal_catalog_v1.md` — P7 doctrine.
- `docs/implementation/risk_review_workflow_v1.md` — P7 workflow.
- `docs/sales/README.md` — P9 sales index.
- `docs/owner/full_project_mega_sprint_v2_report.md` — this report.

## Safety proof

- **No production deploy.** Vercel + Supabase prod untouched by this sprint.
- **No migration applied.** PR B has zero `supabase/migrations/*.sql` files. Org / team / risk schemas are described in plan docs but NOT shipped.
- **No PR #18 mutation.** Confirmed via `git log` and absence of the relevant paths in `git diff`.
- **No service_role at runtime.** No new server code touches `SUPABASE_SERVICE_ROLE_KEY`.
- **No outreach sent.** Sales docs are templates; owner-edited + owner-sent.
- **No surveillance added.** No new telemetry events. No screen / keystroke / dwell-time fingerprinting.
- **No fake "verified" markers.** Clarity card + roster cards + risk doctrine all explicitly call this out.
- **No autonomous deploy/migrate/merge bot.** Owner reviews + merges manually.

## What the owner does next

1. Review PR A (#72) — merge when ready.
2. Review PR B — merge when ready (rebase from PR A → main once A merges).
3. Run the support-chat smoke (5 minutes) — `docs/owner/support_chat_smoke_v1.md`.
4. Read the three doctrine docs before any future schema PR touches their area:
   - `docs/policies/risk_signal_catalog_v1.md`
   - `docs/implementation/org_workspace_foundation_plan_v1.md`
   - `docs/implementation/team_roster_foundation_plan_v1.md`
5. When ready: greenlight PR C (mission-control visual slice).

## Gates run

| Gate | Result |
|---|---|
| `pnpm -F web lint` | (to be recorded at commit time) |
| `pnpm -F web typecheck` | (to be recorded at commit time) |
| `pnpm -F web test:unit` (guards) | (to be recorded at commit time) |
| `pnpm -F web build` | (to be recorded at commit time) |

Gate results appended to PR B body when the commit is pushed.

## Open questions for owner

- Sequence after merge: ship PR C first (visual polish), or pick up the first concrete schema PR from P5 (`organization_profiles` migration)? Default recommendation: PR C first, since it is visual + reversible, then the schema work after you have re-read the plan doc.
- The risk-review workflow's admin surface (`/dashboard/admin/risk`) is described but not built — should it land before or after `organization_profiles`? Default recommendation: org schema first (it's the gate for billing), risk admin surface after.
