# Skills truth contract v1

One honest model for what a "skill" is, where each kind lives, and how it
may be counted and labelled. Born from production finding F9: the
dashboard said "19 skills declared" while the journal said "2
journal-supported" — two different tables counted as if they were one
population, with no label saying so.

## Why the numbers could never match

- "skills declared" counted `profile_skill_claims` — free-text claims
  extracted from the worker's own profile text.
- "journal-supported" counted `worker_skills where source='work_journal'`.
- Journal evidence attaches ONLY to catalogued `worker_skills`
  (`apps/web/lib/journal/journal-entry-skills-actions.ts` keeps only
  already-declared worker_skills when linking entries). A free-text claim
  therefore can NEVER become journal-supported without first becoming a
  catalogued `worker_skills` row. The two counts were structurally
  incomparable — not a bug in the counting, a bug in the model.

## The three honest categories

| Category | Meaning | Storage |
|---|---|---|
| **Declared** (deklaruota) | The worker says they have it. Unverified. | `profile_skill_claims` (free-text) + `worker_skills` with `source='self_declared'` |
| **Work-backed** (darbu pagrįsta) | Journal entries evidence it. Stronger than declared, still NOT confirmed. | `worker_skills` with `source='work_journal'`, evidence rows in `journal_entry_skills` |
| **Confirmed** (patvirtinta) | A manager confirmed it. The only category the card may visually celebrate. | `worker_skills` with `verified = true` (manager-confirmed) |

This is the "honest evidence ladder": declared → work-backed → confirmed.
Each rung is a strict claim upgrade; the UI must never present a lower
rung with a higher rung's visual weight.

## Count coherence rule

ALL surfaces (dashboard, player card, journal, profile) derive skill
counts from the SAME builder: `apps/web/lib/player-card/player-card.ts`.
No surface runs its own ad-hoc count query. Every displayed number states
WHICH population it shows, in human words:

- "Deklaruoti įgūdžiai: 19"
- "Darbu pagrįsti: 2"
- "Patvirtinti: 0"

A bare unlabelled "Įgūdžiai: N" is banned. Two surfaces showing different
numbers for the SAME labelled population is a defect.

## No automatic verification

Nothing in the system auto-confirms a skill:

- the free-text extractor (`apps/web/lib/profile/skill-claim-extractor.ts`,
  dictionary extended on this branch) produces DECLARED claims only;
- journal linking produces WORK-BACKED evidence only;
- CONFIRMED requires a real manager action through the existing suggestion
  confirm flow. No AI step, batch job, or import may set `verified=true`.

## Review / accept / edit flow

Detected and declared skills are reviewable by the worker via the
existing suggestion confirm flow: accept (promotes a free-text claim into
a catalogued `worker_skills` row, making it eligible for journal
evidence), edit (correct the catalogue mapping), or dismiss. This flow is
the ONLY bridge from free-text claims to the catalogued ladder.

## UI language rules

- No "signalai" — the internal evidence vocabulary never reaches the UI
  (see `docs/launch/product-presentation-contract-v1.md`).
- Human words only: deklaruota / darbu pagrįsta / patvirtinta (declared /
  work-backed / confirmed). No "source=work_journal", no enum values, no
  architecture talk.
- The visual celebration (badge, colour, icon emphasis) is reserved for
  CONFIRMED. Work-backed gets a calm evidence indicator; declared gets
  plain text.

## Guard surface

Copy guards in `apps/web/lib/guards/` (forbidden-terms and worker-facing
copy families) ban the internal vocabulary; the player-card builder is the
single code path for counts, so a new surface bypassing it should fail
review by construction.
