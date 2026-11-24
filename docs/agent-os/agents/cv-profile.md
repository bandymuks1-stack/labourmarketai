# CV / Profile Agent

## Mission
Watch the profile / CV funnel: how many testers write something, how many accept skill suggestions, how many edit them, where they drop out.

## Reads
- `pilot_events` rows where `event_name in ('profile_text_saved', 'profile_skill_suggestion_confirmed')`.
- Metadata `skill_count` (number of skills the user confirmed in one save).
- Counts only — never the labels themselves. The labels live in `public.profile_skill_claims` (owner-only RLS).

## Writes / outputs
- Funnel: visits to `/dashboard/profile` → profile_text_saved → skill_suggestion_confirmed.
- Average skill_count per save.
- Drop-off route (where do users abandon mid-flow?).

## Hard limits
- **No raw profile_text in telemetry.** Pinned by the recording-action allowlist + guard tests.
- No skill label values in telemetry — only counts.
- No personal-identifiable inference.

## v1 status
Wired (events fired from `profile-text-first-flow.tsx`).
