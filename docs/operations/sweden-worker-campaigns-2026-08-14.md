# Sweden worker-acquisition campaigns — derived from CURRENT supply (2026-08-14, v2)

Status: RECOMMENDATION ONLY. No advertising budget is spent by this document;
paid activation is an OWNER GATE. Derived from the production `public_vacancies`
inventory queried 2026-08-14 (not from assumptions).

> **v2 correction (2026-08-14, readiness loop).** The v1 category counts were
> derived from stored `profession_slug` values that a production audit proved
> POLLUTED: profession needles ran over full Swedish ad descriptions, where
> "chef" means *manager* and "driver" is the verb *runs*. "cook: 1,671" was
> mostly nurses/retail/manager ads (real cook-labelled ads: ~101); "driver:
> 946" was mostly the verb (real driver-labelled ads: ~112); "electrician:
> 387" included body-text mentions (label-true: ~96). The categorizer was
> rebuilt (occupation-label/title-only + Swedish needles, transform v2) and
> the numbers below are the truthful label-based projection. Stored rows
> re-tag on the first refresh after the v2 deploy.

## Verified inventory truth (production, 2026-08-14)

| Fact | Value |
|---|---|
| Total rows | 7,092 (all `country=SE`, one provider: Arbetsförmedlingen/JobTech, 0 duplicate external ids) |
| Active (`is_active`) | 7,088; active AND unexpired at read time: 7,063 |
| Freshness | newest `last_seen_at` **2026-08-13 06:13Z** — decays until the cadence workflow is configured (OWNER console action) |
| Expired-but-active rows | 25 — correctly **never presented** (read layer filters `expires_at` at request time) |
| Salary data | **0 rows** — no salary can ever be shown or promised |
| Occupation metadata | `occupation_raw` + `occupation_concept_id` present on **100%** of active rows |
| Profession coverage | stored (pre-v2, polluted): 3,698 (52%). **Truthful v2 projection: ~2,943 label-attributable (41.5%) at ~100% precision** |
| Remaining untagged (~4,145) | genuinely OUTSIDE the 49-slug taxonomy: licensed nurses (~254), doctors, social workers, managers, engineers, B2B sales, public administration — honest nulls; adding slugs is a migration-gated taxonomy decision |
| Translations | none — ads render in Swedish, honestly labelled |

## Corrected family ranking (label-based, all-Sweden)

| Family | Active ads | Regions | Notes |
|---|---|---|---|
| **Care / assistance** (caregiver) | ~700 | 21 | personlig assistent, undersköterska, barnskötare, hemtjänst… Language: many state Swedish; check per-ad |
| **Kitchen / restaurant** (cook+kitchen_helper+waiter+baker) | ~284 | 20 | real cooks ~101 of these |
| **Education** (teacher) | ~274 | 21 | licensing/language requirements common — weaker fit for non-Swedish-speaking campaigns |
| **Retail** (sales_assistant) | ~248 | 21 | newly reachable family |
| **Warehouse / logistics** (warehouse_worker) | ~201 | 19 | incl. truck/forklift |
| **Production / industry** (production_worker) | ~141 | 20 | CNC/machine operators |
| **Cleaning / service** (cleaner) | ~135 | 18 | |
| Construction bundle (carpenter 123 + welder 43 + concrete 29 + painter 14 + tiler 13 + others) | ~230 | ~20 | |
| Driver (label-true) | ~112 | — | taxi/distribution/courier |
| Electrician (label-true) | ~96 | — | |

## Recommended first campaigns (re-ranked, truthful)

1. **Care & assistance work in Sweden** (~700 ads, all 21 regions) — the
   deepest real family. Caveat for LT/RU-audience ads: many care ads state
   Swedish-language requirements; the campaign must not imply otherwise.
2. **Kitchen & restaurant work in Sweden** (~284, 20 regions) — cook,
   kitchen help, service; language requirements less frequent.
3. **Warehouse & logistics in Sweden** (~201, 19 regions) — newly reachable;
   strong skill-expansion matching (forklift, order picking).
4. **Retail / shop work in Sweden** (~248, 21 regions) — newly reachable.
5. **Construction trades in Sweden** (~230 bundle) — carpenter-led; the
   original trade story, now with truthful counts.

NOT recommended for the first wave: education (licensing barriers for the
target audiences), driver/electrician (thinner than v1 claimed after the
pollution correction — still valid as later niche campaigns).

## Truthful campaign copy constraints (binding)

- **No exact inventory counts in ads**; "thousands of current opportunities
  **in Sweden**" only while verified counts support it. **Never imply the
  inventory is Europe-wide — it is Swedish** (geography truthfulness rule).
- **No salary claims** (source publishes none) · **no guaranteed employment /
  income** ("earning opportunities" language) · **no exclusivity** (public
  Arbetsförmedlingen listings; application happens at the publisher) ·
  **ads are in Swedish** — copy must not imply translated listings.
- Locales: **LT / RU / EN** (active + campaign-viable). `sv` UI is not routed.
- Evergreen product positioning stays non-numeric.

## Facebook copy pack v1 (drafts — owner review before any publishing)

Visual hierarchy per doctrine: HOOK → IMMEDIATE VALUE → DIFFERENTIATOR →
COMPOUNDING BENEFIT → CTA. No asset files are generated; these are copy
specifications for the owner's ad tooling.

### LT (primary)
- **HOOK:** Ieškote geresnių darbo galimybių Švedijoje?
- **VALUE:** Tūkstančiai realių darbo skelbimų iš oficialaus šaltinio — atrinkti pagal tai, ką iš tikrųjų mokate.
- **DIFFERENTIATOR:** Fiksuokite savo atliktus darbus ir rezultatus — kaupkite profesinę istoriją.
- **COMPOUNDING:** Kuo daugiau sistema žino, ką sugebate ir esate nuveikę, tuo tiksliau ji ieško jums tinkamų galimybių — net kai aktyviai naujo darbo neieškote.
- **CTA:** Prisijunkite nemokamai · Susikurkite profilį · Peržiūrėkite galimybes
- Variantai pagal kampaniją: „Priežiūros darbas Švedijoje“ / „Virtuvės ir restoranų darbas Švedijoje“ / „Sandėlio darbas Švedijoje“ / „Prekybos darbas Švedijoje“ / „Statybų darbai Švedijoje“.

### RU
- **HOOK:** Ищете лучшие возможности работы в Швеции?
- **VALUE:** Тысячи реальных вакансий из официального источника — подобранные по тому, что вы действительно умеете.
- **DIFFERENTIATOR:** Записывайте выполненные работы и результаты — накапливайте профессиональную историю.
- **COMPOUNDING:** Чем больше система знает о том, что вы умеете и уже сделали, тем точнее она ищет подходящие возможности — даже когда вы не ищете работу активно.
- **CTA:** Присоединяйтесь бесплатно · Создайте профиль · Смотрите возможности

### EN
- **HOOK:** Looking for better work opportunities in Sweden?
- **VALUE:** Thousands of real job listings from an official public source — matched to what you can actually do.
- **DIFFERENTIATOR:** Record your work and results. Build your professional history.
- **COMPOUNDING:** The more the system knows about what you can do and have done, the better it can search for opportunities suited to you — even while you're employed.
- **CTA:** Join free · Create your profile · See opportunities

Dutch employer copy: NOT prepared — the employer acquisition path was not in
scope of this readiness loop and must not ship untested claims.

## Campaign path (existing, no new surface)

```
ad → /create-cv?utm_source=…&utm_campaign=…  (declared acquisition route,
                                              first-touch attribution)
   → signup → onboarding → /dashboard/profile (CV bootstrap → confirmed facts)
   → /dashboard/opportunities (best/possible/explore bands over real supply;
                               profession chips narrow retrieval;
                               external_ad_opened telemetry)
   → external apply (attribution + confirm step) — NOT the end of the funnel
   → journal contribution in chat → skills grow → board revalidated
   → "View updated opportunities" CTA (journal_rematch_viewed telemetry)
   → return loop
```

## Owner gates before activation

1. **Sweden cadence** (freshness): GitHub console — secrets
   `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`, variables
   `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED=true` +
   `VACANCY_SCHEDULE_ENABLED=true` (workflow header marks this owner-only).
   The first refresh after the v2 deploy also re-tags all stored rows.
2. **Paid advertising activation** — budget + platform choice.
3. Optional: public anon job pages (SEO) — separate RED-class migration;
   licensed-profession taxonomy additions (nurse etc.) — migration-gated.
