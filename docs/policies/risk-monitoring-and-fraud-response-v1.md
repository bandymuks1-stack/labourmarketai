# Risk monitoring & fraud response — v1

How the platform detects suspicious behaviour and how it responds. Manual-review-first by design.

## What v1 monitors

These are signals — not auto-rejections.

| Signal | Source | Manual response |
|---|---|---|
| Unusually high journal_save_error_code rate from a single session | `pilot_events.session_id` + `result='error'` | Look at the underlying error code; if it's a real bug, fix it. If it's a tester probing for limits (e.g. 200 saves in a minute), reach out. |
| `google_oauth_error` spikes from the same `trace` pattern | `pilot_events` + Supabase auth log via MCP | Check the Supabase auth log via the standing `/goal Supabase production migration check` flow's first read-only round-trip. |
| `language_feedback` rows with obvious abuse content | admin inbox at `/lt/dashboard/admin/language-feedback` | Read, manually mark as dismissed (when status flips ship), reach out if the tester is identifiable. |
| Mass draft creation across role types from one profile | `pilot_drafts.profile_id` count | Probably exploration; only investigate if combined with other signals. |
| Multiple organisation profiles created in minutes with no rekvizitai | future Tier 2 surface; not in v1 | When Tier 2 ships: hold all of them until manual review. |
| Profile text or journal content describing illegal activity | journal_entries.original_text / profiles.profile_text (admin-readable but DO NOT routinely read; only on report) | If reported by another tester or noticed during incident review: read, document, escalate to owner. |

## What v1 does NOT monitor

- Public posts (none exist).
- IP geolocation (no IP logged anywhere outside Vercel/Supabase service logs).
- Device fingerprinting (the pilot session_id is per-tab and resets — not a fingerprint).
- External-party reputation scores.

## Response posture

**Manual review first, always.**

The platform doesn't auto-suspend accounts, doesn't auto-delete content, doesn't auto-restrict role access. A human (the owner) reviews each escalation. Reasons:

1. The pilot is small enough that auto-response would have a higher false-positive risk than a human glance.
2. The data is private to the user + admin — there's no public surface to "protect" via auto-moderation.
3. Auto-actions on user content (auto-delete, auto-hide) carry policy weight; we don't have a written escalation ladder yet, and shipping auto-action without one is irresponsible.

### Owner action ladder

When a signal warrants attention:

1. **Investigate** — read the relevant rows (telemetry / feedback / drafts). Do NOT routinely read private journal/profile bodies; only when a specific incident points there.
2. **Reach out** — if the tester is identifiable (they signed up, you have their contact), ask them what they were trying to do.
3. **Document** — file in `docs/owner/incident_YYYY-MM-DD_<slug>.md`. Keep it factual.
4. **Decide** — fix the product, restrict the account, or close the incident. Each requires a decision; none of them auto-fire.
5. **If account restriction is needed** — there is no "ban" button in v1. The owner does it via Supabase dashboard (deactivate the profile row + revoke session). Document the action.

## Privacy red lines

- Even the admin does NOT routinely read `journal_entries.original_text`, `profiles.profile_text`, `language_feedback.comment`. RLS allows it; product policy forbids casual browsing.
- When an incident requires reading private content, document why (the incident note) before opening it.
- Never copy private content into telemetry, into commits, into chat messages, or into PR descriptions.

## See also

- `docs/policies/pilot-terms-and-responsibility-v1.md` — what users agreed to.
- `docs/agent-os/agents/security-privacy.md` — the agent that audits this contract.
