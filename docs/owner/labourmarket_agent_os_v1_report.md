# Labourmarket.ai Agent OS + Tester Intelligence v1 — Owner Report

Branch: `feat/agent-os-and-pilot-telemetry-v1`
Base: `origin/main` @ `eb167d3` (post-PR #66)
Date: 2026-05-25

## What ships in this PR

Three integrated layers:

### 1. Pilot telemetry foundation
- **Migration `0020_pilot_events.sql`** — additive table `public.pilot_events` (id / created_at / profile_id / session_id / route / locale / event_name / task_name / task_step / duration_ms / result / error_code / metadata / app_version). RLS enabled. **SELECT admin-only via `public.is_admin()`. NEVER public.** INSERT user_id = `auth.uid()` OR NULL. No UPDATE / DELETE policy. Grants only to `authenticated`.
- **Server action `recordPilotEvent`** with privacy guards: metadata allowlist (12 keys, no wildcards), per-value 200-char cap, total 2 KB serialized cap. profile_id derived server-side from `auth.getUser()`. No `service_role`. Tagged result so callers see precise failure codes.
- **Client helper `lib/telemetry/task.ts`** — `startTask` / `stepTask` / `completeTask` / `errorTask` / `abandonTask` / `recordEvent`. Pseudonymous per-tab `session_id` in sessionStorage. Fire-and-forget (never blocks user action, never throws). No continuous tracking, no keystrokes, no raw input bodies.

### 2. Event instrumentation (strategic flows only)
| Surface | Events fired |
|---|---|
| `google-button.tsx` | `google_oauth_start` (with safe trace id + `preview_host` flag), `google_oauth_error` |
| `journal-entry-composer.tsx` | task `journal_entry_create` / `journal_entry_edit` lifecycle, `journal_suggest_clicked`, `journal_save_success`, `journal_save_error_code` |
| `journal-entry-row.tsx` | `journal_edit_clicked`, `journal_delete_clicked` |
| `language-feedback-widget.tsx` | `language_feedback_opened`, `language_feedback_submitted` (with `had_selection` / `comment_length` only — never the body) |
| `pilot-draft-form.tsx` | `company_draft_saved` / `agency_draft_saved` / `buyer_draft_saved` per `draft_type` |
| `profile-text-first-flow.tsx` | `profile_text_saved`, `profile_skill_suggestion_confirmed` (with `skill_count` — never labels) |

### 3. Admin surfaces
- **`/[locale]/dashboard/admin/agent-os`** — read-only role-card index, 10 agents grouped by scope (owner / ops / tester / security / sales). Each card links to its doc.
- **`/[locale]/dashboard/admin/pilot-telemetry`** — read-only inbox with three panels: task summary (started / success / error / abandoned / avg duration), top 20 error codes, last 200 events table.
- **Admin hub links** — the existing `/dashboard/admin` now has three rounded buttons linking Agent OS / Pilot Telemetry / Language Feedback.

Every admin page is gated by `requireSuperadmin(locale)` (server-side redirect) AND `is_admin()` RLS (database scope). Double-gated.

### 4. Agent OS documentation
- `docs/agent-os/labourmarket-agent-os-v1.md` — index.
- `docs/agent-os/agents/*.md` — 10 role cards (mission / reads / writes / hard limits / v1 status).
- This report.

## Privacy model (auditable)

| Surface | What we DO store | What we NEVER store |
|---|---|---|
| `pilot_events.metadata` | trace id, provider, origin (host only), draft_type, fragment_count, unresolved_unknown_count, skill_count, preview_host, had_selection, comment_length, result_kind | journal text, profile text, CV text, skill labels, language-feedback comments, the auth code, JWT tokens, cookies, full URLs (route is path-only — no query string) |
| `pilot_events.route` | path only (`/lt/dashboard/journal`) | query strings, anchor fragments |
| `pilot_events.session_id` | pseudonymous per-tab hex from `crypto.getRandomValues`, sessionStorage-cached | any identifier derived from email / profile / auth |
| Admin UI | counts, codes, durations, metadata as JSON | private text bodies — those stay in their owner-only tables |

Pinned by guards (`pilot-events-migration-0020.test.ts`, `agent-os-and-telemetry-wiring.test.ts`).

## Migration: production apply needed

- **0020** — additive table + RLS + 2 policies + 4 indexes + grants. **NOT auto-applied.**
- Re-runnable safely: `create table if not exists`, `create index if not exists`. (Policies would error on re-run; the migration is intended for one-shot apply via the standing `/goal Supabase production migration check` flow.)

## Required checks

| Gate | Result |
|---|---|
| `pnpm -F web lint` | green |
| `pnpm -F web typecheck` | green |
| `pnpm -F web test` (vitest) | **all passing** (see PR body for exact count) |
| `pnpm -F web build` | green |

## Owner smoke checklist (after applying 0020)

1. Login as a tester on production. Open DevTools console — expect the `[auth] oauth start` line + a `trace: <hex>` value.
2. Do the profile/CV task end-to-end (text-first composer → confirm a few skills → save).
3. Do a Work Journal task — paste a multi-fragment LT sentence, confirm, save. Then edit one entry. Then soft-delete one entry.
4. Submit a language-feedback report (highlight a word, "Pranešti apie tekstą", submit).
5. Save one draft as company, one as agency, one as buyer (using the role switcher).
6. Switch to admin (`active_role = 'admin'` or `profile_roles` row tagged `'admin'`).
7. Open `/lt/dashboard/admin/agent-os` — 10 role cards visible, links work.
8. Open `/lt/dashboard/admin/pilot-telemetry`:
    - **Task summary** shows `journal_entry_create` with `started`/`success`/`avg duration ms`.
    - **Top errors** is empty if you didn't hit any.
    - **Recent events** shows your last 20 actions in chronological order — every metadata cell is short JSON; no private text body.
9. Open `/lt/dashboard/admin/language-feedback` — your submitted report appears.
10. As a non-admin worker, try `/lt/dashboard/admin/agent-os` and `/lt/dashboard/admin/pilot-telemetry`. Expect redirect to `/lt/dashboard` (or empty list if redirect ever slips).

## Deferred (intentionally)

- **Live agent runtime.** v1 is doc + telemetry foundation. The agents themselves are not running yet; their contracts are written so they can be wired safely later (most likely as `/loop` tasks or scheduled remote routines).
- **Per-task instrumentation completeness.** `login` / `profile_text_save` / `pilot_draft_save_*` are not yet wrapped in `startTask` / `completeTask` envelopes — they emit single events. v2 wraps them in full lifecycle envelopes.
- **Charts.** The goal explicitly forbids fake charts; v1 ships numbers + tables. Real charts wait until the data shape is proven by use.
- **Status flips on telemetry inbox.** v1 is read-only; status mutation needs its own narrow RPC + admin audit.
- **External alerting.** No PagerDuty / Slack hookup — goal explicitly forbids external analytics.
- **PR #18** — untouched.
