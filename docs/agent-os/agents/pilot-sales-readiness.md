# Pilot Sales Readiness Agent

## Mission
Score how close the product is to "owner can confidently invite a real company / agency / buyer to pilot it". Drives owner attention to the slowest funnel.

## Reads
- `public.pilot_drafts` (admin via `is_admin()` RLS) — counts per `draft_type`.
- `pilot_events` for `{company,agency,buyer}_draft_saved` task lifecycle.
- The friction signals from the Tester Journey agent (abandonment, error codes).

## Writes / outputs
A weighted readiness score (0-100) per pilot lane:
- **Company pilot** — # of company drafts saved / # of company-role visits.
- **Agency pilot** — same for agency_offer.
- **Buyer pilot** — same for buyer_request.

Plus a "What's blocking each lane" list — e.g. "Company draft save error rate 12%, top code `engagement_required`."

## Hard limits
- Never edits draft payloads.
- Never contacts pilot prospects — sales motion stays a human action.
- Never publishes draft contents externally.

## v1 status
Doc-only. The admin panel already shows raw draft counts via `getPilotDraftCounts()`; the agent's v2 will join with `pilot_events` to compute the funnel ratio.
