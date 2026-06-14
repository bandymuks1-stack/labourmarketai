# Staffing Operating Model v1 — Labourmarket.ai

> **What this is.** The business + operating source-of-truth for the Staffing
> Content & Operating Model v1 sprint. It defines what Labourmarket.ai *is* as a
> business, the real staffing chain it automates, the worker/company/agency
> segments, where the AI layer helps and where it must never decide, and the path
> from intake to booking to a (future, owner-gated) contract/payment step.
>
> **The line that governs everything:** *Labourmarket.ai automates the operations
> of an international labour-force agency, but it does NOT use AI as a legal,
> verification, or payment authority.* The AI layer (Internal LLM Agents v1) is a
> helper engine that turns chaotic information into structure — the product is the
> labour-supply / matching / readiness / booking system. Truth lives in the
> database and in human/admin decisions, never in a model output.

## 0. What Labourmarket.ai is (in business terms)

A **digital international labour-force agency** built from four cooperating engines:

1. **Worker passport** — one durable worker identity carrying profile, trade,
   skill evidence, documents, country readiness, availability, and logistics
   (accommodation / transport / language) needs.
2. **Readiness engine** — deterministic + sourced checks of what a worker or
   company still needs before a placement in a given country can start.
3. **Matching system** — connects a company's structured need to candidates,
   surfacing fit and **blockers honestly** (never hiding a legal/doc gap).
4. **Booking system** — turns an agreed match into a booking request with an
   immutable readiness snapshot, then into a (future) contract/payment path.

The AI layer assists each engine by drafting, structuring, and explaining — it is
**not** the product and is **not** an authority.

## 1. The real business situation (why this exists)

- A **worker** wants a good job abroad.
- An **employer** wants a person or a crew, fast, who can actually start.
- An **agency / operator** wants to connect both sides quickly and reliably.
- What blocks every deal: **trust, documents, accommodation, language,
  transport, price, and the start date.**

So the product must encode real staffing/recruitment content + operational flows —
not another generic dashboard: people by trade; countries and work directions; the
foreign-worker journey; accommodation supply/demand; CV / worker intake; vacancy /
company-need orders; availability from a date; ZZP / self-employed / brigades;
employer / agency / subcontractor models; recruiting content; staffing /
detachering / subcontracting; and **real responsibility, not just a pretty card.**

## 2. The chain this sprint automates

```
1  Worker intake (by profession)
2  AI worker-profile draft (suggestion)
3  Worker passport / CV card
4  Readiness + documents
5  Country fit
6  Accommodation / transport / language / start-date fit
7  Company need / vacancy order
8  Matching / shortlist
9  Booking request
10 Contract / payment path (placeholder — no live payment)
11 Admin / staffing-operator control
```

Each step is a real operational surface. AI appears at 2, 7, 8, and as an
explanation/next-action helper at 4–6 and 10–11 — always labelled, never deciding.

## 3. Worker segments

- **Employed worker** — looking for a job as an employee.
- **Solo specialist** — one tradesperson available for placement.
- **ZZP / self-employed** — offers a service, invoices, may need VAT/registration.
- **Brigade / team** — a crew offering itself as a unit (lead + members).
- **Agency-supplied worker** — managed inside an agency's worker pool.

The UI must make the distinction explicit: *a person looking for work as an
employee* vs *a person offering a service as ZZP* vs *a brigade offering a team*
vs *a company looking for workers* vs *an agency managing a pool.*

## 4. Company segments

- **Direct employer** — hires onto its own payroll.
- **Subcontractor** — needs a crew for a contracted scope.
- **Agency / staffing buyer** — sources labour to re-supply.
- **Main contractor** — needs multiple trades across a site.

Engagement models carried in the data: **employment · subcontracting · agency
supply (detachering)** — chosen per need, never assumed.

## 5. Agency / subcontractor / ZZP models

| Model | Who supplies labour | What Labourmarket.ai does |
|---|---|---|
| Direct employment | the company | structures the need, matches candidates, books |
| Subcontracting | a ZZP/brigade/subcontractor | presents the crew as a unit, surfaces readiness |
| Agency supply (detachering) | the agency's pool | operator view of the pool, multi-client needs |

## 6. Starter countries (work directions)

**Launch funnels:** Netherlands, Germany, Denmark, Norway, Sweden, Finland.
Each is grounded in the existing sourced `lib/labour-market` evidence + country
readiness records — never invented numbers, always "likely required / needs
verification / not legal advice." Funnel UI languages: **LT, EN, RU, PL** at
launch; **LV, EE, NL, DE** prepared where the i18n system allows.

## 7. Starter professions (trades)

Grounded in the existing professions taxonomy (`messages/*/professions.json`):
general_laborer (construction general worker), carpenter, **formwork carpenter**,
**steel fixer** (= rebar_worker), concrete_worker, **bricklayer** (= mason),
plasterer/drywaller, painter, tiler, roofer, electrician, plumber, welder,
**HVAC/ventilation**, mechanic/technician, plus warehouse/logistics where already
supported. Cleaning/green sector only if it fits strategy. New trade slugs follow
the §10 Lego slug-registry rule — no hardcoded enums.

## 8. Where AI helps

- **Worker intake → profile draft** (`worker_profile`): turn rough text into a
  structured draft profile + suggested skills + headline + missing fields.
- **Work journal → structure** (`work_journal`).
- **Skill evidence → candidate levels** (`skill_evidence`).
- **Documents/readiness → plain explanation** (`document_assistant`).
- **Company need → normalized vacancy draft** (`company_need`): clean the free
  text, surface missing fields + internal matching criteria + readiness blockers.
- **Country readiness → sourced checklist** (`country_readiness`, evidence-required).
- **Matching → explanation layer** (`matching_explanation`): fit/gaps/blockers.
- **Booking → risk explanation** (`booking_risk`).
- **Admin → risk queue + candidate notes** (`admin_risk`).
- **Support → next action** (`support_onboarding`); **copy** (`translation_copy`).

## 9. Where AI cannot decide (hard limits)

AI MUST NEVER: verify a skill, document, identity, or legality; produce a legal
guarantee or "fully legal"; publish a profile or vacancy without human review;
invent pay, experience, clients, or matches; produce a fact-presented score;
confirm a booking (the RPCs enforce conflicts); take payment; promise work or
earnings. Every AI output is a **suggestion** the human/admin or an existing
confirmed write path turns into a record. (Enforced by the Internal LLM Agents v1
guards: `ai-output-schema-required`, `ai-content-safety`, etc.)

## 10. Path to booking / contract / payment

```
match agreed → booking request (readiness snapshot, conflict-checked by RPC)
  → contract/payment READINESS checklist (what's still missing)
  → manual contract + (future, owner-gated) billing test-mode → live (separate sprint)
```

This sprint ships the **readiness checklist** and the booking linkage. **Live
payments stay OFF**; no final legal contract is generated; no money is taken. The
billing test-mode foundation already exists and is reused, inert.

## 11. Revenue framing (no fake prices)

- **Worker acquisition** — free worker profile / worker passport (optional Worker
  Plus later). The worker side is the top of the funnel; it is not the paid product.
- **Employer acquisition** — companies/agencies are where value is captured.
- **Paid service (future, owner-gated):** company pilot access · pay-per-successful-
  connection · pay-per-active-booking · monthly company access · recruitment
  service fee · agency pool management · **manual quote**. Until prices are
  confirmed, surfaces show **"Pilot access / request a quote"** — never a fake price.

## 12. Honesty / safety guardrails for this sprint

No fake jobs · no fake testimonials · no promise of work or wages · no legal
guarantee · no AI verification of documents/skills/legality · no AI publish
without review · no live Stripe / live keys · no DNS · no Vercel secrets without
owner approval · no destructive migrations · no legacy/LABMA terms · no copying
any competitor's text or design or brand · a company never sees a worker's private
documents without consent. Placeholders are labelled **preview / concept / not
live yet** (doctrine §18; "demo" is banned).

## 13. Current foundation (reused, not rebuilt)

Worker profile/readiness base · country readiness + sourced `lib/labour-market`
evidence · documents · booking schema · billing test-mode schema · plan
boundaries · **Internal LLM Agents v1** (11 suggestion agents + env-gated
provider + prompt registry + safety guards). Owner-gated and separate: PR #379
`ai_runs/ai_suggestions` migration (Supabase MCP apply); real LLM provider (Vercel
env); Stripe test checkout (Stripe/Vercel TEST env); live payments forbidden.

## 14. Definition of done (this sprint)

A clear operating-model doc (this) · real worker intake by profession · AI
profile draft as a suggestion · foreign-worker funnels (LT/EN/RU/PL) · company
vacancy order form v2 · ZZP/brigade path · accommodation/transport/language as
**matching criteria** · operator candidate pool · need→shortlist→booking path ·
contract/payment readiness (payments off) · AI suggestions visible + labelled in
worker/company/admin · honest pricing · green tests/guards/build · mobile
screenshots · a final report stating what is genuinely sale-ready and what still
blocks live payments.
