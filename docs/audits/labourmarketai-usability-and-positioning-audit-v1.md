# Labourmarket.ai — Usability & Positioning Audit v1 (AUDIT LOOP 2)

**Date:** 2026-07-22
**Target:** live production `https://labourmarket.ai` (HEAD `664b9ab9`)
**Method:** rendered-page reading in `lt` / `en` / `ru`, accessibility-tree capture at
375×812 (mobile) and desktop, plus source verification of every claim. No account was
created; no data was submitted.

**Grounding tester feedback this loop had to test against (owner-supplied):**
some people needed roughly an hour to understand the system; field examples are missing;
older users struggle more; the desktop version is more understandable than the phone;
construction dominance is confusing.

Each of those is treated below as a hypothesis to confirm or refute **with evidence**,
not as a given.

---

## 1. First impression — the first 5–10 seconds

### What the visitor actually sees, in order (lt homepage, verbatim)

1. Eyebrow: **"BENDRA DARBO RINKOS PLATFORMA"**
2. Headline: **"Ne paprastas CV. Realių įgūdžių ir darbo poreikių atitiktys."**
3. Sub: *"Susikurkite Labourmarket.ai profilį, importuokite CV, pridėkite realius
   įgūdžius, prieinamumą ir darbo patirtį…"*
4. Two CTAs: **"Sukurti nemokamą darbuotojo profilį"** / **"Pateikti darbuotojų poreikį"**
5. Four large animated counters: **312 / 47 / 18 / 71** with ▲▼ deltas
6. A Europe map titled **"EUROPOS DARBO KRYPTYS"** listing ten sectors

**Verdict on comprehension:** the *category* is clear within 5 seconds ("labour-market
platform, profiles and work needs, two audiences"). This is better than most early-stage
products, and the dual-CTA split is correct.

**But the first concrete evidence a visitor sees is invented (§2), and the first sector
list they see is manual-labour-only (§3).** Those two facts explain the tester feedback
far better than any generic "onboarding is hard" hypothesis.

---

## 2. F-2.1 — P1 · TRUST BLOCKER · The four hero metrics are fabricated placeholders

**Problem.** The most prominent evidence on the landing page — four large numbers with
animated up/down deltas that change every 8 seconds — is hardcoded placeholder data with
no connection to the platform.

**Evidence — the source says so itself:**

```ts
// apps/web/components/app/market-counters.tsx:8-10
/** Four hero counters. Each rotates through its placeholder `cycle` every
 *  8s with a 300ms ease-out digit roll, plus a delta indicator. No real
 *  data — the motion is the point (the values are governed placeholders). */
```

The values come from `placeholderCycle(c.id, locale)` (`apps/web/content/placeholders.ts`),
and the ▲/▼ delta is computed by differencing two adjacent entries of that hardcoded
cycle — i.e. **the "growth" indicator is also synthetic**
(`market-counters.tsx:38-43`).

**Evidence — the gap against production reality:**

| Landing page shows | Production actually has |
|---|---|
| "Darbuotojų profiliai — **312**" | `profiles` = **27**, `workers` = **27** |
| "Darbo galimybės — **47**" | `customer_requests` = **17** |
| "Nauji veiksmai — **18** ▼15" | no such metric exists |
| "Profilio užpildymas — **71**" | not derived from any profile data |

The displayed worker count is **~11.6× the real one**.

**Mitigation present:** a caption reads *"Iliustracinis platformos tinklo aktyvumas — ne
tikralaikiai rodikliai"* (`apps/web/messages/lt.json:3322`), and it is translated in all
three locales. This is honest **in intent**, and it is why this is P1 and not P0.

**Why it is still a serious defect:**

- The disclaimer is small, below four very large numbers, and directly contradicted by
  the animation — moving digits and ▲▼ arrows are the universal visual language of
  *live* data. The design signals "live" while the caption says "illustrative".
- Under the EU Unfair Commercial Practices Directive, presenting simulated platform
  activity to induce sign-up is exactly the pattern regulators treat as misleading; a
  small disclaimer is not a reliable defence when the visual claim is that strong.
- Strategically it is unnecessary. The product's *real* differentiator is honesty — the
  pricing page proves the team can do this well (§7). Fake traction is the one thing that
  would poison it.

| Field | Value |
|---|---|
| Affected user | Every first-time visitor; workers and employers alike |
| Affected path | `apps/web/components/app/market-counters.tsx`, `apps/web/content/placeholders.ts`, `messages/{lt,en,ru}.json` key `live.counters.*` |
| Business impact | Trust is the entire product thesis ("Įrodymai, o ne spėliojimas"). Being caught inflating traction 11× destroys it, and it is discoverable by anyone who signs up and sees an empty market. |
| Risk level | **HIGH** — trust blocker, legal (UCPD) exposure |
| Recommended fix | Replace with real counts from the DB, however small, or remove the block entirely. Small honest numbers ("6 companies, 27 workers, 17 open needs — early access") are a *stronger* signal for a pilot than obviously round fake ones. If a visual anchor is needed, use the EU statistics section (§7) which is already sourced and dated. |
| Acceptance criteria | (1) No number rendered on a public page originates from `placeholders.ts`. (2) A guard test fails if `market-counters` renders a value not derived from a live query. (3) If real counts are shown, the label states the as-of date. |
| Dependencies | None |
| Effort | **S** |
| Suggested loop | `IMPLEMENTATION LOOP D — honest landing metrics v1` |

---

## 3. F-2.2 — P1 · The product presents itself as manual-labour-only, in four places at once

This confirms the owner's hypothesis, and locates it precisely. It is not a "tone"
problem — it is **four concrete lists**, all of which exclude non-manual work.

**Evidence 1 — the landing sector list.** "EUROPOS DARBO KRYPTYS" enumerates exactly ten
sectors: *statyba ir apdaila · logistika ir sandėliai · slauga ir priežiūra · gamyba ir
surinkimas · transportas ir vairuotojai · apgyvendinimas ir maitinimas · žemės ūkis ir
sezoniniai darbai · valymas ir pastatų priežiūra · elektra ir mechanika · suvirinimas ir
metalo darbai.* Ten out of ten are physical work. Construction is listed **first**.

**Evidence 2 — the employer need form** offers 39 work types, all manual, escape hatch
labelled *"Kita / pagalbinis darbas"* (**auxiliary** work). Source:
`apps/web/lib/taxonomy/work-categories.ts`. See LOOP 1 F-1.1.

**Evidence 3 — the matching preview** uses the same 39-item list on both sides.

**Evidence 4 — the "for everyone" section undermines itself.** The section headed *"VISAI
DARBO RINKAI"* ("for the whole labour market") lists audiences correctly (freelancers,
students, career changers, employers, agencies) but then defines the scope as *"nuo
statybos ir gamybos iki paslaugų, logistikos ir priežiūros"* — from construction and
manufacturing to services, logistics and care. Every example is again physical work. The
sentence that is supposed to prove breadth demonstrates the opposite.

**The decisive contrast:** production's `professions` table already contains
`software_developer`, `teacher`, `office_administrator`, `receptionist`, `recruiter`,
`translator`, `customer_service_specialist`, `sales_assistant`, `event_organizer`,
`site_engineer`. **31 of 49 professions (63%) are in the database but reachable from no
public surface.** The breadth exists; the product hides it.

| Field | Value |
|---|---|
| Affected user | Employers and workers outside physical labour — i.e. the majority of the European labour market the product claims to serve |
| Affected path | `work-categories.ts`; landing sector list; `messages/*.json` positioning copy |
| Business impact | Caps the addressable market at manual labour while paying the cost of a general platform; makes the "BENDRA DARBO RINKOS PLATFORMA" headline read as untrue within one scroll |
| Risk level | **HIGH** — positioning + conversion blocker |
| Recommended fix | (1) Extend `WORK_CATEGORIES` to cover the professions already in the DB, adding IT & digital, healthcare & medicine, education & training, office & administration, finance & accounting, sales & customer service, engineering & technical, creative & media. (2) Rewrite the landing sector list so at least half the visible examples are non-manual. (3) Change the "other" label from *"Kita / pagalbinis darbas"* to a neutral *"Kita"*. |
| Acceptance criteria | A visitor whose work is software development, teaching, accounting or nursing can (a) see their sector represented on the landing page and (b) select it in both intake forms, without choosing "Kita" |
| Dependencies | **None — no migration required** (`profession` is stored as a free string; stated at `work-categories.ts:11-15`) |
| Effort | **S** |
| Suggested loop | `IMPLEMENTATION LOOP A — sector breadth v1` (same loop as F-1.1) |

---

## 4. F-2.3 — P1 · Three public surfaces tell three different stories about matching

| Surface | Claim | Verbatim |
|---|---|---|
| Landing | Automatic, skills-based | *"Realių įgūdžių ir darbo poreikių atitiktys."* |
| Pricing | Manual, human-coordinated | *"Čia dar nėra automatinės darbo biržos ir automatinio parinkimo — ankstyvos prieigos metu atranką koordinuoja žmogus."* |
| Match preview | Trade + logistics only | Inputs are: one trade, country, date, accommodation, transport, languages. **No skills field exists.** |

They are one click apart in the same navigation. A careful visitor — exactly the kind who
would become a paying pilot customer — will notice, and the natural conclusion is that
the landing page overstates. Risk: **HIGH**, trust blocker.

**Recommended fix (cheap, immediate):** make the landing page tell the pricing page's
truth. "Human-curated matching during early access, built on real skill records" is both
accurate and more credible for a pilot than an automation claim the product cannot yet
demonstrate. Effort **XS**. This is the single highest value-per-hour change in the whole
audit. See LOOP 1 F-1.5 / F-1.6.

---

## 5. Onboarding & comprehensibility

### F-2.4 — P2 · Field examples exist, but not on the field that matters most

The tester feedback "field examples are missing" is **partly refuted and partly
confirmed**, and the precise version is more actionable.

Audit of the employer need form (`/lt/company-need`), free-entry fields only:

| Field | Helper text | Concrete example? |
|---|---|---|
| Įmonės pavadinimas | — | ✗ |
| Kontaktinis asmuo | "Neprivaloma. Su kuo susisiekti dėl šio poreikio." | ✗ |
| El. paštas susisiekimui | "Neprivaloma, bet padeda greičiau susisiekti…" | ✗ |
| Darbuotojų skaičius | — | ✗ |
| Miestas ar regionas | "Neprivaloma. Kur numatytas darbas." | ✗ |
| Pradžios data | — | ✗ |
| Numatoma trukmė | "Neprivaloma. Pvz. „3 mėnesiai" arba „nuolatinis"." | ✓ |
| Kalbų reikalavimai | "Atskirti kableliais (pvz. en, nl)." | ✓ |
| **Aprašykite poreikį** (free text → draft) | "Koks darbas, kur ir kokie reikalavimai — asistentas pagal tai paruošia tvarkingą skelbimą." | **✗** |

**2 of 9 free-entry fields carry a concrete example.** The pattern is good where it
exists — the fix is to extend it, not invent it.

The critical gap is the last row: the **free-text description is the input that produces
the job-posting draft**, it is the single field that determines output quality, and it
has no example of a good answer. A user who writes "reikia darbuotojų" gets a poor draft
and concludes the product does not work.

**Fix:** add a collapsed "Pavyzdys" block under the description field showing one strong
worked example (and ideally a weak one contrasted), plus short examples on the remaining
7 fields. Effort **S**. Affected user: every employer, disproportionately first-time and
older users. Acceptance: every free-entry field has either a placeholder or a helper
example; the description field has an expandable worked example in lt/en/ru.

### F-2.5 — P2 · The onboarding promise ("4 steps") is not measurable to the user

The landing describes the journey as four steps — *1 Pradėkite erdvę · 2 Kurkite tapatybę
· 3 Pridėkite įrašų · 4 Atverkite galimybes*. These are abstractions, not actions
("start a space", "create an identity"). They do not tell a person what they will
actually do or how long it takes. Combined with the account wall (the visitor must
register before seeing anything), this is a plausible mechanical explanation for the
"needed about an hour to understand it" feedback: **the product's model is only learnable
after committing.**

**Recommended:** name the steps as concrete actions with time estimates ("Import your CV —
2 min", "Confirm the skills we found — 3 min"), and let the visitor see one real example
of a finished profile before registering. Effort **S** for the copy; **M** if a public
example profile is added. Note the repo already has a `conceptNote` pattern for clearly
labelled examples (`messages/lt.json:4255`: *"Iliustracinis pavyzdys, kaip atrodys įrašas
— ne realus asmuo ir ne tikri duomenys"*) — the honest mechanism exists and can be reused.

### F-2.6 — P0 candidate · Nothing about privacy is shown before the account is created

Repeated from LOOP 1 F-1.8 because it is also a comprehension failure, not only a legal
one: the signup form has **no** link to the privacy policy or terms and no consent
control. For a platform asking workers for CVs, work history and photographs, the first
screen says nothing about what happens to that data. For older and more cautious users —
precisely the group the tester feedback flags — that is a strong reason to abandon.

---

## 6. Mobile & accessibility

**Verified positives.** The rendered accessibility tree at 375×812 is clean and correctly
structured: `banner` → `main` → `form`, real `<label>` elements bound to every input
(`label "Darbo el. paštas" → textbox type=email`), a proper `type=submit` button,
descriptive text for the Google button including *"Atidaroma naujame skirtuke"*. Inputs
use correct types (`email`, `password`). **No unlabelled input was found on any page
inspected.** That is meaningfully better than typical.

### F-2.7 — P2 · The landing page is animation- and payload-heavy on mobile

**Evidence.**
- `apps/web/components/app/europe-geo.ts` is **26,009 bytes** of raw SVG path data —
  country outlines with thousands of coordinate pairs — shipped to the client for the
  landing map.
- `market-counters.tsx` is a `"use client"` component running a `setInterval` every 8 s
  with `framer-motion` `AnimatePresence` transitions, permanently, for four counters.
- Repeated `computer{action:"screenshot"}` calls against the landing page **timed out at
  30 s** in the in-app browser while the same tool worked on other pages — consistent
  with a continuously busy renderer rather than a network problem.

This is circumstantial rather than measured, so it is stated as such: **no field LCP/CLS/INP
data exists for this product**, which is itself the finding. A permanently animating hero
plus a 26 KB inline SVG map is a known pattern for poor INP on mid/low-end Android — the
majority device class for the worker audience in the Baltics and Poland.

**Recommended:** (1) add real user monitoring so this stops being a guess; (2) render the
map as a static optimised asset or lazy-load it below the fold; (3) respect
`prefers-reduced-motion` for the counters — the component already imports
`useReducedMotion` and uses it for the transition, but the 8-second `setInterval` itself
keeps running regardless (`market-counters.tsx:29-32`). Effort **S**; if F-2.1 is fixed by
removing the counters, most of this disappears with it.

**Owner-feedback link:** "the computer version is more understandable than the phone" is
consistent with this — desktop absorbs the heavy hero comfortably; a 375 px viewport gets
the same animated block stacked 2×2 above any explanatory text.

### F-2.8 — P3 · Auth pages are dead ends on mobile

`/auth/signup` renders no footer, no navigation, no language switcher. The only exit is
the logo. Also inherits the homepage `<title>`. Low impact, trivial fix.

---

## 7. What is genuinely good (and must not be lost)

These are verified strengths. Any redesign must preserve them.

1. **The EU statistics section is exemplary.** Six cards, each with a named source
   (Eurostat, EURES/ELA, European Commission Eurobarometer, Cedefop), a **data date**, a
   **"last checked" date** (2026-06-13), and a source link. This is better sourcing
   discipline than most commercial research pages. It is also the honest way to create
   the credibility the fake counters are trying to fake.
2. **The pricing page's per-capability honesty labels** — every feature is marked either
   *"VEIKIA PRODUKTE ŠIANDIEN"* or *"PARUOŠTA — ĮSIJUNGS TIK SU APMOKESTINIMU"*. This
   feature-reality vocabulary should be reused across the dashboard.
3. **No dark patterns in the commercial surface.** No fake urgency, no pre-ticked boxes,
   no hidden charges; payments are explicitly off and said to be off, repeatedly.
4. **The free-text job draft is correctly named.** *"Sukurkite skelbimo juodraštį"*, with
   an explicit promise not to invent a salary and not to auto-publish — this is exactly
   the requirement in the audit brief, already met.
5. **`/match-preview` states its own limits** — *"nieko nerezervuoja ir neišsaugo"*.
6. **Full LT/EN/RU parity: 7,320 keys in each of `lt.json`, `en.json`, `ru.json`** — no
   missing-key gaps between the three primary locales, and all 78 public route probes
   returned 200 in all three.
7. **Form accessibility fundamentals are correct** (labels, input types, submit
   semantics).

---

## 8. Localisation state (positioning-relevant subset)

| Locale | `messages/*.json` | Keys | Assessment |
|---|---|---|---|
| lt | ✓ | 7,320 | Primary, complete |
| en | ✓ | 7,320 | Complete, parity with lt |
| ru | ✓ | 7,320 | Complete, parity with lt |
| **nl, de** | ✓ | 7,355 | **LIVE, ROUTED LOCALES — see correction below** |
| da, et, lv, no, pl, sv | ✓ | 1,860 | Dormant: 5,505 keys missing, 831–1,459 `[EN]` markers — but **unroutable**, so no user can reach them |
| fi | directory only, **no `fi.json`** | — | Asymmetry worth checking |

> **⚠️ CORRECTED 2026-07-22 by LOOP 7 — the brief's premise was wrong, and so was mine.**
> NL and DE are **not** a future direction: `activeLocales = ["lt","en","ru","nl","de"]`.
> Five locales are live and routed, each with **exactly 7,355 keys, 0 missing, 0 extra,
> 0 `[EN]` markers**, untranslated leakage 0.1–0.4 %. (My 7,320 figure counted string
> leaves only; 7,355 is the authoritative total.)
>
> The real NL/DE finding is different and sharper: both are **AI-seeded and have never
> been human-reviewed** (`tier1Locales = ["en","lt"]`), and **six documents — including
> the *binding* `PLATFORM_DOCTRINE.md §2.4` — still state the active set is lt/en/ru**.
> Any QA, SEO or copy work scoped from those documents silently skips two live markets.
> That is a P2 with a legal edge: unreviewed machine translation is being served as
> product copy in two countries.

LT/EN/RU/NL/DE key parity is exact, which is a genuinely strong result. Depth findings
(hardcoded strings bypassing next-intl, SEO metadata, email and Stripe texts) are in
`docs/audits/labourmarketai-technical-operations-audit-v1.md`.

---

## 9. LOOP 2 findings register

| ID | Sev | Title | Blocker flags | Effort |
|---|---|---|---|---|
| F-2.6 | **P0 candidate** | No privacy/terms notice before account creation | legal, trust | S |
| F-2.1 | **P1** | Hero metrics are fabricated placeholders (312 shown vs 27 real) | trust, legal | S |
| F-2.2 | **P1** | Manual-labour-only presentation in 4 places; 63% of DB professions hidden | conversion, positioning | S |
| F-2.3 | **P1** | Landing / pricing / match-preview contradict each other on matching | trust, conversion | XS |
| F-2.4 | P2 | The free-text field that drives the draft has no example | conversion | S |
| F-2.5 | P2 | Onboarding described in abstractions; nothing visible before registering | conversion | S–M |
| F-2.7 | P2 | Animation- and payload-heavy landing on mobile; no RUM at all | accessibility, conversion | S |
| F-2.8 | P3 | Auth pages: no footer/nav/language switcher, wrong title | UX | XS |

---

## 10. Verdict against the owner-supplied tester feedback

| Tester statement | Audit verdict |
|---|---|
| "Needed ~an hour to understand the system" | **Confirmed, and explained.** Nothing concrete is visible before registration; the 4 steps are abstractions (F-2.5); the three public surfaces contradict each other on what the product does (F-2.3). |
| "Field examples are missing" | **Partly confirmed, sharpened.** 2 of 9 free-entry fields have examples; the one field that determines output quality has none (F-2.4). |
| "Older users struggle more" | **Consistent with the evidence**, though not directly measured. Contributing causes found: no privacy reassurance at signup (F-2.6), abstract step names, heavy animated hero (F-2.7). Form accessibility fundamentals are *not* the cause — they are sound. |
| "Desktop is more understandable than phone" | **Consistent.** Mobile receives the same heavy animated hero in a 375 px column (F-2.7); no mobile-specific simplification was found. |
| "Construction dominance is confusing" | **Confirmed with hard evidence, and it is worse than 'tone'.** It is structural: 39/39 form options and 10/10 landing sectors are manual work, while the database already holds 31 professions that are unreachable (F-2.2). |

**All five pieces of tester feedback are supported by concrete, located evidence.** None
required a generic UX recommendation to explain.

---

## 11. LOOP 2 result

- **Status:** COMPLETE for public/anonymous surfaces. Logged-in onboarding
  (`/onboarding`, `/dashboard/start/*`) **not assessed** — owner gate 1 (credentials).
- **Headline:** the product's honesty is its strongest asset and it is applied
  inconsistently — rigorous on pricing and statistics, abandoned on the hero counters.
  The fastest credibility win available is to delete the fake numbers and let the landing
  page tell the pricing page's truth.
- **Next:** LOOP 8 consolidates this with LOOPs 3–7 into the priority register.
