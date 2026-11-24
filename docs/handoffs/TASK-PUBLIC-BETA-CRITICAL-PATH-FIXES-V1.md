# TASK — Public Beta Critical Path Fixes v1

## Goal

Fix the critical first-experience failures as one connected public-beta blocker path.

This task replaces separate fragmented fixes for:
1. duplicated dashboard actions;
2. profile/profession/skills locking;
3. Work Journal locked to one work type;
4. unclear relationship between work identity, skills, journal proof, and opportunities.

The current implementation violates the owner instruction that related workflows must be connected, not duplicated as separate cards/routes. The product must stop feeling like scattered internal functions and become one coherent work-identity journey.

---

## Current Critical Problems

### Problem A — Dashboard duplicate actions

Observed on `/lt/dashboard`:

Skill / profile setup appears through several parallel entry points:

- readiness card: `Nurodykite profesiją`
- readiness card: `Pridėkite įgūdžius`
- large panel: `Jūsų darbo tapatybė` / `Atidaryti profilį`

Work Journal appears through several parallel entry points:

- top/hero action: `Įrašykite pirmą darbo įrašą` / `Atidaryti`
- readiness card: `Įrašykite pirmą darbo įrašą`
- large panel: `Darbo dienoraštis` / `Atidaryti dienoraštį`

This is a critical UX failure. The dashboard must not show multiple separate cards for the same workflow.

### Problem B — profession/skills are locked to one primary profession

Observed on `/lt/dashboard/profile`:

- user selects one main profession, e.g. `Armaturininkas`;
- skills are then limited to that profession;
- user cannot honestly add other real directions such as:
  - `Betonuotojas`;
  - `Plytelių meistras`;
  - `Brigadininkas` / team lead;
  - adjacent work directions.

This violates the non-locking product doctrine.

### Problem C — Work Journal is locked to one narrow work template

Observed on `/lt/dashboard/journal`:

- journal form shows a narrow field such as `PLYTELIŲ TIPAS`;
- user cannot choose/log other real work types;
- journal is not yet a flexible proof-capture surface for real work.

This blocks the proof layer because workers do many types of work, not only one template category.

### Problem D — Work identity and Work Journal are not connected enough

The correct relationship should be:

```text
Work identity
  -> work directions
  -> skills
  -> journal entries
  -> proof/confirmation later
  -> contextual fit/opportunity signals later
```

The current product makes these feel like separate fragments.

---

## Product Rule

A person is not locked by the first profession, first role, or first entry point.

The system must support:

```text
Person
  -> primary work direction
  -> additional work directions
  -> skills/capabilities
  -> journal proof entries
  -> future confirmations
  -> future contextual fit signals
```

The dashboard should guide the user through this journey, not duplicate the same routes.

---

## Absolute Non-Negotiables

Do not touch:

- PR #18
- Supabase migrations
- RLS/RPC
- production DB schema
- billing
- payments
- deploy
- DNS
- env
- migration files

Do not add:

- fake AI
- fake automatic parsing
- fake matching
- fake verification
- fake scores
- fake jobs
- fake candidates
- fake companies
- scoring engine
- matching engine
- verification engine
- new DB/schema changes

If a real schema change is required for any part, stop and report that sub-problem as blocked. Do not create migrations in this sprint.

---

## Required Investigation First

Before implementing, inspect and report:

### Dashboard action map

1. Which component generates readiness cards.
2. Which component generates lower work identity / journal panels.
3. Exact routes for:
   - profession setup;
   - skills setup;
   - profile/work identity;
   - journal;
   - role management;
   - pilot/opportunity path.
4. Which CTAs are duplicates.
5. Which route should be canonical for each workflow.

### Profile/profession/skills

1. How worker professions are stored.
2. How worker skills are stored.
3. Whether the schema already supports multiple worker professions.
4. Whether the current lock is UI/query filtering only.
5. Whether skills can be selected independently of the primary profession.
6. Whether `Brigadininkas` is represented as profession, skill, role/activity, or missing taxonomy.

### Work Journal

1. Which field/template causes `Plytelių tipas`.
2. Whether journal entries can already store work type/category, notes, quantity, unit, date, context.
3. Whether taxonomy already contains broader work types.
4. Whether the lock is UI/template filtering or schema limitation.
5. Whether profile skills/professions can propose journal work types without migration.

Report the investigation clearly before code changes.

---

## Required Connected Solution

### 1. Dashboard canonical action map

Replace scattered duplicate CTAs with one clear connected path.

Preferred dashboard structure:

#### A. Work Identity

Single canonical entry point for:

- profile;
- primary direction;
- additional directions;
- skills;
- languages;
- mobility;
- documents;
- CV preview.

CTA examples:

- LT: `Tvarkyti darbo tapatybę`
- EN: `Manage work identity`

#### B. Work Proof / Journal

Single canonical entry point for:

- work journal;
- completed work entries;
- quantities/units;
- notes;
- future proof/confirmation.

CTA examples:

- LT: `Atidaryti žurnalą`
- EN: `Open journal`

#### C. Opportunities / Roles

Only if it leads to real current functionality:

- add another role/activity;
- request pilot;
- manage opportunities later.

CTA examples:

- LT: `Tvarkyti roles`
- EN: `Manage roles`

Do not show duplicate cards for profession and skills separately if both lead to the same profile workflow.
Do not show duplicate journal cards/buttons.

### 2. Multi-profession / multi-capability work identity

If existing schema supports it, update UI/query only so worker can:

1. Keep one primary work direction.
2. Add additional directions/capability groups.
3. Select skills from more than one direction where taxonomy exists.
4. See selected capabilities in CV/live preview.
5. Understand first choice is not a limit.

Example target:

```text
Primary direction: Armaturininkas
Additional directions: Betonuotojas, Plytelių meistras
Leadership capability: Brigadininkas / team coordination, if taxonomy supports it
```

If requested categories do not exist in taxonomy, do not fake them. Report missing taxonomy and show a safe fallback path.

### 3. Work Journal multi-work-type manual entry

If existing schema supports it, update the journal form so worker can:

1. Choose or enter broader work direction/category.
2. Keep free-text notes central.
3. Enter quantity and unit.
4. Save entry.
5. See entry listed with the selected direction/category where supported.

Minimum manual structure:

- Date
- Context/activity
- Work direction/category
- Object/project
- Quantity
- Unit
- Notes: `What did you do?`

Do not implement fake AI parsing.

### 4. Future automatic journal extraction docs

Add documentation only for the future ideal flow:

```text
Worker writes natural-language entry
  -> system suggests date/time/location/work categories/skills/quantities/units
  -> worker reviews and confirms
  -> manager/client can later confirm
  -> confirmed proof strengthens contextual signals
```

Extraction suggestions must never be silently persisted as confirmed facts.

---

## Copy Direction

### Dashboard

LT:

- `Darbo tapatybė`
- `Profilis, kryptys, įgūdžiai ir CV vienoje vietoje.`
- `Tvarkyti darbo tapatybę`
- `Darbo įrodymai`
- `Žurnale fiksuokite atliktą darbą. Vėliau įrašai taps įgūdžių įrodymais.`
- `Atidaryti žurnalą`
- `Jūsų pirmas pasirinkimas nėra riba — vėliau galėsite pridėti daugiau krypčių.`

EN:

- `Work identity`
- `Profile, directions, skills, and CV in one place.`
- `Manage work identity`
- `Work proof`
- `Log completed work. Entries later become proof for skills.`
- `Open journal`
- `Your first choice is not a limit — you can add more directions later.`

### Profile

LT:

- `Pagrindinė darbo kryptis`
- `Papildomos kryptys`
- `Darbo kryptys ir įgūdžiai`
- `Pridėkite daugiau sričių, kuriose galite dirbti`

EN:

- `Primary work direction`
- `Additional directions`
- `Work directions and skills`
- `Add more fields you can work in`

### Journal

LT:

- `Ką šiandien atlikote?`
- `Darbo kryptis`
- `Pasirinkite darbo tipą`
- `Kiekis`
- `Matavimo vienetas`
- `Papildoma informacija`
- `Įrašas vėliau galės būti susietas su įgūdžiais ir patvirtinimais`

EN:

- `What did you do today?`
- `Work direction`
- `Choose work type`
- `Quantity`
- `Unit`
- `Additional details`
- `This entry can later connect to skills and confirmations`

---

## Implementation Limits

Allowed:

- app UI/query fixes;
- copy/i18n;
- docs/handoff/audit;
- local gitignored review artifact;
- route/link cleanup;
- using existing taxonomy/data structures.

Not allowed:

- migrations;
- DB schema changes;
- fake parser;
- fake AI;
- fake matching/search/verification/scoring;
- production credentials or production DB writes beyond normal app testing by owner.

---

## Review Artifact

Create local gitignored artifact:

```text
runtime/review/public-beta-critical-path-fixes-v1/
```

It should show:

1. Before problem summary.
2. New dashboard canonical action map.
3. Work identity / multi-direction UI state.
4. Work Journal multi-work-type/manual entry state.
5. Mobile frames if possible.
6. What remains blocked by taxonomy/schema if anything.

---

## Acceptance Criteria

This task is complete only if:

1. Dashboard no longer duplicates profile/skills actions.
2. Dashboard no longer duplicates journal actions.
3. Worker sees one canonical work identity path.
4. Worker sees one canonical journal/proof path.
5. Profile no longer feels locked to one profession if schema supports multiple directions.
6. Journal no longer visibly locks the user to only `Plytelių tipas` if schema supports broader categories.
7. Missing schema/taxonomy is explicitly reported if not fixable without migration.
8. Automatic extraction is documented as future, not faked.
9. Mobile is cleaner.
10. No unsafe systems are touched.
11. Validation is real.

---

## Validation

Run available checks:

- typecheck
- lint
- build
- placeholders/check if present
- all locale JSON parse if copy changed
- route smoke if available
- forbidden path check
- git diff scope verification

If checks cannot be run, state why. Do not fake validation.

---

## Final Report Must Include

1. Branch name.
2. Commit SHA.
3. PR URL.
4. Exact files changed.
5. Investigation summary:
   - dashboard duplicates root cause;
   - profile/profession lock root cause;
   - journal `Plytelių tipas` root cause.
6. Whether each issue was solved without DB migration.
7. Final canonical dashboard action map.
8. How worker can add additional work directions/capabilities.
9. How journal can now capture broader work types/manual text.
10. What remains missing in taxonomy/schema.
11. Review artifact path.
12. Validation results.
13. Closed-beta blocker status after this PR.
14. Confirmation that PR #18, migrations, RLS/RPC, DB schema, billing, deploy, env, fake AI/matching/verification/scores/search were not touched or added.

---

## Recommended Branch Name

```text
fix/cc/public-beta-critical-path-fixes-v1
```
