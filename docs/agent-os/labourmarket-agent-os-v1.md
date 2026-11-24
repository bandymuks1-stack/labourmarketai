# Labourmarket.ai Agent OS v1

## What this is

A documented, read-only operator model — **ten written agent roles** the owner can apply by hand to reason about the project's state, plus a thin pilot-telemetry layer that captures the signals each role would consume.

There is **no live agent runtime in v1**. Every "agent" here is a written contract: who it serves, what signals it reads, what it must never do, and what its output shape is. The agents *will* be wired in future iterations (most likely as scheduled remote routines or as `/loop` tasks); the v1 contracts make that wiring safe.

## Why this shape

Real pilot testing surfaces a flood of small signals — login latency, journal save failures, unknown-phrase counts, draft form friction, language confusion. None of these on their own justify a feature change, but the *combinations* do. The agent roles below are the smallest set that covers every signal we collect today + the obvious near-term ones.

## The ten roles

| # | Agent | Scope | Doc |
|---|---|---|---|
| 1 | Chief Operator | owner brief | [agents/chief-operator.md](agents/chief-operator.md) |
| 2 | PR Readiness | ops | [agents/pr-readiness.md](agents/pr-readiness.md) |
| 3 | Migration Auditor | ops | [agents/migration-auditor.md](agents/migration-auditor.md) |
| 4 | Deploy + Smoke | ops | [agents/deploy-smoke.md](agents/deploy-smoke.md) |
| 5 | Tester Journey | tester | [agents/tester-journey.md](agents/tester-journey.md) |
| 6 | CV / Profile | tester | [agents/cv-profile.md](agents/cv-profile.md) |
| 7 | Work Journal Evidence | tester | [agents/work-journal-evidence.md](agents/work-journal-evidence.md) |
| 8 | Language QA | tester | [agents/language-qa.md](agents/language-qa.md) |
| 9 | Security / Privacy | security | [agents/security-privacy.md](agents/security-privacy.md) |
| 10 | Pilot Sales Readiness | sales | [agents/pilot-sales-readiness.md](agents/pilot-sales-readiness.md) |

## Hard boundaries (apply to every agent)

- **No autonomous prod changes.** Agents emit reports, recommendations, and digest entries. Every database-modifying or deploy-modifying action requires an explicit owner `--apply` confirmation (same gate this session's migration runs use).
- **No raw private text in telemetry.** Journal narratives, profile text, CV bodies, language-feedback comments — these stay in their respective owner-only tables (`journal_entries.original_text`, `profiles.profile_text`, `language_feedback.selected_text`). Telemetry stores counts, codes, and `(route, locale, session_id)`.
- **No `service_role` in app runtime.** Agents that need elevated reads use the same RLS `is_admin()` path the admin pages use.
- **No public exposure.** Every agent UI surface is gated by `requireSuperadmin` + RLS admin-only SELECT.
- **No external analytics SDK.** Telemetry is first-party (`public.pilot_events`).
- **PR #18 untouched.** The manager-confirmation backbone remains draft.

## Signal map

| Surface | Signal | Storage |
|---|---|---|
| Auth | `google_oauth_start`, `google_oauth_error` + trace id | `pilot_events` (event_name) |
| Journal | `journal_suggest_clicked` / `journal_save_success` / `journal_save_error_code` / `journal_edit_clicked` / `journal_delete_clicked` + task lifecycle (`journal_entry_create` / `journal_entry_edit`) | `pilot_events` |
| Profile / CV | `profile_text_saved`, `profile_skill_suggestion_confirmed` | `pilot_events` |
| Language QA | `language_feedback_opened`, `language_feedback_submitted` (+ the comment body in `public.language_feedback`) | `pilot_events` + `language_feedback` |
| Pilot drafts | `company_draft_saved`, `agency_draft_saved`, `buyer_draft_saved` (+ payload in `public.pilot_drafts`) | `pilot_events` + `pilot_drafts` |

See `docs/owner/labourmarket_agent_os_v1_report.md` for the full v1 deliverable list + production smoke checklist.
