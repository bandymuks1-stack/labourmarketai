# HG-2026-09-07 — a PUBLIC market map on the landing

**Class:** RED (needs a migration: a `SECURITY DEFINER` reader + an `anon` grant)
**Raised by:** owner window 11 §17 — *"The previously discussed public MARKET MAP
concept has disappeared from the landing. The owner explicitly does NOT want
that concept lost. Restore/rethink it."*
**Status:** NOT BUILT. One owner decision. Nothing was faked in the meantime.

---

## 1. The concept is not lost — it is unbuilt on ONE side

The canonical `MarketMap` component **already has a landing mode**. This is not
something to design; it is something that exists and has no consumer:

| what exists | where |
|---|---|
| `MarketMapMode` includes `"landing"` | `components/app/market-map/market-map-model.ts` |
| `MODE_HEIGHT.landing = "h-[clamp(20rem,42vh,28rem)]"` | same file — the landing's own geometry |
| k-anonymity in the model (`n<3` dropped, `n<5` banded, a guard asserts no lat/lng key escapes) | same file |
| the map itself, viewport-bounded and clustered | `components/app/market-map/market-map.tsx` |
| a country-level honest-degradation path (`precision: "country"`) | `lib/market-map/vacancy-volume.ts` |

The FOCUS landing was restored from commit `7179882`, which predates the map.
Restoring the section is a small composition change. **The map is not the
blocker. The DATA is.**

## 2. Why it cannot be built without an owner decision

Every geographic reader in the repository is authenticated *by construction*,
and the reason is written into the code rather than inferred:

> `lib/market/public-market-facts-read.ts`:
> "`anon` holds no grant on `public_vacancies` … The price of that choice is
> stated plainly: **this cannot be moved to an anonymous page later without the
> RED migration** the other module describes."

> `lib/market-map/vacancy-volume.ts`:
> "SCOPE STAYS AUTHENTICATED … this module must never be reachable from an
> anonymous surface."

And the one anonymous projection that the landing already reads carries no
geography whatsoever:

> `lib/market/live-market-landing.ts`:
> "It intentionally carries no vacancy coordinates … the map may truthfully
> resolve supply to Sweden but **not invent a city or region distribution
> inside Sweden**." There is no `regions` field, deliberately.

So the anonymous landing today can honestly say *how many* and *which
professions*. It cannot say *where* — at any precision finer than a country the
data does not break down.

## 3. What was deliberately NOT done

The map model permits `origin: "demo"` — scripted product demonstration on real
geography — and its own comment says this is allowed "ONLY on the public
landing, and always labelled". **It was not used**, for three reasons that all
point the same way:

1. §17 forbids it by name: *"Do NOT fabricate activity. Do NOT create fake map
   markers merely for visual effect."*
2. Doctrine §18 bans the word "demo" from product copy
   (`lib/guards/product-copy-forbidden-terms.test.ts` fails on it).
3. SEP-1 — FACT ≠ DERIVED ≠ FORECAST. Markers a visitor reads as the live
   market, that are not the live market, is the failure this whole register
   exists to prevent.

A map is either the real market or it is decoration. §17 says it "must not be
decorative", so the honest state is **absent** until it can be real.

## 4. The owner decision

Approve ONE of:

**(A) Build the anonymous geographic aggregate.** A RED migration adding a
`SECURITY DEFINER` function over `public_vacancies` returning
`(country_code, city_or_null, count)` with the model's existing k-anonymity
applied INSIDE the function (`n<3` dropped, `n<5` banded), plus a grant to
`anon`. The landing then renders the real map at the precision the data
supports, with the country-level honest degradation already implemented.
*Risk:* it widens what an unauthenticated caller can read. Mitigated by
k-anonymity in the function body and by returning aggregates only — no ids, no
coordinates per row, no employer.

**(B) Country-level only, no migration.** Extend the existing anonymous
projection with a per-country COUNT only (the same `anon`-readable rows it
already reduces), and render a country choropleth with no city pins. Smaller,
still honest, visibly coarser. *Still needs a decision*, because it changes
what the public projection returns.

**(C) Leave it out.** The landing keeps counts and professions, and the map
stays an authenticated capability. §17 is then explicitly deferred, not
silently dropped.

## 5. What this window did instead

Nothing about the map. §17 is recorded here rather than answered, and the
landing's product-breadth problem (§16) was attacked from the other direction —
the natural-language entry now offers ten example sentences spanning nine
intents across the graph (spare capacity, a team for a site, real work
recorded, who can verify it), instead of six that were all one side of the
market looking for the other.
