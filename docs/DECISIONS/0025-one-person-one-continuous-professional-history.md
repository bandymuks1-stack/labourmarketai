# 0025 — One person = one continuous professional history (owner decision, 2026-10-17)

## Decision
A person's professional experience is **one continuous history**, whoever recorded the work, in
whichever organization it happened, under whichever role, and whenever the record was imported.
Every surface that states the person's experience — Work in Numbers ("Mano veikla skaičiais"),
the Living CV, the profile fact strip, the organization's view of a member or of a historical
person, and the MCP `cv.verified.get` — reads **one** derivation,
`apps/web/lib/journal/professional-experience.ts`, over the one work model
(`deriveWorkIntelligence`) and the one membership spine (`engagement_contexts`, governing
memberships, `organization_history_periods`).

The reading states **one total** and keeps every provenance visible inside it. It supersedes the
2026-10-15 P0 ("two figures of their own, never summed") **for the all-time total only**: the
journal figure and the organization-history figure stay beside it as the two provenances it is
made of, and the period tiles (today / 7 / 30 / 365 days) still read the journal alone.

Trigger: the owner saw "25,6 val. darbo žurnale" and "800 val. organizacijų istorijoje" and no
figure that said what the professional experience adds up to; the Vivat Rex period and the
Nonstop Group management were nowhere in that experience.

## Rules (binding, pinned by `lib/journal/professional-experience.test.ts` and
`lib/guards/professional-experience-one-history.test.ts`)
1. **Every work hour once.** A journal entry counts once (the canonical work-time rule). An
   organization day record that describes a live journal entry is the same work — listed, not
   added. A period record whose span holds a same-organization day record may be a summary of
   those days — listed, not added (the pinned rule of `organization-all-time.ts`). Journal hours on
   days inside a counted same-organization period are listed as "within the organization's
   period" and not added: the organization's figure stands, the person's entries stay the
   detail. Every line says whether it was counted and, if not, why.
2. **No invented days.** A period record keeps its span and its one figure. It is never spread
   over days, weeks, months or years.
3. **Provenance stays visible, never hidden by a confirmation state.** Every line names its source
   (journal / organization day records / organization period record) and its evidence level
   (own record / manager-confirmed / organization-reported). Recorded work counts; the confirmed
   part is a sub-figure of it. Recorded ≠ confirmed ≠ settled stay three facts (decision
   `historical-work-never-needs-invoices`): no invoice, payment or settlement is read.
4. **Roles are experience without hours.** Ownership, management, project leadership, employment,
   subcontracting — every relationship to an organization is part of the person's history, with
   the organization's stated earlier business periods (e.g. "Vivat Rex") as continuity of the same
   business. A role NEVER carries hours: an organization's project hours are its people's work,
   never the leader's personal hours. A director with no roster row still led the company; their
   experience does not depend on a worker or roster row existing.
5. **UNKNOWN ≠ ZERO.** An unreadable journal makes the figure `null`; an unreadable organization
   ledger adds nothing and is said (`organizationUnknown`); unreadable relationships leave the
   roles unlisted and the hours unchanged.
6. **No score, rank or rating.** Hours, spans, roles — as recorded.
7. **General, not one account.** The reading is the same function for every person; the owner's
   production rows are the regression fixture, not a special case.

## What this changes in code
- `lib/journal/work-intelligence.ts` — additive: `journalAllTime` (all-time lines per engagement
  context and project with hours per work day; NOT focus-scoped) and `entryIds`; entries may carry
  `projectId` (the journal list core now selects `project_id`).
- `lib/journal/professional-experience.ts` — the pure reading: `deriveProfessionalExperience`.
- `lib/journal/professional-experience-read.ts` — the person's relationships (active and ended
  engagements incl. the governing `manager` relationship, plus owner/manager memberships with
  business periods). Reads nothing about other people and no organization-wide hours.
- Surfaces: `components/app/work-in-numbers/experience-scale.tsx` (the total first, the two
  provenances, a fold with the per-organization / per-project breakdown, roles, business periods
  and every not-counted line with its reason); the Living CV page (premium fact + printable
  line, `VerifiedCvData.professionalExperience` → MCP); the profile fact strip
  (`player-card-fact-experience-total`).

## What it does NOT do
- It does not write anything, move any record, merge any organization or alter any import.
- It does not attribute any organization's records about OTHER people to a leader.
- It does not change the owner's data: the one 800 h record keeps the period its importer chose
  (2025-06-01..2025-11-30) although its source text speaks of "at least 16 months × 50 h"; any
  correction is an owner-side correction record, never an agent edit.
