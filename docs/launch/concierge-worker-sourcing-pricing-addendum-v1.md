# Concierge-first Worker Sourcing + First-Client Pricing Addendum v1

Date: 2026-07-07. Owner-operated. **Docs-only. No code, no product, no
security change.** This is a practical field addendum to the manual launch
train — read it next to:

- [`manual-paid-launch-runbook.md`](./manual-paid-launch-runbook.md) — how a
  paying pilot is served today (off-platform payment + superadmin manual grant;
  no automated payments, nothing flips `PAYMENTS_ENABLED`).
- [`../sales/README.md`](../sales/README.md) — the honesty rules every
  client-facing template follows (no fake "verified", no fake AI/matching, no
  guarantee, warm network only, no auto-send).
- The public `/company-need` intake + the owner queue at
  `/dashboard/admin/company-need-intakes` (PR #681) — where a real request lands
  and how the operator moves it `new → contacted → qualified → rejected`.
- The construction partner route (PR #679/#680): `UAB Nonstop Group (LT)` and
  `Labour Market AI Sp. z o.o. (PL)`.

Everything in this file is an operator playbook + owner-review-only drafts. It
does not auto-send anything and does not claim any capability the product does
not have.

---

## 1. Purpose

**Why this addendum exists.** The public launch surface is done (intake, owner
queue, partner route, acronym clarity). The next thing that makes money is not
another website audit — it is *execution*: having real workers/companies to
offer, and a simple price to charge, so the owner can serve the **first**
construction client by hand within 48 hours.

**Why concierge-first.** Matching is not automated, and we do not pretend it is.
At this stage the value is delivered by a human operator who reads the need,
sources real people from a warm network, and hands back a short honest
shortlist. Manual is not a stopgap we are embarrassed by — for the first clients
it is the *correct* method: it builds trust, produces real evidence, and teaches
us what to automate later. The platform is used as **intake + owner queue +
structure**, not as a magic matcher.

**Why seed 15–25 profiles before paid ads.** If we advertise before we can
answer a request, we burn the first clients and the reputation with them. A
small, real, permission-cleared pool of 15–25 LT/PL construction profiles means
that when the first `/company-need` intake arrives, the operator already has
someone real to consider — the 48-hour promise is credible on day one. Ads come
*after* we can reliably deliver a shortlist.

**How it connects.** Client submits `/company-need` → row appears in the owner
queue as `new` → operator runs the 48-hour workflow below → status moves to
`contacted` then `qualified` (shortlist delivered) or `rejected` (cannot serve
honestly). The seed pool is what makes the middle step fast.

---

## 2. The 15–25 profile seed target

Goal: **15–25 real LT/PL construction profiles**, permission-cleared, before any
paid advertising. Mix of individual workers and small subcontractor/company
options.

Prioritise the trades most likely to be requested first:

| Priority | Trade | Notes |
|---|---|---|
| High | General construction workers (pagalbiniai / bendrieji statybininkai) | Widest demand, easiest first placements. |
| High | Finishers (apdailininkai) | Frequently requested; broad skill label — record specifics. |
| High | Bricklayers (mūrininkai) | Common brigade trade. |
| High | Plasterers (tinkuotojai) | Often paired with finishers/painters. |
| High | Painters (dažytojai) | High turnover of short jobs. |
| Medium | Carpenters (staliai / dailidės) | Formwork vs finish carpentry — record which. |
| Medium | Electricians (elektrikai) | Documents/certification matter more — mark clearly. |
| Medium | Plumbers (santechnikai) | As above. |
| High | Small teams / brigades (brigados) | A ready 3–6 person brigade is the highest-value seed. |

Target shape (guideline, not a quota): ~15 individuals across the high-priority
trades, ~5–10 brigade/company options. A single reliable brigade lead who can
bring a team is worth more than five loose individuals — weight effort
accordingly.

---

## 3. Where to source manually (warm network only)

Use warm, consent-based channels. **No scraping. No mass/unsolicited messaging.
No purchased lists.**

- The owner's / company's existing network.
- `UAB Nonstop Group (LT)` and `Labour Market AI Sp. z o.o. (PL)` contacts,
  where appropriate — as a partner-company route (see §12 and the partner
  framing rules), not as a guarantee.
- Previous worker contacts the owner has actually worked with.
- Referrals from workers already known and trusted ("who else is good?").
- Lithuanian / Polish construction groups the owner is genuinely part of.
- Trade-specific communities (e.g. a finishers' or electricians' circle).
- Direct calls / messages to people already known.
- Local subcontractor / small-company contacts.
- Recommendations from already-known people.

**Cautions (non-negotiable):**

- Do **not** add unverified random profiles to the pool.
- Do **not** present a person or company as *available* unless they have
  actually confirmed availability.
- Always **record the source and a confidence level** (see the template §5).
- If someone has not given permission to store/show their profile, they do not
  go in the pool.

---

## 4. First-contact scripts (LT / PL / EN)

Short, respectful, honest. Each asks (a) are you available for construction
work, and (b) may we show your profile to a potential client for a specific
opportunity. **Owner-review-only drafts — the owner edits and sends each one
personally; nothing here auto-sends.**

They must never imply an employment guarantee or a legal-services promise.

Ask for: trade/profession; current country/city; when available; preferred
countries; team size (if company/brigade); language level; documents/status
(known or unknown); expected pay range (if willing to share); proof / reference
/ photos (if available); and **permission** to store/contact/show the profile
for a specific work opportunity.

### 4.1 Lithuanian

> Sveiki, [vardas]. Dirbu su statybų darbdaviais Lietuvoje ir užsienyje ir kartais
> ieškau patikimų žmonių ar brigadų realiems darbams.
>
> Norėčiau paklausti:
> 1. Kokia jūsų specialybė / ką dirbate?
> 2. Kur šiuo metu esate (šalis / miestas)?
> 3. Nuo kada galėtumėte pradėti?
> 4. Kuriose šalyse norėtumėte dirbti?
> 5. Ar dirbate vienas, ar turite brigadą (kiek žmonių)?
> 6. Kokios kalbos ir koks lygis?
> 7. Ar turite dokumentus/statusą tvarkingą, ar tai dar reikėtų tikrinti?
> 8. Jei norite pasakyti — koks apytikslis pageidaujamas atlyginimas?
> 9. Ar turite nuotraukų / rekomendacijų / atliktų darbų pavyzdžių?
>
> Jei atsiras konkretus darbas, ar galėčiau parodyti jūsų profilį galimam
> klientui? Nieko negarantuoju iš anksto — tik norėčiau turėti jūsų sutikimą,
> jei atsiras tinkama galimybė.
>
> Ačiū!

### 4.2 Polish

> Dzień dobry [imię]. Współpracuję z firmami budowlanymi w Polsce i za granicą i
> czasami szukam sprawdzonych osób lub brygad do realnych zleceń.
>
> Chciałbym zapytać:
> 1. Jaka jest Pana/Pani specjalność / co Pan(i) robi?
> 2. Gdzie się Pan(i) obecnie znajduje (kraj / miasto)?
> 3. Od kiedy mógłby/mogłaby Pan(i) zacząć?
> 4. W których krajach chciał(a)by Pan(i) pracować?
> 5. Pracuje Pan(i) sam(a), czy ma brygadę (ile osób)?
> 6. Jakie języki i na jakim poziomie?
> 7. Czy dokumenty/status są uregulowane, czy trzeba to jeszcze sprawdzić?
> 8. Jeśli chce Pan(i) podać — orientacyjne oczekiwane wynagrodzenie?
> 9. Czy ma Pan(i) zdjęcia / referencje / przykłady wykonanych prac?
>
> Jeśli pojawi się konkretne zlecenie, czy mogę pokazać Pana/Pani profil
> potencjalnemu klientowi? Niczego nie gwarantuję z góry — chciałbym tylko mieć
> zgodę, gdyby pojawiła się odpowiednia okazja.
>
> Dziękuję!

### 4.3 English

> Hello [name]. I work with construction employers in Lithuania, Poland and
> abroad, and I sometimes look for reliable people or crews for real jobs.
>
> A few questions:
> 1. What is your trade / what do you do?
> 2. Where are you currently (country / city)?
> 3. From when could you start?
> 4. Which countries would you prefer to work in?
> 5. Do you work alone, or do you have a crew (how many people)?
> 6. Which languages, and at what level?
> 7. Are your documents/status in order, or would that still need checking?
> 8. If you're willing to share — a rough expected pay range?
> 9. Do you have photos / references / examples of past work?
>
> If a specific job comes up, may I show your profile to a potential client? I'm
> not guaranteeing anything up front — I just want your permission in case a
> suitable opportunity appears.
>
> Thank you!

---

## 5. Minimum worker / company profile template (copy-paste)

```
PROFILE TYPE:            individual / brigade / company
NAME or COMPANY NAME:
CONTACT PERSON:
CONTACT (phone/email/messenger):
COUNTRY:
CITY / REGION:
PROFESSION / TRADE:
SKILLS:
EXPERIENCE SUMMARY:
AVAILABILITY DATE:
PREFERRED COUNTRIES:
TEAM SIZE:              (1 if individual)
LANGUAGE LEVEL:         (e.g. LT native, EN basic, RU good)
DOCUMENTS / STATUS:     known / unknown / needs checking
ACCOMMODATION:          has own / needs / to discuss
TRANSPORT:              has own / needs / to discuss
EXPECTED PAY RANGE:     (if known; else "not shared")
WORK PROOF:
  - photos:             yes / no
  - references:         yes / no (contact if shareable)
  - previous projects:  (names/types if shareable)
  - certificates:       (if relevant)
  - client confirmation: yes / no
SOURCE:                 (who / where this came from)
SOURCE RELIABILITY:     direct known contact / referral / self-declared / unverified
PERMISSION TO SHARE:    yes / no / limited
FIT NOTES (for a specific client need):
RISK NOTES / UNKNOWNS:
```

Rules for filling it:
- Every field that is unknown is written as `unknown` — never guessed.
- `WORK PROOF` and `DOCUMENTS/STATUS` are recorded as-claimed and marked
  unverified until a real check (see §7).
- No profile enters the shortlist pool without `PERMISSION TO SHARE: yes` (or a
  clearly recorded `limited` with what is allowed).

---

## 6. Qualification rules

How the operator decides if a profile is usable.

**Minimum to keep (all required):**
- a real contact path exists;
- the trade is clear;
- country/region is clear;
- availability is at least roughly known;
- permission to contact/share exists;
- the source is recorded;
- major unknowns are clearly marked.

**Strong profile (offer these first):**
- confirmed availability;
- proof / reference / photos present;
- clear trade and experience;
- language level known;
- document/onboarding situation at least partially known;
- pay expectations not wildly incompatible with the client's need.

**Reject or hold if any of these:**
- no permission to share;
- identity/company not plausible;
- availability not confirmed (hold — do not present as available);
- unrealistic claims ("can do everything", pay far outside market);
- no usable contact path;
- source cannot be evaluated.

"Hold" ≠ "reject": a promising profile with one missing piece (e.g. availability
not yet confirmed) sits in a hold state until the operator closes the gap — it is
just not offered to a client until then.

---

## 7. Work Proof evidence request (honest, not bureaucratic)

Ask for evidence lightly, in the same conversation — never a form-heavy demand:

- photos of previous work (phone photos are fine);
- project names / types, if shareable;
- a reference contact, if they're willing;
- a certificate / card / document, if relevant to the trade;
- an employer/client confirmation, if available;
- before/after photos;
- a short description of what the person actually did on a job.

**Honesty rule (hard):**
- Unverified evidence is stored and labelled **unverified**.
- Evidence is labelled **verified only after a real confirmation** (the operator
  actually spoke to the reference, saw the certificate, or confirmed the project).
- Never turn a self-declared claim into a "verified" fact. This mirrors the
  product rule: "verified" means a real human confirmed it, nothing less.

---

## 8. 48-hour sourcing workflow (operator checklist)

Timed against the moment a `/company-need` intake lands in the owner queue.

### 0–2 h — intake confirmation
- Open `/dashboard/admin/company-need-intakes`, read the new row.
- Classify the need: trade(s), country, headcount, urgency, timing, engagement
  type (employment / subcontracting / agency supply).
- If key details are missing, contact the client to confirm.
- Set queue status → **`contacted`**.

### 2–12 h — profile sourcing
- Search the existing seed pool first.
- Contact known LT/PL workers/companies for this specific need (scripts §4).
- Ask for availability **and** permission to show the profile.
- Collect the minimum profile fields (§5) for each candidate.

### 12–24 h — qualification
- Drop weak/unreachable profiles.
- Verify the essential details you can (§6, §7).
- Mark unknowns explicitly.
- Aim for **5–8 internal candidates** if possible.

### 24–36 h — shortlist
- Narrow to **3–5 options**.
- Write a fit explanation for each (§9).
- State risks/unknowns honestly.

### 36–48 h — client delivery
- Send the shortlist.
- Explain next steps.
- Ask the client whom they want to speak with first.
- Update queue status:
  - **`qualified`** if a useful shortlist was delivered;
  - **`rejected`** only if the need genuinely cannot be served honestly.

If the pool is thin and no honest shortlist is possible, say so to the client
(and consider the partner route §12) — do **not** pad the shortlist with
unconfirmed profiles to hit the number.

---

## 9. Fit explanation card (fit, not rating)

A reusable way to present each candidate. **Do not score people good/bad.**
Explain *fit*: why they may suit this need, what is verified, what is
self-declared, what is unknown, and what must be checked before start.

```
CANDIDATE / COMPANY:
TRADE:
LOCATION:
AVAILABILITY:
TEAM SIZE:
LANGUAGES:
WORK PROOF:            (verified: … | self-declared: … | none yet)
WHY THIS FITS YOUR NEED:
  - (concrete reasons tied to the client's request)
WHAT STILL NEEDS CONFIRMATION:
  - (documents / start date / rate / reference — be specific)
SUGGESTED NEXT STEP:
  - (e.g. "15-min call to confirm start date and rate")
```

Example (illustrative):

```
CANDIDATE / COMPANY:   Brigade lead "M." + 3 finishers
TRADE:                 Finishing (plaster + paint)
LOCATION:              Kaunas, LT — willing to travel to NL/DE
AVAILABILITY:          From ~2 weeks (self-declared, to confirm)
TEAM SIZE:             4
LANGUAGES:             LT native, RU good, EN basic
WORK PROOF:            self-declared: photos of 2 past flats; verified: none yet
WHY THIS FITS YOUR NEED: matches the plaster+paint scope and headcount; brigade
                         can start together, reducing coordination.
WHAT STILL NEEDS CONFIRMATION: exact start date, day rate, document/status for NL.
SUGGESTED NEXT STEP:   short call this week to confirm start + rate.
```

---

## 10. First-client pricing model (simple, launch-partner)

Conservative launch pricing, 2–3 options. **This is a first-cycle,
launch-partner model, not final long-term pricing, and every number here is a
draft range for the owner to set per deal — nothing is charged inside the app
(see the manual-paid-launch-runbook: payment is collected off-platform).**

### Option A — risk-free first shortlist (recommended entry)
- **No payment if no suitable shortlist is delivered within 48 hours.**
- Purpose: the first trust-building engagement. The client risks nothing to try
  the service; we earn the right to charge only by delivering something real.

### Option B — success fee (recommended core)
- Payable **only if the client accepts and starts** with a worker/company.
- Suggested ranges (owner sets the exact figure per deal):
  - **300–700 EUR** per individual worker successfully introduced/started;
  - **1,000–2,000 EUR** per small brigade/company introduction, depending on
    project size and complexity.
- Framed as a launch-partner introduction fee, not a recruiting guarantee.

### Option C — coordination fee (optional add-on)
- Optional fixed fee for extra document / onboarding / coordination help:
  - **250–500 EUR** for coordination support.
- Framed as **coordination/help, not guaranteed legal representation**. If the
  partner route (§12) is involved, this is coordination between client and
  partner — no legal-service promise.

**Do not** use a percentage-of-contract model for the first cycle: it is hard to
define, hard to verify, and creates disputes. Keep the first offer simple:
**risk-free shortlist + a flat success fee**, coordination optional.

> **Key pricing recommendation:** lead with **Option A (risk-free 48-hour
> shortlist) + Option B (flat success fee: ~300–700 EUR per worker, ~1,000–2,000
> EUR per brigade/company)**, coordination fee (250–500 EUR) only if real
> document/onboarding help is provided. No percentage-of-contract, no upfront
> charge for the shortlist.

---

## 11. Client-facing LT message (owner-review-only draft)

> Sveiki, [vardas / įmonė],
>
> Ačiū, kad aprašėte savo poreikį. Mes peržiūrime jį rankiniu būdu — realų žmogų,
> ne automatinį algoritmą.
>
> Per **48 darbo valandas** sieksime grąžinti jums **3–5 tinkamus darbuotojų ar
> brigadų/įmonių variantus**, su trumpu paaiškinimu, kodėl kiekvienas gali tikti,
> ką jau patikrinome ir ką dar reikėtų patvirtinti.
>
> Sąlygos paprastos:
> - jei per 48 val. nerasime tinkamų variantų — už sąrašą nemokate;
> - mokestis taikomas tik tada, jei nuspręsite tęsti su konkrečiu kandidatu ar
>   įmone;
> - dokumentų / įdarbinimo koordinavimą galime aptarti atskirai.
>
> Kad galėtume pradėti, praneškite:
> 1. kokios specialybės darbuotojų reikia;
> 2. šalį ir miestą/regioną, kur reikia dirbti;
> 3. kiek žmonių;
> 4. nuo kada ir kokiam laikotarpiui;
> 5. ar reikia apgyvendinimo/transporto;
> 6. bet kokius svarbius reikalavimus (kalba, dokumentai, patirtis).
>
> Nieko negarantuojame iš anksto ir nepateikiame netikrų „patvirtintų“ profilių —
> dirbame sąžiningai ir realiai. Atsakysime su konkretumu.

## 12. Client-facing EN message (owner-review-only draft)

> Hello [name / company],
>
> Thank you for describing your need. We review it **by hand** — a real person,
> not an automated algorithm.
>
> Within **48 working hours** we aim to return **3–5 suitable worker or
> crew/company options**, each with a short explanation of why it may fit, what
> we have already checked, and what still needs confirming.
>
> The terms are simple:
> - if we don't find suitable options within 48 hours, you **don't pay** for the
>   shortlist;
> - a fee applies **only if you decide to proceed** with a specific candidate or
>   company;
> - document / onboarding coordination can be discussed separately.
>
> To start, please tell us:
> 1. which trade(s) of workers you need;
> 2. the country and city/region where the work is;
> 3. how many people;
> 4. from when and for how long;
> 5. whether accommodation/transport is needed;
> 6. any key requirements (language, documents, experience).
>
> We don't guarantee anything up front and we never present fake "verified"
> profiles — we work honestly and for real. We'll reply with specifics.

**Construction partner-route note (use only where relevant, honest framing):**
if there is no direct platform match yet for a construction need, the owner may
mention the partner route — `UAB Nonstop Group (LT)` and
`Labour Market AI Sp. z o.o. (PL)` — as a partner company that can help
coordinate documents, responsibilities, onboarding and find workers faster. No
guarantees, no automatic matching, no legal-service promise.

---

## 13. What NOT to promise

Never say or imply:
- guaranteed worker availability;
- a guaranteed legal / document result;
- automatic matching (matching is not automated);
- an exact salary or price before confirmation;
- "verified" Work Proof unless it was actually verified;
- that all candidates are employees;
- that every candidate can start immediately;
- that the platform has full market coverage.

If a client asks for any of the above, answer honestly about what we actually do:
a fast, hand-made, honest shortlist — and coordination help if wanted.

---

## 14. Queue status rules (owner queue)

Use the four statuses on `/dashboard/admin/company-need-intakes` consistently:

| Status | Meaning | Example |
|---|---|---|
| `new` | Intake received, not yet contacted. | A `/company-need` row just arrived; no operator action yet. |
| `contacted` | Client contacted / clarification started. | Operator emailed the client to confirm trade + headcount + dates. |
| `qualified` | Need is actionable, or a useful shortlist was delivered. | 3–5 real options sent; client is choosing whom to call. |
| `rejected` | Cannot serve honestly / invalid / spam / out of scope. | Test/spam row; or a need we genuinely cannot staff and won't fake. |

Notes:
- Move to `contacted` as soon as the operator engages — even before a shortlist
  exists — so the queue reflects reality.
- `qualified` is about *actionability*, not a promise the client will hire.
- Use `rejected` sparingly and honestly; it is not "we're busy", it is "we
  cannot serve this honestly".

---

## 15. First launch case-study path

Turn the first successful engagement into honest marketing.

**What to record (during, not after):**
- time to first response (intake → first operator contact);
- number of profiles reviewed internally;
- number shortlisted (delivered to client);
- time to the client call / decision;
- outcome (started / not started, and why).

**Permission to ask:**
- the client's permission to describe the engagement (even anonymously);
- any worker/company's permission before naming or showing them publicly;
- explicit permission before using any photo or identifiable detail.

**How to write it privacy-safe:**
- no real names, exact companies, phone numbers, or addresses without written
  permission;
- describe by role/trade and region ("a finishing brigade placed on a project in
  the Netherlands"), not by identity;
- use real, modest numbers ("shortlist delivered in ~30 hours"), never inflated
  or invented ones;
- if consent for details is not given, keep the story generic or don't publish
  it — a missing case study is better than a privacy breach or an exaggeration.

**Metrics worth tracking across the first few cases** (for the owner, not public):
time-to-first-response, profiles-reviewed, shortlisted, time-to-client-call,
outcome. These are the numbers that later justify — or correct — the pricing in
§10 and the decision to start paid advertising.

---

## Status of this addendum

- Docs-only. No code, DB, RLS, RPC, auth, UI, dashboard, matching, map,
  CV/profile, billing, or provider change.
- All client-facing messages and scripts are **owner-review-only drafts** — the
  owner edits and sends each personally; nothing here auto-sends.
- All pricing figures are **draft launch-partner ranges**, set per deal by the
  owner; no money moves through the app.
- Honesty rules inherited from `../sales/README.md` and the product
  constitution: no fake verified, no fake AI/matching, no guarantees, warm
  network only.
