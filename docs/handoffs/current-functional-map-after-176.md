# Current functional map — after PR #176 (main `1a6b846`)

Slice 0 of the full functional implementation train. **Map only — no features
implemented here.** Purpose: stop later slices from duplicating or faking.

## Dashboard routes (live)

| Route | Purpose | State |
|---|---|---|
| `/dashboard` | Role overview cockpit (worker next-step; company/agency demand submit + read-back) | live |
| `/dashboard/company` | Company workspace: operational nav, worker roster, org members, journal-review toggle, demand draft | live |
| `/dashboard/agency` | Agency workspace (mirror of company) | live |
| `/dashboard/buyer` | Buyer/customer: requests + setup | live |
| `/dashboard/journal` | Worker journal: context resolver (6 states), composer, entries + review origin | live |
| `/dashboard/inbox` | **Journal review cockpit** — lists unconfirmed worker entries for the manager/owner | live |
| `/dashboard/profile` | Profile/CV: profile_text, skills, capability section, completion status | live |
| `/dashboard/account` | Email, roles, admin-UI toggle, theme | live |
| `/dashboard/communication` (+ `/[conversationId]`) | Conversations list (read-only at list level) | live (read) |
| `/dashboard/admin` (+ `agent-os`, `pilot-telemetry`, `language-feedback`, `project-truth`, `support`, `users/[id]`) | Admin/operator tooling | live (admin-only) |
| `/dashboard/start/{company,agency,buyer}` | Role setup forms | live |
| `/dashboard/{search,talent,visual-os,visual-os/agency}` | Discovery/visual surfaces | partial/visual |

## Live flows (real backend + read-back)

- **Company team operations:** `CompanyWorkersSection` (roster + pending invites,
  per-worker next-action), `OrgMembersPanel` (canonical members via
  `engagement_contexts` + `add_org_member` + journal-review toggle). Org resolved
  via `organizations.legacy_company_id` (1:1, applied to prod).
- **Invitation → membership:** `company_worker_invitations` →
  `accept_company_worker_invitation` (0036, applied) → `company_workers` link →
  owner `add_org_member` (reroute migration, applied) → `engagement_contexts`.
- **Worker journal context:** resolver distinguishes none / pending / roster /
  member / active-context (PR #173 + #176). Composer when an engagement exists.
- **Journal review:** `/dashboard/inbox` lists unconfirmed entries;
  `manager_review` RPC (0034, applied) confirms; worker sees "Reviewed by
  {role} · {date}" (PR #169). Review gated on `engagement_contexts` +
  `journal_review_enabled` (0033/0034).
- **Demand intake:** cockpit "Submit your need" → `submit_demand_request` →
  `customer_requests`; read-back with status (PR #165). Buyer detailed surface on
  `/dashboard/buyer`.
- **Skills provenance:** `worker_skills.source` (self_declared / work_journal /
  manager_confirmed) badge (PR #170).
- **Messaging (read):** `conversations` / `conversation_participants` /
  `conversation_messages` (0021, RLS participant-scoped) + read-only list UI.

## Backend tables / RPCs (applied to prod)

- Membership/journal: `organizations` (+ `legacy_company_id`/`legacy_agency_id`),
  `engagement_contexts`, `company_workers`, `agency_workers`,
  `company_worker_invitations`, `agency_worker_invitations`, `journal_entries`,
  `journal_entry_confirmations`, `journal_entry_metrics`. RPCs:
  `accept_{company,agency}_worker_invitation`, `add_org_member`,
  `set_engagement_journal_review`, `manager_review`,
  `provision_{company,agency}_worker_engagement_context`,
  `assign_operations_role`.
- Demand: `customer_requests` + `submit_demand_request` / `save_customer_request`.
- Skills: `skills`, `worker_skills`, `profession_skills`, `profile_skill_claims`.
- Messaging: `conversations`, `conversation_participants`, `conversation_messages`.
- **Projects:** `public.projects` exists (0001; `projects_company_to_organization`
  migrated to `organization_id`) — **no app surface, no list/create UI**.
- Matching (dormant, M4): `job_demands`, `matches` (+ `reasons jsonb`),
  `match_actions` — **not granted to authenticated; admin-write only**; PR #172
  RED gate proposes the grants/RPC. Not live.

## NOT present (would require RED schema work)

- **`tasks` / `task_assignments`** — no table. Task assignment = RED.
- **Project list/create UI / project↔journal linking** — no surface. RED to build.
- **Matching "why" live read** — blocked on PR #172 apply. RED.
- **PDF/report exporter** — none. RED if storage/service needed.
- **Conversation create/compose RLS path from worker↔company** — list is read-only;
  needs verification before a composer (Slice 7).

## Train slice readiness (from this map)

| Slice | Likely | Why |
|---|---|---|
| 1 company ops board v2 | **GREEN** | read-back + status counts on existing data |
| 2 worker journal context | **GREEN** | resolver/copy; states already mostly shipped (#173) |
| 3 review cockpit | **GREEN** | `/dashboard/inbox` + `manager_review` already live; expose/clarify |
| 4 worker detail | **GREEN (inline)** | no detail route; read existing data inline, mark full route future |
| 5 project/task foundation | **RED** | no tasks table; projects has no surface |
| 6 task assignment | **RED** | depends on Slice 5 schema |
| 7 messaging gate | **GREEN-gate** | backend exists; verify compose RLS before any write UI |
| 8 matching why | **RED** | blocked on PR #172 apply |
| 9 reports/proof | **GREEN (preview)** | preview from real data; no PDF service |
| 10 multi-role onboarding | **GREEN** | switcher/admin-UI/copy already partly shipped (#173) |
| 11 admin terminology v2 | **GREEN** | remaining visible copy + e2e/guards |
| 12 mobile polish v2 | **GREEN** | UI only |
| 13 acceptance smoke | **GREEN (docs)** | checklist + optional route smoke |

## Safety

Docs-only. No code/feature change. No DB/RLS/auth/env/deploy touched.
