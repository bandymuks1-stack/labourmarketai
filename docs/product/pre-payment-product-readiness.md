# Pre-Payment Product Readiness — Source of Truth

> **Canonical, binding for the pre-payment sprint.** Defines what is free, what
> will be paid, what *cannot yet* be paid, the readiness definitions, and the
> safe legal-readiness language. If a later slice contradicts this document,
> this document wins (flag the conflict in the PR). Subordinate to
> [`PLATFORM_DOCTRINE.md`](../PLATFORM_DOCTRINE.md).
>
> **State today:** payments are **NOT** connected. No Stripe, no checkout, no
> money is collected. This document prepares the product so a *separate* Stripe
> sprint can later start safely. Current-state evidence:
> [`../audits/pre-payment-readiness-current-state.md`](../audits/pre-payment-readiness-current-state.md).

## 0. The six questions the product must answer before payments

1. **Who is the person and what do they do?** → worker profile + profession +
   skills (self-declared / journal-supported / manager-confirmed) + work
   evidence. *(Live.)*
2. **Where can / do they want to work?** → `current_location_country`,
   `preferred_countries`, willing-to-relocate. *(Columns partial; UI in PR4.)*
3. **When are they free?** → `available_from`, unavailable periods, availability
   status. *(Date live; periods in PR2/PR6.)*
4. **Which documents are missing for legal work in a given country?** →
   per-country document checklist driven by `country_document_requirements`
   (seeded with official sources) vs the worker's `worker_documents`.
   *(Model live but empty; seed in PR3.)*
5. **Which company/agency is hiring, and is it itself ready to legally hire /
   host a team?** → company readiness (legal name, registration, VAT, billing,
   hiring model, insurance, countries of operation). *(Partial; PR2/PR5.)*
6. **What does a paying user actually get when payments are later switched on?**
   → the plan boundary in §4 below — described, never charged, this sprint.

If any function cannot yet be fully delivered, it is shown in an explicit
**"not ready for payment"** state — never faked as working.

## 1. Free vs paid vs not-yet-payable

These are **product boundaries**, not billing. No charge happens this sprint;
this is the map the later Stripe sprint will wire.

### 1.1 Free (always, for individual workers)
- Create and edit profile, profession, skills, narrative.
- Work journal (unlimited entries) + manager-confirmation flow.
- Basic skills + a **limited** readiness checklist (one or a few primary countries).
- Set availability (`available_from`, status) and basic preferences.
- Receive and respond to communication / booking requests addressed to them.

### 1.2 Will be paid (described now, charged later)
- **Worker Plus** — expanded CV/profile surface, **multi-country** readiness
  checklists, document-expiry reminders, priority visibility (later).
- **Company Pilot** — create worker needs, view candidate **readiness
  summaries** (safe, no private files), send booking requests, communication,
  team matching.
- **Agency Pilot** — multiple companies/needs, worker pool, document-readiness
  tracking (consent-gated aggregates), booking pipeline.

### 1.3 Cannot yet be paid (explicit "not ready for payment")
- Anything depending on **unseeded** country requirements (a country with no
  reviewed `country_document_requirements` rows shows "checklist not yet
  curated", never a paywall).
- **Contact reveal** — contacts stay hidden; there is no paid unlock this sprint
  (`canViewWorkerContact()` returns false by design).
- **Verified** document/company status without a real verification record.
- Any feature still marked `preparing` / `hidden` in
  `lib/config/feature-availability.ts`.

## 2. Data that must be collected before payments

| Domain | Must collect | Why it gates payment |
|--------|--------------|----------------------|
| Worker | profession, ≥1 skill, `available_from`, ≥1 preferred country | a paid match/booking needs a who/when/where |
| Worker | document statuses per target country | readiness can't be honest without it |
| Company | legal name, registration number, country, billing email, hiring model | can't invoice or legally hire without it |
| Company | countries of operation, accommodation/transport/language offer | need-to-candidate fit needs it |
| Demand | country, role, headcount, start, duration, required skills/docs | a need must be matchable before it's worth paying for |

Collection is **honest**: optional fields stay optional; we never block a free
worker from existing because a field is empty — we only mark readiness.

## 3. Readiness definitions (binding)

Readiness is **derived from real fields only**. No fabricated scores. A progress
indicator is allowed *only* when every input is a real, owner-entered field.

### 3.1 Worker readiness (per country)
For a target country, status is the **lowest** that applies:
- **Not enough information** — no documents logged / no availability set.
- **Missing documents** — ≥1 `required` country document is `missing`/`blocked`.
- **Needs verification** — required documents present but `pending_verification`
  (and the product offers verification for that document type).
- **Almost ready** — all `required` present; some `recommended` missing or a
  document `expires soon`.
- **Ready for this country** — all `required` documents present and not expired,
  availability set. *(Never implies a legal guarantee — see §6.)*

A worker is **never** shown to a company as "ready to start" while any required
document is missing or while a present document still needs verification.

### 3.2 Company readiness
- **Incomplete** — missing legal name / registration / country / billing email.
- **Basic** — core legal/billing present; hiring model set.
- **Hiring-ready** — core present + at least one country of operation + an
  accommodation/transport/language declaration relevant to its open needs.
Verification (`verified` status) is **admin-set only**, never self-asserted.

### 3.3 When a match may be shown
A candidate appears in a company's scouting result only through the existing
deterministic engine + safe-view (contacts hidden). The card shows readiness
signals (§3.1) honestly; "Can be considered" / "Missing documents" /
"Ready after verification" / "Ready for this country" / "Not enough information".

### 3.4 When a booking may be sent
A company may send a booking request when: it owns the demand, the worker is on
its shortlist, and the worker is contactable
(`canStartCommunicationOrBooking` — status `available` or an `available_from`
date). The booking stores a **readiness snapshot** at send time. The company can
**never** self-accept; only the worker accepts/declines. Conflicting (overlapping
accepted) bookings are blocked.

## 4. Plan boundary (no Stripe, no charge this sprint)

| Plan | For | Gets (when payments later enabled) | This sprint |
|------|-----|-------------------------------------|-------------|
| **Free Worker** | individual | profile, journal, basic skills, limited readiness | active, free |
| **Worker Plus** | individual | expanded CV, multi-country readiness, expiry reminders, priority visibility (later) | described, **not charged**; admin/manual flag only |
| **Company Pilot** | company | needs, candidate readiness summaries, booking requests, communication, team matching | described; **pilot access granted manually by admin** |
| **Agency Pilot** | agency | multi-company needs, worker pool, doc-readiness tracking, booking pipeline | described; admin-granted |
| **Admin / Internal** | staff | verify documents, manage country rules, manage pilots, see readiness gaps | active |

Subscription status may be **mock / manual / admin-controlled** only. No live
Stripe, no checkout route, no card collection. Premium surfaces render a
**"payment not enabled yet"** + **"request pilot access"** state, never a
checkout.

## 5. What must work before the Stripe sprint can start

- [ ] Worker can fill profile, set availability, pick countries, see a per-country
      document checklist, mark/upload document status, see what's missing.
- [ ] Company/agency can fill readiness, create a complete worker need, see
      candidate readiness summaries, send a booking request.
- [ ] System computes worker + company readiness from real fields, blocks fake
      "ready", detects booking conflicts, stores country requirement sources.
- [ ] Admin can see readiness blockers, verify/reject documents, manage country
      rules + pilot access, see payment-readiness blockers.
- [ ] Country module covers LT/LV/EE/PL/DE/NL/DK/NO/SE/FI with `source_url` +
      `last_reviewed_at` + `needs_legal_review` where not 100% certain.
- [ ] Plan boundary + feature gates exist without Stripe; a separate Stripe-sprint
      blocker list is written.

## 6. Legal readiness — safe language (binding wording rules)

This product provides an **informational readiness checklist**, not legal advice.

**Always say** (allowed): "readiness checklist", "documents likely required",
"needs verification", "based on official sources — confirm with the relevant
authority", "consult the official authority / an accountant / a legal advisor
where needed", "last reviewed on <date>", "needs legal review".

**Never say** (forbidden — enforced by guard in PR3/PR10):
- "guaranteed legal" / "we guarantee you can work" / "legally approved"
- "we ensure compliance" / "compliance guaranteed" / "verified legal"
- "meets all legal requirements" (as an absolute) / "certified compliant"
- presenting an **unverified** or `needs_legal_review` requirement as final.

**Every official country requirement must carry**: `source_url`, `source_title`,
`last_reviewed_at`, `reviewed_by_system = true`, and a `confidence` of
`official` / `strong` / `needs_legal_review`. If a requirement cannot be safely
confirmed it is marked `needs_legal_review` and the UI shows that explicitly.

Requirements are **informational**; the worker/company remains responsible for
final legal compliance with the competent authority. This document and the
checklist are **not** a substitute for professional legal or tax advice.

## 7. Hard prohibitions for this sprint

No Stripe live · no checkout for real users · no money collected · no legal-work
guarantees · no invented country requirements · no worker shown "ready" while
documents are missing/unverified · no private documents exposed to a company
without explicit consent · no fake scores · no demo-only UI without a real data
model · no destructive migrations · no touching DNS / Stripe keys / bank /
production secrets · no billing-live env changes.
