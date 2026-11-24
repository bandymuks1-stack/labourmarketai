# Owner review — Project/client create v1

**Provisional owner review before deploy. Final verdict after deploy.**

## Route affected
- New: `/[locale]/dashboard/company/projects/new` (company-role gated)
- Updated entry point on: `/[locale]/dashboard/company`

## Before → after
- **Before (PR #198/#199):** company dashboard showed a read-only project-context card (real `projects` count, "structure ready / nothing auto-filled"), no way to create.
- **After (this PR):** the card adds a **"Sukurti projekto kontekstą / Create project context"** link → a minimal create form that writes a **real** project (and optional client) record scoped to the caller's own company.

## Minimal form fields
| Field | Required | Backed by |
|---|---|---|
| Project name | ✅ | `projects.title` |
| Location / address | optional | `projects.city` |
| Client | optional | `project_clients.name` (linked to the new project) |

`projects.status` is set to `draft`. No other fields are added.

## Success state
Inline truthful success: *"Projekto kontekstas sukurtas / Project context created"* + a "back to company dashboard" link. The dashboard re-reads the **real** project count on return (`revalidatePath`). No fabricated row is shown.

## Empty state
Unchanged and honest — when there are no projects the card shows the real `0` count; **no demo project, no fake client, no sample site, no mock rows.**

## Role assumptions (derived from existing logic, not invented)
- **Can create:** the company **owner** (`getOwnCompany()` resolves the company where `profile_id = auth.uid()`), and `is_admin()` via RLS. Company context is resolved **server-side** — `company_id` is never taken from client input.
- **Cannot create:** worker-only users and unauthenticated users (`getOwnCompany()` → `null` → rejected), and the route is gated by `requireRoleOrRedirect(locale, "company")`.
- **Cross-tenant create is impossible** — RLS `projects_insert` (`owns_company(company_id)`) and `project_clients` (`can_manage_project`) enforce it at the database layer. Normal Supabase client only (no `service_role`).

## Journal linking
**Still disabled.** This PR creates project/client context only. The create action never touches `journal_entries` / `journal_entry_work_items`, and the form/route state *"Journal linking is not enabled yet."*

## Migration status
**No migration required.** Uses the existing `projects` + `project_clients` tables and RLS applied in PRs #196/#197. `migration-safety`: *no migration files changed — GREEN.*

## Identifiers
- Branch: `feat/cc/project-client-create-v1`
- Base main SHA: `cf9f289`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
