# Public Market Entry / Sales Funnel — Launch Audit (2026-07-05, PR13)

**Owner question:** does the public surface route real visitors into the real
product loop, with zero fake claims and zero dead ends?

**Headline:** the funnel structure was already sound — every marketing href
resolves to an existing route (full CTA sweep, no dead links found), the
public intake forms (company-need, worker-intake, match-preview) are honest
non-persisting AI-draft previews with explicit bridges to signup/login, and
placeholder content is registry-governed with visible markers. What was NOT
honest was the copy: three signup-routed CTAs still called themselves a
"waitlist", the worker page claimed "nine countries", and the work-abroad
journey promised a "booking" step that does not exist. PR13 fixes the copy to
match the live loop and pins all of it in CI.

## Findings

| # | Item | Finding | Action |
|---|---|---|---|
| 1 | Dead links | none — every marketing href resolves (nav, footer, landing, role pages, intake pages, legal) | guard pins route existence for all funnel targets |
| 2 | Worker CTA | `/auth/signup` everywhere (landing hero, journey band, worker path, for-workers) | GREEN, pinned |
| 3 | Company CTA | landing → `/company-need` (honest preview form + signup/login bridge); for-companies hero/band → `/auth/signup` | GREEN, pinned |
| 4 | "Waitlist" labels on live signup CTAs | `pages.companies.cta`, `pages.agencies.cta`, `workers/companies/agencies.cta.{subcopy,button}` said "join the waitlist" while routing to real signup | **FIXED** — rewritten in all 11 locales to name the live loop (profile → matched opportunities → express interest → company reviewed/contacted); guard bans waitlist wording on signup-routed keys |
| 5 | "Nine countries" claim | `pages.workers.benefits[0]` claimed a specific country count | **FIXED** — "across borders"; guard bans numeric country/language count claims in `pages.*` |
| 6 | Work-abroad "booking" step | step 5 promised "Booking and start" — no booking system exists | **FIXED** — step 4/5 now describe the live loop (opportunity board, express interest, honest reviewed/contacted status; contracts/payment stay outside the platform); guard bans booking vocabulary in EN `workAbroad` |
| 7 | Work-abroad profile CTA | pointed at `/onboarding`, which bounces anonymous visitors to login | **FIXED** — routes to `/auth/signup`; guard pins it |
| 8 | Plan boundary pseudo-CTAs | "Request pilot access" / "Contact us" rendered as inert text that reads like buttons | **FIXED** — labels are now statements ("Pilot access — granted manually" / "Arranged individually"); guard pins non-interactive rendering + non-imperative labels |
| 9 | Pricing waitlist | the pricing waitlist is REAL (persists a lead via `/api/waitlist`) | kept — guard pins the modal still posts to the real endpoint |
| 10 | Placeholder content | hero counters/map/ticker/showcase are registry-governed placeholders with visible markers (default-ON since PR9) | GREEN (existing governance, `public-no-fake-claims.test.ts`) |
| 11 | Fake claims | `public-no-fake-claims.test.ts` already bans fabricated traction/verification/named-people shapes | GREEN (existing guard) |
| 12 | Language claims | no public claim of 12-language or FI full UI anywhere on the marketing surface | GREEN; count-claim guard prevents regressions (full locale-scope honesty = PR14) |
| 13 | Intake forms | company-need / worker-intake / match-preview are labelled AI-draft previews, nothing persisted, honest disabled-state when no AI provider | GREEN (existing) |

## Status
Public Market Entry + Sales/Market Entry: **GREEN scoped**. Scoped means: the
public funnel routes to the live worker/company loop and claims only what is
live; billing stays waitlist-gated (owner-gated billing sprint), country
evidence pages remain Baltic-core with honest "coming soon" cards for the
rest, and the deeper localization scope claim is PR14.
