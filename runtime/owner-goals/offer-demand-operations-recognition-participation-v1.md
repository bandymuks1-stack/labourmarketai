# labourmarket.ai — Offer–Demand Operations, Recognition, and Participation Loop v1

## One agent command

```text
PROJECT: labourmarket.ai
PATH: C:\Users\Mano\Documents\labourmarketai
GOAL: Build the full Offer–Demand Operations, Recognition, and Participation Loop v1 for labourmarket.ai: one practical path where workers, companies, agencies, teams, and buyers can submit what they offer or need; the system recognizes the meaning, asks missing questions, creates a structured card, recommends the best 1–3 next options/actions, and rewards useful participation with private progress messages plus anonymized weekly public results.

You are working only in the clean rebuilt labourmarket.ai project at C:\Users\Mano\Documents\labourmarketai. Do not reference or touch the abandoned legacy project. Do not copy external products, visual systems, names, pricing, copy, or competitor implementation patterns. Use external examples only as abstract market signals: good job posts need structured details for real matching; work companies need one place for offers, invoices, photos, project progress, client communication, documentation, planning, and follow-up; automated systems should reduce manual administration by turning inputs into actions.

First create a source-grounded audit. Then implement only the smallest safe functional v1 path that moves the product toward paid launch without broad redesign, duplicate systems, fake content, or unapproved database/security changes.
```

---

## Core product idea

labourmarket.ai must not become a generic job board, CRM clone, admin dashboard clone, or a scattered set of disconnected forms.

It must become a practical work-market operating system:

1. A user enters a need or an offer.
2. The system recognizes what the user means.
3. The system extracts structured data.
4. The system shows what is missing.
5. The system asks only the missing questions.
6. The system creates a clear card.
7. The system recommends the best 1–3 matches or next actions.
8. The system records useful progress.
9. The system motivates responsible participation with private appreciation and anonymized weekly progress results.

The product rule is:

> Do not show 1000 random results. Show the best 1–3 useful options with reasons, missing details, risks, and next action.

---

## Required audit before implementation

Create or update:

```text
runtime/audits/offer-demand-operations-recognition-participation-v1.md
```

The audit must be completed before implementation.

### Audit must list

- Existing routes/components/actions/types/tests related to worker profile, company profile, dashboard, service requests, market map, journal, CV/avatar/player card, matching, notifications, and activity history.
- Existing data already available for worker capability, company need, project need, service offer, location, availability, documents, photos, and readiness.
- Existing duplicate or drifting surfaces that must not be rebuilt.
- What can be implemented without database changes.
- What requires database/RLS/RPC/permission changes and must stop for owner approval before implementation.
- What can be safely implemented in this PR.
- What must be split into later PRs.
- Privacy boundaries for public weekly results and company/team thank-you messages.
- Exact allowed implementation slice after audit.

Do not start coding before this audit exists.

---

## User paths to support

### 1. Worker: “I need work”

The worker can submit availability through existing profile/CV/journal/player-card data where possible and through a guided input if needed.

Recognize:

- Main profession.
- Additional trades.
- Years of experience.
- Sector experience.
- Task experience.
- Tools and equipment.
- Ability to read technical drawings.
- Languages and level.
- Certificates.
- Current location.
- Preferred countries/regions.
- Start date.
- Rotation preference.
- Salary expectation.
- Documents.
- Work photos.
- References.
- Team/company relationship where already safely available.

The system must distinguish:

- Claimed information.
- Imported information.
- User-confirmed information.
- Evidence-backed information.

### 2. Employer / agency / company: “I need workers”

The user can paste a raw job post or fill a guided form.

Recognize:

- Role.
- Specialization.
- Sector.
- Country/region/city/object.
- Start date.
- Duration.
- Rotation.
- Hours per week.
- Salary.
- Gross/net.
- Currency.
- Overtime.
- Accommodation.
- Food.
- Travel.
- Transport to work.
- Tools/PPE.
- Required experience.
- Required language.
- Required certificates.
- Required documents.
- Driving license.
- Legal employer.
- Contract type.
- Deal-breakers.

The system must show:

- What was recognized.
- What is missing.
- What must be completed before the job is match-ready.
- What the best next action is.

A vague job post must not be treated as a high-quality match-ready post.

### 3. Company / team / service provider: “I offer services”

Recognize:

- Trade/service type.
- Team size.
- Available capacity.
- Region/countries.
- Equipment.
- Documents.
- Rates.
- Languages.
- Availability.
- Proof/photos.
- Company identity where available.
- What types of projects the team can accept.

Create a structured service card and match it to project/company needs.

### 4. Buyer / company / project owner: “I have a project or task”

Recognize:

- Problem/project type.
- Trade needed.
- Scope.
- Location.
- Urgency.
- Timing.
- Budget/rate expectation.
- Required team size.
- Required documents.
- Materials.
- Photos.
- Risks.
- Decision-maker/contact context where safely available.

Create a structured project/request card and recommend the best 1–3 workers, teams, companies, or next questions.

### 5. Work operations after match

Every match must lead to a next action, not a dead end.

Supported next actions should include, using existing safe structures where available:

- Contact.
- Request missing information.
- Request CV.
- Request work photos.
- Request documents.
- Save to shortlist.
- Mark interested.
- Send offer/request.
- Create project/work record.
- Add progress photo.
- Add note.
- Mark follow-up.
- Mark readiness improved.

Do not build full accounting/invoicing unless it already exists safely. Instead define the correct future place for offers, invoices, WKB-style documentation, project progress photos, client messages, planning, and handover records.

---

## Recognition model

Create or extend a normalized recognition layer with clear types.

Required conceptual types:

```text
JobDemand
WorkerCapability
ServiceOffer
ProjectNeed
MatchResult
MissingField
RiskFlag
NextAction
ParticipationEvent
ReadinessState
WeeklyPublicDigest
PrivateProgressMessage
```

Each recognized card must include:

- Recognized fields.
- Confidence level.
- Missing fields.
- Deal-breakers.
- User-confirmed fields.
- Source/evidence type.
- Risk flags.
- Recommended next action.

---

## Missing field detection

A pasted job post like this must be handled correctly:

```text
Ship carpenter, Ålesund, Norway, rotation 4/2, accommodation, meals, travel covered, 3 years of shipyard experience, technical drawings, power tools.
```

Expected recognition:

```text
Role: ship carpenter
Location: Ålesund, Norway
Sector: shipyard / floating units
Rotation: 4/2
Work scope: installation, dismantling, renovation, finishing, ship furniture, walls, ceilings, floors
Experience: minimum 3 years
Conditions: accommodation, meals, travel covered
Skills: technical drawings, power tools, carpentry tools
```

Expected missing fields:

```text
Exact salary
Gross/net
Currency if not clear
Weekly hours
Overtime rules
Contract type
Legal employer
Language requirement
Driving licence requirement
Tools/PPE details
Accommodation type
Accommodation deductions if any
Travel payment timing
Required documents
Start date precision if not clear
```

The UI must explain missing details in normal human language, not technical language.

---

## Matching rule

Do not match by keywords only.

A match must compare real compatibility:

- Profession fit.
- Sector fit.
- Task experience fit.
- Location/mobility fit.
- Start date fit.
- Rotation fit.
- Salary fit.
- Language fit.
- Document/certificate fit.
- Evidence/proof strength.
- Freshness of information.
- Deal-breakers.
- Risk flags.

Each match result must say:

- Why this is a fit.
- What is missing.
- What risk exists.
- What the next action should be.
- Whether the match is ready, needs more information, or should be rejected.

The default UI must show max 1–3 best options.

---

## Participation, recognition, and weekly results loop

The system must motivate useful participation.

Do not reward empty logins. Reward meaningful actions that improve match quality, trust, documentation, or response reliability.

### Useful participation actions

Examples:

- Worker updates availability.
- Worker adds missing location/preferred region.
- Worker adds real work experience.
- Worker adds work photos.
- Worker adds or updates CV.
- Worker confirms skills/tasks.
- Worker responds to a real request.
- Worker rejects a bad match responsibly.
- Company completes missing job fields.
- Company adds salary, rotation, housing, travel, legal employer, language, documents, or scope.
- Company updates a service offer.
- User adds project progress photos.
- User improves a work/project record.
- User reduces missing fields or risk flags.

### Readiness state

Track internally where possible:

- Profile readiness.
- Job need readiness.
- Project need readiness.
- Service offer readiness.
- Response reliability.
- Information freshness.
- Documentation quality.
- Match confidence improvement.
- Missing fields reduced.
- Risk flags resolved.

Show to users in simple language:

```text
Your profile is match-ready.
3 important details are still missing.
Adding work photos can improve trust.
Your availability is outdated.
This job need is not ready for good matches yet.
This company need improved this week.
```

Do not create a public popularity score. Do not create a surveillance-style productivity score. Do not publicly rank named workers.

### Private progress messages

Trigger private appreciation messages for useful actions.

Worker example:

```text
Good update. Your profile became clearer today because you added availability, location, and work details. This improves your chance of receiving better matches.
```

Company/job need example:

```text
Your job need is stronger now. Adding rotation, accommodation, travel, and required experience helps us show fewer but better candidates.
```

Company owner/team example, only if permissions and relationships already exist safely:

```text
Your team member updated important work information today. This helps your company appear more reliable and improves matching quality for future work.
```

Rules:

- Do not spam.
- Do not make messages childish.
- Do not manipulate users with fake streaks.
- Do not expose private data to company owners unless the relationship/permission already allows it.
- Do not send company-owner messages if safe permission is unclear.

### Public weekly results digest

Create a weekly public-facing anonymized result concept or implementation if it can be done safely without unapproved database/security changes.

Allowed examples:

```text
This week, 18 worker profiles became match-ready.
7 company needs became clear enough for better matches.
A carpenter profile improved from low readiness to match-ready after adding work photos, location, and rotation preference.
Most requested trades this week: ship carpentry, finishing, welding.
3 project needs were clarified enough to produce top 3 matches.
```

Never publicly show:

- Full worker names.
- Employer names.
- Company names.
- Exact private location if it can identify a person.
- Private salary expectation tied to a person.
- Private documents.
- Private photos unless explicit future consent exists.
- Low performers.
- Weak users.
- Anything that shames or exposes people.

The weekly digest must use real aggregated events only. No fake counters. No demo data. No invented winners.

---

## UI direction

Keep the existing premium sports/player-card direction.

Use simple flow language:

```text
What do you need?
What do you offer?
What did we recognize?
What is missing?
Best matches
Next action
Profile readiness
Need readiness
This improved your match quality
```

The user should feel:

- One clear place.
- Less administration.
- More useful matches.
- Better trust.
- Clear next action.
- Visible progress.

Do not create a generic CRM-looking interface. Do not copy external dashboard visual systems. Do not use external product names in UI, docs, PR title, file names, tests, or commands unless strictly needed in source notes.

---

## Hard constraints

- Mobile-first.
- One clear flow, not scattered pages.
- Reuse existing profile, journal, market map, service request, player card, dashboard, and matching logic where already available.
- Do not duplicate profile completion or matching surfaces.
- Do not introduce fake/demo content.
- Do not add public copy saying preview, beta, coming soon, owner review later, manual approval, or similar.
- Do not expose technical terms such as DB, RLS, RPC, migration, provider keys, internal guards, or implementation language to normal users.
- Do not create broad redesigns.
- Do not change billing, auth, legal identity, map provider strategy, production config, or database policy unless the audit proves it is required and owner approval is requested first.
- If database/security changes are required, stop after documenting the exact needed plan and ask owner approval before implementation.
- No public leaderboard of named workers.
- No empty-login rewards.
- No public shaming.
- No private data leaks.
- No competitor names in command text, file names, PR titles, tests, guards, UI copy, or implementation docs.

---

## Implementation scope for v1

After the audit, implement the smallest safe path that can work from the UI.

Target v1:

1. One entry point for:
   - I need work.
   - I offer work/services.
   - I need workers.
   - I have a project/task.

2. A guided input card where the user can paste text or fill key fields.

3. Recognition result card:
   - recognized fields
   - missing fields
   - risk flags
   - readiness state
   - next action

4. Structured summary card:
   - worker capability
   - job demand
   - service offer
   - project need

5. Top 1–3 match/explanation panel using existing real data only where available.

6. Private progress/thank-you message concept or implementation using existing safe message/activity structures.

7. Weekly anonymized public results concept or implementation using real aggregate data only where safely available.

8. Tests and guards.

If full persistence requires schema/security work, keep the v1 as source-audited and UI/type/logic safe, then document the next database PR separately.

---

## Suggested PR split

Do not create one huge uncontrolled PR if the audit shows the work is too large.

Preferred sequence:

### PR 1

```text
feat(market): add offer demand recognition path v1
```

Scope:

- Audit.
- Recognition types.
- Missing-field detection.
- Guided input.
- Structured result card.
- Next action panel.
- Focused tests.

### PR 2

```text
feat(market): add participation recognition loop v1
```

Scope:

- Participation event definitions.
- Readiness improvement labels.
- Private progress messages.
- Weekly anonymized public digest concept/implementation.
- Privacy tests.

### PR 3 only if needed and owner-approved

```text
feat(market): persist recognition events safely
```

Scope:

- Database/security changes only after owner approval.
- RLS/RPC/permission plan must be documented before coding.

---

## Acceptance criteria

### Recognition

- Pasted job text is recognized into structured fields.
- Missing salary, gross/net, hours, contract type, language, driving licence, legal employer, tools/PPE, accommodation details, and travel details are detected.
- Worker profile can be compared to a job need.
- Company/service/project needs follow the same recognition pattern.
- Match explanations include fit, missing fields, risks, and next action.
- UI shows max 1–3 recommended options.

### Participation loop

- Useful worker action can produce a private progress message.
- Useful company/job action can produce a private progress message.
- Company owner/team message is allowed only when relationship and permissions are already safe.
- Empty login does not trigger reward.
- Weekly public result concept/output is anonymized and aggregate only.
- Public digest contains no names, private company identities, private documents, or private photos.

### UX/copy

- No dead-end screen.
- No fake examples as production data.
- No technical/internal copy leaks to users.
- No forbidden copy such as preview, beta, coming soon, owner review later, manual approval.
- Touched visible copy is available in LT/EN/RU if the surface already uses locales.
- Product stays in the existing labourmarket.ai premium/player-card direction.

### Validation

Run and report:

```text
npm run typecheck
npm run lint
npm run build
```

Also add focused tests for:

- recognition parsing
- missing-field detection
- match explanation
- no forbidden public copy leaks
- anonymized weekly digest
- no private names in public digest
- meaningful-action trigger
- no reward for empty login

---

## Final report required from agent

The final report must include:

- Branch name.
- PR URL.
- Changed files.
- What was audited.
- What was implemented.
- What was intentionally not implemented.
- What requires owner approval.
- Validation results.
- Route/screenshot notes.
- Exact next safe PRs.
- Confirmation: no merge and no deploy without owner approval.
