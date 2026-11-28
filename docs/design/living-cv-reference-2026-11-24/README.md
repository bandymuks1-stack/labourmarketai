# Living CV — final owner standard (2026-11-26)

The two owner-supplied images below are the final information-design references for the
person and organization Living CV. They supersede conflicting visual direction in the
historical 2026-11-24 reference retained below. They are a standard for a later implementation
stage, not a request to implement another dashboard variant now.

- **Organization:** [final organization reference](owner-final-organization-2026-11-26.png).
- **Person:** [final person reference](owner-final-person-2026-11-26.png).

These are design mock-ups. Their names, figures, scores, badges, reviews and performance
percentages are illustrative, not production evidence or permission to manufacture data.
Production screenshots continue to follow the existing private, de-identified evidence rules.

## Existing task and implementation links

This standard belongs to the existing [function register](../../program/FUNCTION_REGISTER.md):
**2.4 — person Living CV / player card / EU export** and **3.36 — company Living CV**.
It does not create a new registry, design project, capability, database or source of truth.
The existing premium-design and player-identity documentation remains applicable where it
agrees with this current owner decision.

The already implemented professional journey is `CareerJourneyMap`, fed by
`deriveCareerJourney` and the current CV reader. It draws real professional stops and skill
lines on a time axis, with a vertical phone layout. Reuse that verified implementation for
the temporary view where a minimal safe change is possible. Do not rebuild it or roll back
the whole release. Retain other verified theme, history, privacy and functional fixes.
The temporary person CV entry opens the existing Experience tab and its professional journey;
all tabs retain explicit addresses. The organization CV has no equivalent verified person-style
journey projection to reconnect in a minimal change, so its working current view is retained.
The two-column text-node experiment is not the final standard; its further design work is
stopped. If a safe minimal restoration is unavailable for a surface, keep that surface
working, record its concrete limitation in the existing task and continue core functions.

## Information design

Use the professional premium athlete-card principle: career, teams, periods and results
translate to actual professional history, organizations, projects, capabilities and work
results. Use simple, understandable visual hierarchy, coherent themes and responsive screens.
Charts must show meaningful measurements and development over time. Decorative connections
between journal paragraphs do not satisfy this standard.

Selecting a skill, project, period or work place must open the factual records behind it.
Every aggregate must remain traceable to its existing source. The main view should be easy
to scan; detailed records and evidence remain accessible through the existing interactions.

## Person Living CV

Show, when supported by actual permitted data:

- Professional periods, organizations, work places and geography, and projects participated in.
- The specific work performed, duration, quantities and measurement units.
- Time attributable to each skill only when the actual allocation is known.
- Total professional experience and the experience of individual competencies, separately.
- Confirmed and unconfirmed experience and its evolution over time.
- Actual productivity measures only when the evidence and denominator are sufficient.
- Work evidence, photo reports, documents, qualifications and real reviews.

## Organization Living CV

Show, when supported by actual permitted data:

- The organization's operating history, project periods and geography.
- Work types, quantities, total work hours, competency-specific hours and actual results.
- Confirmed and unconfirmed experience, photo reports and other evidence.
- Current team, historical team composition, worker and brigade competencies.
- Current capacity, worker/team availability, and ongoing and completed projects.

**Historical experience and current capacity are different facts.** When a worker leaves,
their participation in prior projects and the organization's recorded historical experience
remain part of that history under the existing access/privacy rules. Current capacity must
reflect the changed team composition. Do not attribute the organization's hours to its owner
or a current employee merely because they hold a role there.

## Dynamic data and integrity

The existing computations and readers must reflect relevant changes: a worker joining or
leaving; a brigade changing; a project being created or completed; a work entry, work report
or photo report being added; a result being confirmed; an original record being corrected;
availability changing; or a student/trainee moving into a worker role.

- One fact has one authoritative source. Reuse existing journals, reports, projects,
  organization/person history, classifications, confirmations, calendar, computations,
  graphs, components and APIs. Do not create parallel storage or a new competence system.
- Do not duplicate hours, skills, projects or professional experience. An entry involving
  several skills does not give its entire duration to every skill when allocation is unknown.
- Never invent proficiency levels, productivity, percentages, ratings, periods or confirmations.
  A pictured chart is not evidence that its example measure exists in the product.
- Show unavailable measures as unavailable. Do not fabricate the missing inputs or create
  new architecture to obtain them without an owner decision.
- Preserve source records, history, media relationships, evidence state, existing privacy and
  access restrictions, and the already approved outcome-level patent description. No technical
  patent details or new SQL/security/financial authorization are granted by this standard.

## Current delivery priority

Defer the final premium dashboard implementation. Use the existing work organization and focus
on the working journeys for people/workers, employers, agencies, brigades, students/trainees and
education/training institutions: registration/login/roles and profiles; AI conversation creation,
history, continuation and context under current access rules; journals and reports (including
existing scheduling and approval); photo reports; calendar and availability; actual Living CV
and PDF export; public work/worker/service/subcontractor search; publishing; messages and contacts.

Repair specific existing connections so one work fact reaches its report, calendar, project
and Living CV without being entered again. Verify real actions in the existing isolated
production Chrome session. Green CI or a merged PR alone does not establish user acceptance.
Use targeted development checks, mandatory integration checks and existing reliable evidence.
Do not restart broad audits, invent design variants or create additional coordination systems.

---

## Historical 2026-11-24 reference (retained, superseded where conflicting)

### Owner visual reference (2026-11-24)

The owner provided two reference images for the worker Living CV, on desktop and phone:
`owner-reference-1.webp` and `owner-reference-2.webp`. They are the target look for `/[locale]/cv`. The
organization Living CV follows the same card language. This is binding owner direction, owner P0 2026-11-24.
It extends `docs/design/premium-design-map-v1.md` and `docs/design/player-identity-adaptation-plan.md`, and
does not replace them.

The images are **mock-ups with invented people and numbers**. They define layout and quality, not data.
Every value on the real page comes from the platform, or the element is not shown (decision 0023, decision
0025, doctrine §7).

## Layout (desktop 1440)

1. **Identity card (left):** a premium collectible-style portrait card with a dark surface and a gold frame.
   It shows the person's consented photo (else the monogram), the display name, the main profession, the
   country flag, and a short row of real facts.
2. **Header (right of the card):** the name, profession and specialisation, the availability status, the
   languages as chips, and the evidence badge. Actions on the right: **Download CV**, **Contact** and
   **Invite to project**, all reusing the existing actions.
3. **Fact strip:** years of experience, projects, hours worked. All three come from
   `lib/journal/professional-experience.ts`; UNKNOWN is shown as unknown, never as 0.
4. **Three panels:** competencies (evidenced skills), languages + qualifications, and a recommendation (only
   a real, confirmed review; otherwise the panel is not rendered).
5. **Tabs:** Overview · Experience · Projects · Photos · Documents · Reviews. These are the page's existing
   sections, reached by tabs; nothing is duplicated.
6. **Recent projects:** a carousel of project cards with a real evidence photo, title, country and period.
7. **Experience timeline (right):** organizations with period, hours and role, from the one history reader.
   Each hour is counted once.
8. **Confirmed vs unconfirmed:** a clear split, such as the reference's ring "confirmed 85% / unconfirmed
   15%", computed from the evidence states.

## Phone (390 / 375)

The card comes first, then the fact tiles, then **Invite to project** and **Contact**, then tabs and
sections stacked in the same order. Bottom navigation as on the rest of the app. No sideways scroll.

## Data rules (binding)

- **No invented scores.** The reference's card rating ("86"), attribute scores (PAT/KOM/ATK/KOK), skill
  percentages and star ratings are placeholders. Show a number only if the platform already computes it
  from evidence by a documented rule (for example the confirmed share of hours, or a skill's evidence count).
  Otherwise show the skill without a percentage. Never fabricate a rating.
- **Reviews and recommendations:** only real, confirmed ones. With none, the element is absent.
- **Photos and video:** only evidence media the person consented to show.
- **No helper text** (decision 0032): no explanatory captions, no "what the user sees" or "why this format"
  panels. Those panels in the reference are the owner's notes to us, not page content.
- **De-identified screenshots** use "Darbuotojas Nr. 1", "Darbuotojas Nr. 2" and so on, rewritten at render
  time only. The source data never changes.
- Every locale; 1440, 390 and 375 px.
