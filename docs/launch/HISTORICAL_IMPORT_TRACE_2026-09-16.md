# Historical import → living company model — bounded trace (2026-09-16) — sanitized

> **PUBLIC REPO — sanitized (2026-10-25).** Per `AGENTS.md` (this repository is
> PUBLIC; production evidence lives in the owner's private Agentai OS Internal
> Brain, not here), this file previously contained a detailed production trace —
> import session identifiers, staged/committed row counts, hours, per-day figures,
> and real third-party site addresses. That production evidence has been removed
> and belongs in the Internal Brain. The engineering conclusions and the code the
> slice delivered are kept below; the numbers are not.

## What this was
A bounded, read-only trace of one real historical-timesheet import through the
"living company" model: source file → import session → staged rows → person /
place resolution → committed evidence records → the one work model (Work in
Numbers, Living CV, team roll-up). It was a trace, not an audit, and authorized
nothing.

## Engineering findings (no production figures)
- The source "object" column mixes real places with composite multi-site labels,
  activity notes and duration notes; a minority of rows carry no recognizable site
  in the object column (the site is in the leading words of the work text, often
  misspelled).
- Some day figures are period aggregates (work-from-home over months), not a single
  day — classified from the source's **words**, never from the magnitude; only
  genuinely daily hours reach the work ledger.
- Some rows restate a calendar date that conflicts with the source week; the
  source's own provenance column states the date was reconstructed from year +
  week + weekday.

## What the slice delivered (code, not data)
- `lib/organization-evidence/work-context.ts` — pure split / classify / address-aware
  typo match (same house number required to merge; different numbers never merge) /
  site-from-text / per-place hours; every result DERIVED with method + confidence.
- `import-core.ts` — one record per source row (the person-day fact), `work_object_id`
  set only when exactly one place resolves, `derived.workContexts[]` for multi-place
  days; impossible-magnitude rows held until a human acknowledges them.
- `lib/organization-evidence/time-semantics.ts` — period-aggregate vs daily
  classification from source words.
- Evidence → the one work model via `worker-evidence-read.ts` →
  `readOrganizationRecords`.
- Read-only projections in `import-projections.ts`; reconstruction-first preview UI.

No migration, RLS, policy or store change was made by that slice. Detailed figures,
session identifiers and the owner's human-walk numbers are held privately in the
Internal Brain.
