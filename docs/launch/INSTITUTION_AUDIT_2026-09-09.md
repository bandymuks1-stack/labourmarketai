# Institution readiness audit — 2026-09-09

Owner readiness directive, Priority 5: *"Do NOT claim institutions are ready."*
This audit does not claim that. It answers the four questions the directive
asks — what works, what is merely unreachable, what genuinely does not exist,
and what is blocked specifically by `#1648` — measured against **production**,
not against the register.

Every row below was read from the live database or from a live function
privilege on 2026-09-09. Where this contradicts an earlier handoff, the
contradiction is stated rather than smoothed over.

---

## 1. WHAT ACTUALLY WORKS — built, reachable, rendered

| step | mechanism | live state |
|---|---|---|
| Institution declares itself | `organization_roles.role_slug = 'training_provider'` | **2 organizations hold it** |
| Programme | `create_education_program_v1` — SECURITY DEFINER, `authenticated` has execute | **1 exists** |
| Cohort | `create_education_cohort_v1` — DEFINER, `authenticated` has execute | **1 exists** |
| Learner → cohort | `set_education_cohort_member_v1` — DEFINER, `authenticated` has execute, and it HAS an app caller (`lib/education/program-actions.ts`) | **0 used** |
| Employer demand per programme | EDU-6, built + reachable (`#1647`) | renders, degrades to "unknown" honestly |
| Learner outcomes read | `institution_learner_outcomes_v1` — DEFINER, `authenticated` has execute | **exists AND is connected** |
| The person's own education | `worker_education` | 4 rows, 1 `is_current` |

The outcomes read is wired: `lib/education/institution-outcomes.ts` →
`components/app/institution-learners-section.tsx` → rendered on
`/dashboard/company` behind
`declaredCapabilities.includes("training_provider")`. `InstitutionProgramsSection`
renders beside it.

**A CORRECTION TO THE 2026-09-08 HANDOFF.** That document named the
institution's blockers as *"programme immutability (#1648) and the absence of
any report or export"*. The **report** half is not absent — the outcomes
function exists, is executable by `authenticated`, and has a live caller and a
rendered surface. What is genuinely absent is a **downloadable export** (CSV or
file), which is a different and much smaller claim.

---

## 2. WHAT IS MERELY UNUSED — a human fact, not a code gap

**0 cohort members.** The write is a DEFINER function that `authenticated` may
execute, it has an application caller, and 2 organizations already hold the
capability that renders the surface. Nobody has added a learner.

That is the same distinction the brigade needed on the same day: `0 rows` is
adoption, and calling it "missing" hides the fact that the next person to try
would succeed. It is **not** evidence that the journey works either — nobody
has walked it, so it stays **NOT HUMAN_UI_PROVEN**.

---

## 3. WHAT IS GENUINELY BLOCKED BY `#1648`

`education_programs` has **exactly one RLS policy, a SELECT**, and no update
function anywhere. Verified 2026-09-09:

```
education_programs        SELECT × 1     (no INSERT/UPDATE/DELETE policy)
education_cohorts         SELECT × 1
education_cohort_members  SELECT × 1
```

The cohorts and members are written by DEFINER functions, so SELECT-only is
correct for them. `education_programs` has **no writer at all beyond
creation** — so a programme is immutable from the moment it exists.

And that lands on the one field that matters. Production's single programme:

| name | `target_profession_slug` | `education_type_slug` |
|---|---|---|
| `E2E Pastolininkų kursas (testinis)` | **NULL** | **NULL** |

`target_profession_slug` is the field that switches on the employer-demand
count. With it NULL, that programme reads **"no direction" permanently** and
its institution cannot correct it. This is exactly `#1648`'s premise, and the
premise still holds.

**AN ASYMMETRY WORTH NAMING.** `training_programs` DOES have
`update_training_program_v1` (DEFINER, `authenticated` may execute).
`education_programs` has no equivalent. Two programme models with different
mutability, and the one the institution surface uses is the immutable one.

### OWNER DECISION REQUIRED — `#1648`

**DECISION** Merge and apply `#1648` (an institution may correct a programme
it created), or leave programmes immutable.

**WHY NOW** It is the only thing standing between an institution and a
correct programme. Nothing else in the chain is blocked.

**CURRENT BEHAVIOUR** A programme's profession and type are fixed at creation.
The live programme has both NULL, so its employer-demand direction reads "no
direction" and no actor in the system can change that.

**PROPOSED BEHAVIOUR** The creating institution may update the programme it
owns.

**USER IMPACT** Without it, an institution that mistypes or skips the
profession at creation must live with a programme that can never point at
employer demand. With it, the EDU-6 demand read starts working for programmes
that are currently inert.

**SECURITY / DATA IMPACT** A new write path on `education_programs`, scoped to
the owning organization. No existing policy is loosened; nothing is granted to
`anon`.

**REVERSIBILITY** Reversible — the migration adds a policy/function that can
be dropped, and no data is transformed.

**ALTERNATIVE IF DECLINED** The institution deletes and recreates the
programme — except there is no DELETE policy either, so today the alternative
does not exist. Declining means programmes stay permanently as first typed.

**EXACT ACTION TO APPROVE** Say so explicitly, and `#1648` is merged and
applied via Supabase MCP `apply_migration`. **It has NOT been touched by this
window.**

---

## 4. WHAT DOES NOT EXIST

* **A downloadable export** of learner outcomes. The data is readable and
  rendered; there is no file to hand to a ministry or a funder.
* **Competency → qualification / recognised equivalence.** Unchanged, and
  named in the journey register as NOT_BUILT.
* **Assessment / verification as an institution act.** The evidence layer is
  the worker's and the employer's; an institution assessing a learner's
  practice is not modelled.
* **A learner invitation type.** `invitations.invitation_type` admits
  `join_platform, join_organization, join_team, join_as_employee,
  collaborate_partner, join_project, invite_company` — there is no learner or
  student value, by design: the relationship is DATA
  (`education_cohort_members`), not an invitation kind.

---

## 5. HONEST VERDICT

**The institution journey is NOT ready to send today**, and the reason is
narrower than "it is not built":

* the chain from declaring the institution, through programme and cohort, to
  reading learner outcomes and employer demand, is **built, reachable and
  rendered**;
* **nobody has ever walked it** — 0 cohort members — so it is
  **NOT HUMAN_UI_PROVEN** at any step;
* and the one programme that exists is **permanently mis-pointed** because
  `#1648` is owner-gated.

Sending it to a school today would show them a programme that cannot say what
profession it trains for, with no way to fix it. That is the specific reason to
wait, and it is one owner decision away.

**No institution code, schema, policy or grant was changed by this window.**
`#1646`, `#1648`, `#1641` and `#1421` are exactly where they were.
