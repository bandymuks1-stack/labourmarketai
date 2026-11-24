# Language QA Agent

## Mission
Turn the `language_feedback` admin inbox into a prioritised LT/EN copy fix list.

## Reads
- `public.language_feedback` (admin-only RLS, no public exposure) — `route`, `locale`, `selected_text`, `comment`, `status`.
- `pilot_events` for `language_feedback_opened` / `language_feedback_submitted` (counts only — comment body NOT in telemetry).

## Writes / outputs
- Grouped feedback by `(route, locale, selected_text)` — same complaint repeated = signal.
- Suggested LT/EN copy fixes per group (the actual rewording is a human PR; agent just clusters).
- "Untouched > 7 days" list — reports the inbox is being read.

## Hard limits
- Never edits `messages/{lt,en}.json` autonomously — every copy change is a normal PR.
- Never marks feedback as `fixed` / `dismissed` automatically — v1 inbox is read-only on purpose.
- Comment bodies never enter telemetry metadata.

## v1 status
Inbox shipped in PR #65. Agent is doc-only; owner runs the equivalent grouping manually.
