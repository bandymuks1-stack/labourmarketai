# Reconciliation register — journal entries in an unreachable engagement context

**Status 2026-08-20: `AUTO_CORRECTABLE 0 · AMBIGUOUS 15 · UNCHANGED 15`.**
Nothing was rewritten. Nothing may be rewritten without a per-entry human
decision.

Classifier (read-only, repeatable):
[`scripts/db-proof/engagement-context-misroute-classify.sql`](../../scripts/db-proof/engagement-context-misroute-classify.sql)

## What is wrong with these entries

They sit in an engagement context whose `organization_id` is NULL, while their
author **also** holds an active organization-scoped context.
`timesheet_compute_lines_v1` scopes by `ec.organization_id = p_organization_id`,
so a NULL-organization context matches no employer, ever. The hours exist, carry
real durations and real provenance, and can reach nobody.

## How they got there — the cause is fixed, forward

Both work-log entry points ordered contexts by active-workspace match and then
`is_primary`, and defaulted to the first row. When the active workspace was
*person*, that ranked the worker's own org-less context first. A worker with an
employer, browsing as themselves, logged into their personal context by
default — and was never shown the choice.

That is fixed by `lib/journal/engagement-context-selection`, which both entry
points now share: source-determined context wins; a single applicable
organization context is preferred; **several are never guessed between**; and
when none applies the personal context is correct. On ambiguity nothing is
preselected and the entry cannot be saved until the worker chooses.

## Why zero of the 15 are auto-correctable

Measured, not assumed:

| Signal | Result across all 15 |
|---|---|
| Entries carrying a `project_id` | **0** |
| Entries with a live task link | **0** |
| Entries with **any** organizational evidence | **0** |
| Applicable organization contexts per entry | **2 or 3** |
| Distinct authors | 2 |
| Date range | 2026-05-22 → 2026-07-29 |

So for every one of them the correct context is **not deterministically
provable**, and the author had more than one organization it could plausibly
have been.

There is a second, stronger reason. Reading the entries shows several are
plainly **not employer work at all**: walking a dog; changing a meter and
painting a fence; washing windows and floors; renovating one's own house; "an
hour driving as a rideshare, three hours on a shop till". For those, the
org-less context is the **correct** answer — case D of the hierarchy. The defect
was never that personal contexts get used; it is that the choice was invisible
and unasked.

Re-pointing any of these at an employer would fabricate an employment record.
That is worse than leaving the hours unreachable.

## What happens to them

They are **left exactly as they are**. Historical journal truth is hash-chained
(doctrine §3): it is never updated or deleted in place.

If a worker or their manager later establishes which engagement a specific
entry belonged to, the correction path is the canonical one —
`journal_entry_supersede_v2`, which creates a NEW entry carrying the corrected
`engagement_context_id`, stamps `correction_of` / `superseded_by`, and leaves
the original row intact and readable with its author, its time and its reason.
No bulk operation exists for this, and none should: each is a separate factual
claim by a person about their own work.

## Re-running the count

Run the classifier above. The counts here are a snapshot; the entries are not
frozen, and new ones would only appear if the forward fix regressed — which is
pinned by `lib/guards/context-intelligence.test.ts`.
