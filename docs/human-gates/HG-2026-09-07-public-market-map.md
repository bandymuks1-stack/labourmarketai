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

## 5. UPDATE 2026-09-07 — the map is now ON the landing, at the honest maximum

The owner's follow-up command: *"The map is not optional merely because its
data grant is gated. Build everything safely possible around the gated data
access and leave only the smallest explicit owner decision blocked."*

**Built and shipped** (`components/marketing/public-market-map-band.tsx`,
`lib/market-map/public-coverage.ts`):

- the section is on `/{locale}`, directly under the natural-language entry,
  with its own `#market` nav anchor;
- it draws through the **canonical `<MarketMap>`** in `mode="landing"` — one
  Leaflet engine, real OSM tiles, real WGS84 centroids. Verified in a browser:
  **15 tiles, 17 markers**;
- the markers are the 17 `ACTIVE_MARKETS`, at `precision: "country"`;
- **no anchor carries a count.** `MarketAnchor.weight` was made optional for
  exactly this: `0` would assert that nothing is happening in Lithuania
  (SEP-7). A guard pins that no coverage anchor may acquire a weight, and the
  negative control was run;
- a third origin, **`coverage`**, was added so the map's own badge reads
  *"Rinkos, ne veikla" / "Markets, not activity"* — neither `live` (which would
  claim today's market is drawn) nor `preview` (which would imply the countries
  are invented);
- beneath it, in words: what the markers are, the full country list as a text
  alternative, and the sentence that per-place activity is not published to
  visitors — *"there is not a single guessed dot on this map."*

**Still blocked, and it is now exactly one act.** Everything above is
presentation; the only thing missing is permission for an anonymous caller to
read a geographic aggregate.

## 6. The owner decision — one migration

Approve ONE of:

**(A) Ship the anonymous geographic aggregate.** RED migration. Applying it
turns the coverage map into the live market with no further UI work: add a
reader beside `publicCoverageView()` and change the view's `origin` to `live`.

```sql
-- k-anonymity INSIDE the function, so no caller can widen it.
create or replace function public.public_vacancy_geography_v1()
returns table (country text, city text, vacancies bigint)
language sql security definer set search_path = public stable as $$
  with rows as (
    select v.country, v.city
    from public.public_vacancies v
    where v.is_active and (v.expires_at is null or v.expires_at > now())
  ),
  by_city as (
    select country, city, count(*)::bigint as n
    from rows where country is not null group by country, city
  )
  -- n < 3 dropped entirely; n < 5 reported at COUNTRY precision only.
  select country, case when n >= 5 then city else null end, sum(n)::bigint
  from by_city where n >= 3
  group by country, case when n >= 5 then city else null end;
$$;
revoke execute on function public.public_vacancy_geography_v1() from public;
grant execute on function public.public_vacancy_geography_v1() to anon, authenticated;
```

**Read this before approving:** it partially reverses
`20260824120000_public_vacancy_anon_boundary_v2`, which removed the last
location-bearing fields from the anonymous path *deliberately*. The counter-
argument is that this returns **aggregates only** — no ids, no per-row
coordinates, no employer, and nothing below the k-threshold. That is a
judgement about the anonymous boundary, and it is the owner's, not an agent's.
The SQL is written here rather than committed as a migration file precisely so
it creates no repo→applied parity debt while it waits (GOV-1).

**(B) Country precision only.** The same function without the `city` column.
Coarser, a smaller boundary change, and the map already renders country
precision natively.

**(C) Leave it.** The coverage map stays as shipped. §17 is then answered as
far as the data allows, and the honest note beneath it remains true.

## 7. What was deliberately NOT done, again

`origin: "demo"` was available and would have filled the map with plausible
dots. It was not used, for the three reasons in §3 above. A map that shows the
real markets and says what it cannot show is worth more than one that looks
busy and lies.
