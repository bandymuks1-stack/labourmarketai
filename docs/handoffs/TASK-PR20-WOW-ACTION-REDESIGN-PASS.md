# TASK — PR #20 WOW Action Redesign Pass

## Status

PR #20 must remain **OPEN + DRAFT**. Do not merge yet.

The current PR #20 improves structure and honesty, but it does **not yet create the required WOW feeling**.

Owner feedback:
- Current review artifact feels like a long static list.
- The app interior still feels close to the old static visual style.
- The phrase “Gyva paklausa” is not acceptable when talking about people and labour-market participants. It feels like commodity-market framing.
- WOW should feel like action, movement, cinematic operation, live system, and guided next steps — not static cards and long lists.

---

## Non-Negotiables

Do not touch:

- PR #18
- Supabase migrations
- RLS/RPC
- production DB
- billing
- payments
- deploy
- DNS
- env
- migration files

Do not add:

- fake AI
- fake matching
- fake verified skills
- fake ratings
- fake jobs
- fake candidates
- fake companies
- fake real metrics
- new DB/schema changes

Keep all demo/concept visuals governed by `docs/DEMO_TO_REAL_DATA_POLICY.md`.

---

## Goal

Turn PR #20 from “structured static beta dashboard” into a stronger WOW first-app experience.

This is a **visual/action redesign pass**, not a DB or product-scope expansion.

The result should feel like:

- action;
- movement;
- cinematic labour-market OS;
- guided operating cockpit;
- premium scouting / draft / opportunity system;
- people-first, not commodity-market language.

---

## Required Language Fix

Remove or replace the phrase:

```text
Gyva paklausa
```

Do not describe people as “demand” in a way that feels like a market for meat or commodities.

Preferred language directions:

- `Galimybių radaras`
- `Darbo galimybių srautas`
- `Veiklos ir galimybių radaras`
- `Talentų ir poreikių signalai`
- `Komandų ir galimybių žemėlapis`
- `Atitikimų kryptys`
- `Rinkos galimybių pulsas`
- `Darbo rinkos judėjimas`

Use wording that respects people as participants, not objects.

---

## Visual Redesign Requirements

### 1. Replace long static lists with action flow

Do not present the core experience as a kilometer-long list of cards.

Use instead:

- 3-step action lane;
- timeline / progress path;
- mission-control style panels;
- status pulse;
- “next best action” block;
- movement between identity → readiness → opportunities.

Example structure:

```text
Start → Build identity → Add proof → Open opportunities
```

### 2. Worker hub should feel active

The worker surface should not feel like a static profile checklist.

It should feel like:

- “Your work identity is coming online”
- “Next move”
- “Readiness path”
- “Proof signals”
- “Opportunity direction”

Avoid boring list-only layout.

### 3. Company / agency surface should feel like an operating cockpit

The company/agency surface should not look like plain early-access cards.

It should feel like:

- “Define need”
- “Prepare criteria”
- “Review possible fit”
- “Request pilot review”
- “Build your activity space”

Again: action path, not passive list.

### 4. Add motion/action feeling without fake data

Can use:

- animated gradient/shine/pulse;
- small “signal” indicators;
- directional arrows;
- progress rails;
- staged journey cards;
- cinematic panel composition;
- preview labels where needed.

Do not claim real live activity unless backed by data.

### 5. Keep human dignity

Copy must make clear:

- people are not commodities;
- the system connects abilities, needs, activities, teams, companies, and opportunities;
- honest profiles and real proof create better opportunities.

---

## Specific Checks

Check and improve these areas:

1. `/dashboard` worker overview.
2. `/dashboard` company/agency/customer overview.
3. Any visible copy containing:
   - `paklausa`
   - `matching`
   - `market`
   - `score`
   - `live`
   - `verified`
   - `gyva`
4. Review artifact `runtime/review/pr20/index.html` if regenerated.
5. Mobile layout for the new action surfaces.

---

## Do Not Do

Do not:

- rebuild the whole landing page;
- remove all concept visuals;
- translate all 8 remaining locales in this sprint unless needed by touched keys;
- implement PR #11 skill aggregation;
- implement real matching;
- implement scoring;
- implement verification;
- add new database fields;
- add payment or pricing logic.

---

## Acceptance Criteria

PR #20 can move toward merge only if:

1. The phrase “Gyva paklausa” is removed/reframed.
2. Worker and company/agency surfaces feel more like action/cinematic operation, less like long static lists.
3. The first app experience shows a clear next move within 30 seconds.
4. Concept/demo visuals remain allowed but are not framed as real production claims.
5. Mobile remains clean.
6. No unsafe files or systems are touched.
7. Review artifact is regenerated and shows the improved worker/company surfaces.
8. Validation is real.

---

## Validation

Run available checks:

- typecheck
- lint
- build
- placeholders/check or no-fake guard if present

If checks cannot be run, state why. Do not fake validation.

---

## Final Report Must Include

1. Branch name.
2. Commit SHA.
3. PR #20 updated commit SHA.
4. Exact files changed.
5. What copy was changed, especially replacements for “Gyva paklausa”.
6. What visual/action changes were made.
7. Whether review artifact was regenerated and where.
8. Mobile status.
9. Validation results.
10. Confirmation that PR #18, migrations, RLS/RPC, DB, billing, payments, deploy, DNS, env, and fake AI/matching/verification/job/candidate/company claims were not touched or added.
