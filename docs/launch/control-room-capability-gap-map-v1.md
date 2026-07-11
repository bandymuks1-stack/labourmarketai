# Control Room Capability Gap Map — v1

Status: source-first audit of `main` @ `7f863f9` (2026-07-11).
Scope: the twelve capability groups of the control-room capability expansion programme.
Method: traced real mounts, routes, tables, RPCs, RLS, guards and the applied-migration
ledger — not filename search. Nothing below is assumed from an earlier analysis.

## 0. Repo-wide truth that constrains every slice

- **Repo file ≠ applied.** Migrations are `@human-gate` drafts applied manually via the
  sanctioned Supabase MCP path and recorded in `docs/APPLIED_LEDGER.md`. Consuming code
  degrades honestly on `42P01/42703/42883/PGRST202`. Every slice below states whether it
  depends on an applied table, a committed draft, or a net-new migration.
- **Migration classifier** (`.github/scripts/migration-safety.mjs`) is fail-closed:
  `SECURITY DEFINER`, any `GRANT`, policy changes, data `UPDATE/DELETE`, or a missing
  `supabase/rollbacks/<name>.down.sql` sibling ⇒ RED ⇒ draft PR + `needs-human-gate`,
  no auto-merge, owner applies manually.
- **Landing freeze** (`apps/web/lib/guards/landing-freeze.ts`) hashes the frozen marketing
  page, `content/placeholders.ts`, ~15 shared components and the
  `hero/journey/live/map/draft/marketPulse/playercards` namespaces (lt/en/ru). No slice may
  touch those files/keys.
- **i18n:** new keys must land in **all 11** locale files (`en,lt,lv,et,nl,de,da,no,sv,pl,ru`)
  in the same PR; active locales `lt,en,ru,nl,de` must show zero `[EN]`.
- **CI gates:** typecheck → lint → vitest (~350 guard specs) → placeholders → honesty-copy
  guards → primary-route-smoke → seo-indexing → i18n-debt → build, plus migration-safety.
- **Design:** token-only styling (`apps/web/tokens/*`, guard-enforced); UI primitives in
  `apps/web/components/ui/`.
- Confirmed deleted and staying deleted: `/dashboard/hub`, standalone `WorkCard`,
  `EmployerPreview` (guards pin all three).

## 1. Role-aware control room foundation — **LIVE_PARTIAL**

**Exists (reusable):**
- Dashboard shell `apps/web/app/[locale]/dashboard/layout.tsx` — one SSR pass loads
  profile + roles + `getSpineCounts()`; mounts `DashboardTabs` (desktop) and `BottomNav`
  (mobile), both already derived from one registry.
- Registry spine already exists:
  `lib/config/feature-availability.ts` (`FEATURES` — authoritative feature list with
  `availability`, `primaryRoute`, `safeToShowInPrimaryNav`) → `lib/config/navigation.ts`
  (`TAB_META`, `getVisiblePrimaryNavItems()`) → both navs.
- Role model: `profiles.active_role` + `profile_roles` (`worker|company|agency|customer`),
  admin as separate dimension (`lib/auth/admin-signal.ts`); role catalogue
  `lib/config/roles.ts`.
- Next-action logic: `lib/dashboard/next-action.ts` (org) and `lib/dashboard/top-slot.ts`
  (worker priority ladder) — single above-the-fold action already implemented per role.
- Command finder `components/app/command-finder.tsx` + `lib/navigation/command-registry.ts`.

**Gaps:**
- Four hard-coded islands duplicate route/icon/label lists outside the registry:
  `my-zone.tsx` `BASE_ACTIONS`, `page.tsx` `marketplaceAccess` cards,
  `dashboard-chain-actions.tsx` role lists, and `command-registry.ts` routes.
- No role-specific module grid; overview page is a long stack of ad-hoc sections.
- Spine badges can only reach the `communication` tab; icon maps duplicated per component.
- CommandFinder has no keyboard shortcut and is registry-only.

**Smallest path (repo-safe, no migration):** add a module-descriptor layer keyed by
`FeatureKey` (extend `feature-availability.ts` / sibling map) carrying
`{iconKey, surfaces: nav|grid|chain|command, roles, attentionSignalId}`; render the module
grid + status strip from it; point the four islands at it; link `SPINE_SIGNALS` to
`featureKey` so any tab/card can carry a real badge.

## 2. Unified activity centre — **LIVE_PARTIAL** (repo-safe core; persistent feed ABSENT_NEEDS_MIGRATION)

**Exists:** the notification spine is the single attention truth —
`lib/notifications/spine.ts` (`getSpineCounts()`) + `spine-signals.ts` (`SPINE_SIGNALS`),
rendered by the bell (`notification-panel.tsx`), nav badges and dashboard cards from one
read. Six wired signals: unread messages (`conversation_participants.last_read_at`),
pending/new service requests (`service_offering_requests` + `_seen`), pending/new bookings
(`booking_requests` + `booking_request_events` + `_seen`), pending invitations
(`company/agency_worker_invitations`). "Visiting the surface is the read event" —
per-surface `seen_at` tables + SECURITY DEFINER mark-seen RPCs; guard
`lib/guards/notification-spine.test.ts` pins that every signal traces to a real model and
a clearing route.

**Gaps:** no cross-module per-user activity table; demand/interest events
(`demand_interest_signals`), verification and journal-confirmation events have **no
seen-model** and are deliberately not in the spine; no historical feed; no per-item read
state; `follow_up_tasks` (draft, admin-only) is not user-facing.

**Smallest path:** repo-safe slice = an `/dashboard/activity` surface + dashboard summary
consuming `getSpineCounts()`/`SPINE_SIGNALS` with module filters (no second truth, no fake
mark-read). Migration-gated follow-up = one generalized append-only events table mirroring
`booking_request_events` + per-user `seen_at`, RPC-gated — only if a persistent
chronological feed is required; also unlocks demand/verification signals honestly.

## 3. Work and task management — **ABSENT_NEEDS_MIGRATION**

**Exists:** `follow_up_tasks` (draft `20260705235000`, admin-only, no due date/assignee/
priority, RPC-writes, honest-degrade loader — the pattern to mirror);
`project_worker_readiness_items` (applied) — project-axis checklist;
`journal_entry_work_items` (draft) — recognition, not tasks.

**Gap:** no assignable, due-dated, project-linked task model for non-admin users; no board
or "my tasks" view.

**Smallest path:** new `public.tasks` migration (additive, rollback sibling, RED because
RPC writes require `SECURITY DEFINER` ⇒ human-gated apply): bounded title/description,
`status todo|in_progress|blocked|done|cancelled`, priority, assignee/creator profile FKs,
`due_at`, nullable source relations (project/demand/booking/company), RLS via
`can_manage_project()` + assignee visibility, create/set-status RPCs mirroring the
follow-up pattern. Comments via existing conversation spine; attachments via existing
document/evidence axes only. UI (list/board/my-tasks + dashboard cards + degrading loader)
is repo-safe and ships ahead of the apply, degrading honestly.

## 4. Unified planning and calendar — **ABSENT_REPO_SAFE**

**Exists (dated sources today):** `booking_requests.start_date/expected_end_date` +
accept-time overlap guard (the only conflict logic, errcode `23P01`);
`projects.start_date/end_date` + `project_worker_assignments`; journal-derived worker
today-screen (`lib/worker/today-screen.ts`); bookings page already brands itself the
canonical planning surface (`PlanningConnections`). No calendar route, no date library,
no availability-window model (`workers.availability_status/available_from` only; richer
prefs are an unapplied draft).

**Smallest path:** repo-safe aggregation route (`/dashboard/planning`) composing bookings +
project date bands + assignments into a compact agenda (mobile-safe list grouped by
day/week — no heavy calendar dependency), filters by source, links to source objects,
conflict indication reusing real date-range overlaps. Task deadlines and milestones join
as those models land. No invented schedule, no external calendar sync claim.

## 5. CRM and demand pipeline — **LIVE_PARTIAL** (read consolidation repo-safe; contacts/stage-ledger ABSENT_NEEDS_MIGRATION)

**Exists:** two demand stores by design — `customer_requests` (authenticated canonical
intake; statuses `draft|submitted|in_review|needs_followup|approved|closed`) and
`company_need_public_intakes` (anonymous; deny-all RLS, RPC-only write, service-role read;
statuses `new|contacted|qualified|rejected`; admin queue
`/dashboard/admin/company-need-intakes` live on main). Plus `leads`
(`new|contacted|qualified|won|lost`), `customers` (review states), `demand_interest_signals`,
verified-company opportunity RPC `list_open_demand_for_workers()`.
**Seed to extend:** `lib/sales/lead-intake-model.ts` already unifies leads + waitlist +
operator-state customer_requests into one superadmin read-only queue
(`sales-intake-panel.tsx`, guarded).
Conversation linkage exists: `conversations.source_type/source_id` +
`conversation_source_context()` RPC.

**Gaps:** no contact-person entity anywhere; no shared stage enum (three lifecycles);
no stage-transition/activity ledger; no dedup; outreach drafts/consent/provenance not on
main (PR #687 unmerged).

**Smallest path:** repo-safe slice = extend `lead-intake-model.ts` to include
`company_need_public_intakes` → one pipeline queue over all demand sources, one
**presentation** stage-set that maps (never overwrites) the three stored lifecycles,
real counts only, `conversation_source_context` for history. Never loosen the deny-all
RLS. Migration-gated follow-ups: contacts table, stage-transition ledger, dedup index.
No scraping, no outbound sending.

## 6. Project operations centre — **LIVE_PARTIAL**

**Exists (applied):** `projects` + `job_demands` + `project_members/clients` +
`project_worker_assignments` + per-worker `project_worker_operational_statuses` and
`project_worker_readiness_items`; `lib/projects/operations.ts` (`getProjectOperations`)
already aggregates all of it RLS-scoped; operations route
`/dashboard/projects/[id]/operations` + report; journal auto-link + project photo gallery
applied. Handover passport (`project_handover_entries`) is a committed draft with full
degrading UI.

**Gaps:** no milestones beyond status enums, no issues/risks model, no project activity
timeline, no project-level planning strip.

**Smallest path:** repo-safe upgrade of the operations surface (compose existing
aggregates + journal + gallery + handover-when-applied + linked demand/conversations +
real ratios). Issues/risks = honest net-new migration-gated model (do not invent a defect
model). Milestones ride the handover stages or a small additive column set — gated.

## 7. Resource planning — **LIVE_PARTIAL** (assignment core) / **ABSENT_NEEDS_MIGRATION** (windows, teams, accommodation/transport as resources)

**Exists:** assignment mechanism (`assign_worker_to_project` RPC + manager UI); booking
overlap guard; readiness per project-worker; `projects.housing_provided`;
worker availability basics (`availability_status/available_from/preferred_countries`).
**Committed drafts (unapplied):** worker availability preferences
(relocate/accommodation/transport/max-trip), team-as-organization spine
(`organization_type='team'` + capability summary RPC), demand transport enum,
required-tools projection.

**Gaps:** no availability-window/time-slot model, no persisted teams, no first-class
accommodation/transport resources, no equipment model (later-capability slot).

**Smallest path:** repo-safe slice = assignment-readiness view combining assignments,
booking conflicts, readiness items and availability basics per project/demand.
The rest activates as the committed drafts are owner-applied; genuinely new resource
tables (accommodation/transport planning) are prepared additively and human-gated.

## 8. Document and work-proof centre — **LIVE_PARTIAL**

**Exists (separate axes by doctrine, all reusable):** `worker_documents` readiness +
verification axes with append-only events and derived 30-day expiry
(`lib/documents/readiness.ts`); project readiness checklist; verified CV + evidence
report projection; `journal_entry_photos` (+ applied project gallery);
handover entries (draft); `customer_request_attachments`. Buckets: only
`customer-request-attachments`, `journal-entry-photos`, `profile-avatars`.
Entry points half-built: `DOCUMENTS_READINESS_ENABLED` flag and the `ReportsExports` hub
on `/dashboard/documents`.

**Gaps:** no unified discovery surface; `worker_documents.file_path` has **no backing
storage bucket** (metadata-only today); agency visibility is consent-gated aggregates only.

**Smallest path:** repo-safe consolidation hub on `/dashboard/documents` composing the
existing axes (filters, search, links back to worker/project/booking; attention for
expiring/missing/review-needed from the real `valid_until`/`verification` fields only) —
no data moves, no second store. Actual file upload for worker documents requires a new
bucket + storage policies ⇒ migration-gated.

## 9. Finance centre — **ABSENT_NEEDS_MIGRATION**

**Exists:** nothing financial — zero invoice/expense/payment tables. Stripe TEST-mode
subscription plumbing only (`billing_customers/billing_subscriptions/payment_webhook_events`,
no amounts, live keys hard-blocked); concierge-first public pricing (frozen surface).

**Smallest path:** net-new additive tables (invoices, expenses; statuses
`draft|issued|partially_paid|paid|overdue|cancelled`; counterparty, project/company FKs,
document relation, due dates), RPC-only writes, owner-scoped RLS, rollback siblings ⇒
RED, human-gated apply. UI + exports + overdue attention ship repo-safe with degrading
loaders. No bookkeeping/tax/payroll/bank-sync claims; money-moving out of scope.

## 10. AI assistance centre — **LIVE_PARTIAL (infra)** / **EXTERNAL_PROVIDER_GATED (live)** / persistence **ABSENT_NEEDS_MIGRATION**

**Exists:** complete safety-gated runtime under `lib/ai/` — disabled/mock/live modes
(off by default), server-only env (never `NEXT_PUBLIC`), provider boundary +
secret-leak + schema-required + content-safety guards, **11 registered agents**, evals,
pure `run-core.ts` (no persistence). Deterministic suggestion review already live:
`human_in_loop_learning` tables + `/dashboard/learning` queue. **Zero UI wiring** — no
route calls `runAiAgent`. PR #379's `ai_runs`/`ai_suggestions` store is not on main.

**Smallest path:** repo-safe slice = one AI assistance surface with honest
provider-disabled state, deterministic summaries where truthful (evidence report,
project status), source-visible outputs, explicit confirm-before-write into the existing
`learning_review_queue` human gate. Gates: audit/suggestion persistence migration
(human-gated), `AI_*` env docs, and live-provider key = owner/provider action. No fake AI.

## 11. Global search and command centre — **ABSENT_REPO_SAFE**

**Exists:** registry-only CommandFinder (no shortcut); `/dashboard/search` is an honest
placeholder routing to scouting; no search API; deterministic matching is the only find
path.

**Smallest path:** repo-safe server search (server action or one `app/api/search`) over
already-RLS-scoped tables the caller may read (own projects, conversations, journal,
documents readiness, admin-gated intakes), grouped results merged with the command
registry, keyboard access (Ctrl/Cmd-K) on the existing finder, exact destinations, no
counts/snippets that leak unauthorized existence, no second navigation registry, no new
index.

## 12. Reports and operational analytics — **LIVE_PARTIAL**

**Exists:** worker evidence report (`/dashboard/reports/evidence`) + CV/journal exports;
superadmin launch-readiness real counts (`lib/admin/launch-readiness.ts`); admin market
analysis; project operations report. No reports index, nothing role-specific for
companies/agencies.

**Smallest path:** repo-safe reports hub with role-specific real-data sections (worker:
profile completion/journal activity/evidence tiers; company/agency: open demands, pipeline
counts, project/task status, overdue documents) — every figure labelled with its
calculation basis, useful empty states, export from authorized rows only, no benchmarks,
no "real-time" claims.

## Gate register (owner/provider actions, kept current in the execution report)

| Gate | Type | Blocking | Non-blocked work continues |
|---|---|---|---|
| `tasks` table apply | RED migration | task persistence | task UI + degrade, all other slices |
| Activity events table apply | RED migration | persistent feed + demand signals | spine-based activity centre |
| Contacts / stage-ledger apply | RED migration | CRM persistence | read-consolidated pipeline |
| Issues/risks, milestones apply | RED migration | those project features | project ops upgrade |
| Finance tables apply | RED migration | finance records | finance UI shell + degrade |
| `ai_runs`/`ai_suggestions` apply | RED migration | AI persistence | AI centre w/ deterministic + disabled state |
| Worker-documents bucket | storage migration | real file upload | document centre consolidation |
| AI provider key + live mode | provider/owner | live AI | everything else |
| Unapplied committed drafts (follow-ups, handover, availability prefs, team spine, transport/tools) | owner apply decision | those features | degrading UIs already merged |

## Delivery order (unchanged from the master spec; groupings validated against source)

PR A this document · PR B foundation (repo-safe) · PR C activity (repo-safe) ·
PR D tasks (UI repo-safe + gated migration PR) · PR E planning (repo-safe) ·
PR F CRM read-consolidation (repo-safe) · PR G project ops + resource readiness
(repo-safe + gated models) · PR H document centre (repo-safe) · PR I finance
(UI repo-safe + gated migration PR) · PR J AI centre (repo-safe, provider-gated live) ·
PR K search + reports + final route-truth audit (repo-safe).
