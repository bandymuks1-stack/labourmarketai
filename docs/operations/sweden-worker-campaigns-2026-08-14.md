# Sweden worker-acquisition campaigns — derived from CURRENT supply (2026-08-14)

Status: RECOMMENDATION ONLY. No advertising budget is spent by this document;
paid activation is an OWNER GATE. Derived from the production `public_vacancies`
inventory queried 2026-08-14 (not from assumptions).

## Verified inventory truth (production, 2026-08-14)

| Fact | Value |
|---|---|
| Total rows | 7,092 (all `country=SE`, one provider: Arbetsförmedlingen/JobTech, 0 duplicate external ids) |
| Active (`is_active`) | 7,088 (lifecycle: 7,088 published / 4 removed) |
| Freshness | newest `last_seen_at` **2026-08-13 06:13Z** — supply decays until the cadence workflow is configured (owner gate: 2 Actions secrets + 2 repo variables, `.github/workflows/sweden-supply-cadence.yml`, merged inert in #1144) |
| Expired-but-active rows | 25 — correctly **never presented** (read layer filters `expires_at` at request time) |
| Salary data | **0 rows** carry `compensation_min` — no salary can ever be shown or promised |
| Language requirements | 1,109 active rows (~16%) |
| Application URL | 7,088 / 7,088 active |
| Profession-tagged (`profession_slug`) | 3,698 / 7,088 (52%) — only tagged rows are match-addressable by profession |
| Translations | none available — ads render in Swedish, honestly labelled |
| Geographic spread | all 21 Swedish regions; top: Stockholms län 1,787 · Västra Götalands 1,152 · Skåne 728 |

Untagged mass (3,390 active) is dominated by care/healthcare (personlig
assistent 279, sjuksköterska 69, undersköterska 61), retail, warehouse
(lagerarbetare 61, truckförare 37), cleaning and childcare — taxonomy gaps,
not bad data. Campaigns are derived ONLY from tagged categories where
matching genuinely works.

## Recommended first campaigns (strongest → weaker)

Ranked by volume × freshness × geographic spread × matching usefulness
(tagged + skill-recognized). All figures are the 2026-08-14 verified counts
and MUST be re-verified before any activation.

1. **Cook / kitchen work in Sweden** — 1,671 active (1,663 unexpired), all 21
   regions. The single deepest category.
2. **Driver / transport in Sweden** — 946 active, all 21 regions (includes
   distribution and truck driving).
3. **Electrician jobs in Sweden** — 387 active, all 21 regions. High
   skill-recognition quality; best fit for the journal→matching story.
4. **Construction bundle (carpenter + concrete + crane + rebar)** — carpenter
   168 + concrete 66 + crane 44 + rebar 6 = ~284 active across ~20 regions
   (plus ~49 untagged "Träarbetare/Snickare" that would join after a taxonomy
   mapping fix).
5. **Office administration / reception** — office_administrator 187 +
   receptionist 78 = 265 active, ~20 regions. Broader-audience alternative.

NOT recommended yet (despite real volume): warehouse/logistics, cleaning,
care/healthcare — the supply exists but is largely **untagged**, so the
matching value proposition would be weaker than the ad claims. Fixing the
categorizer's coverage for `lagerarbetare` / `städare` / care occupations is
the cheapest way to unlock three more campaign families.

## Truthful campaign copy constraints (binding)

- **No exact inventory counts in ads** — "thousands of current Swedish
  opportunities" style wording only while verified counts support it
  (OPPORTUNITY_REALIZATION_LOCK_V1 TEST A; no stale "7,000" claims).
- **No salary claims of any kind** — the source publishes none.
- **No guaranteed employment / income** — "earning opportunities" language only.
- **No exclusivity implication** — ads are public Arbetsförmedlingen listings;
  source attribution is always preserved and application happens on the
  publisher's portal.
- **Ads are in Swedish** — campaign copy must not imply translated listings.
- Locales: **LT / EN / RU** (active + campaign-viable). `sv` UI is not routed
  (catalog parity incomplete) — a Swedish-locale campaign is not truthful yet.

## Campaign path (existing, no new surface)

```
ad → /create-cv?utm_source=…&utm_campaign=…   (declared acquisition route,
                                               first-touch attribution captured)
   → signup → onboarding (worker, country)
   → /dashboard/profile  (CV bootstrap → confirmed facts → skills)
   → /dashboard/opportunities  (best fits / possible fits / explore over the
                                real Swedish supply; profession chips narrow
                                retrieval; external_ad_opened telemetry)
   → journal contribution in chat → skills grow → board recomputes
   → return loop (matching note + "view updated opportunities")
```

## Owner gates before activation

1. **Sweden cadence** (freshness): add 2 Actions secrets + 2 repo variables —
   without this the supply goes stale and the freshness notice will (correctly)
   undermine the campaign.
2. **Paid advertising activation** — budget + platform choice.
3. Optional: public anon job pages (SEO) — a separate RED-class migration +
   gate record, named in the persistence migration itself.
