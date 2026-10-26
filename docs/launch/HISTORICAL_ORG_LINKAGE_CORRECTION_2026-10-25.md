# Historical organization-linkage correction — Vivat Rex / Labour Market AI (2026-10-25) — sanitized

> **PUBLIC REPO — sanitized.** Per `AGENTS.md` (this repository is PUBLIC;
> production evidence lives in the owner's private Agentai OS Internal Brain, not
> here), the detailed figures that were previously in this file — record counts,
> hours, people counts, date ranges, source filenames, third-party client/site
> identifiers and registry numbers — have been removed. They were delivered to the
> owner privately and belong in the Internal Brain, namespaced per project. This
> file keeps only the decision, the mechanism and the outcome.

## What this change did (owner-directed, 2026-10-25; executes the 2026-09-30 model)
The continuing-business organization holds a historical worker-evidence set whose
records were all filed under the current (platform-operator) organization. Per the
2026-09-30 **business-history-continuity** decision
(`docs/design/business-history-continuity-v1.md`), those records correctly stay
under the continuing business; the **historical legal employer** is expressed by
the period a record composes into — read-only, via
`lib/organization-evidence/business-history.ts` and
`organization_history_periods`, by source-sheet label else documented date.

The correction **filled the missing period bounds** (a Vivat Rex period with
documented start/end at the documented company-change boundary, and the previously
missing successor period for the new legal entity) through an **append-only**
migration. No evidence record was moved, no `supplied_by_organization_id` changed,
no history was rewritten, and no un-audited SQL was used.

## Roles kept apart (no conflation)
- **Data origin / current holder / continuing business** — the platform-operator
  organization (record owner). Not a claim that it was the legal employer.
- **Historical legal employer** — Vivat Rex (earlier), then the new legal entity
  from the documented 2026-02-23 change. Expressed as period + per-record employer
  party label, composed on read; never an invented organization.
- **Client / main contractor** — a Dutch contractor (the party invoiced), not the
  employer.
- **Nonstop Group** — a separate organization; the `Nonstop-Vivat Rex PL` source
  label is dataset provenance within the Vivat Rex period, never a Nonstop party.

## Outcome (figures held privately)
- All affected records now compose into the correct historical-employer period;
  each record is counted exactly once; none is left unplaced among dated records.
- No record moved; append-only; provenance preserved.
- Visible through the existing company-history and Living-CV read paths.
- Detailed before/after figures and the per-source table are in the owner's
  Internal Brain, not in this public repo.

Applied and verified in production under owner direction. Not a COMPLETED claim for
the broader product.
