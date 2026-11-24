# Worker Acquisition Pilot v1 — LT / RU (Sweden inventory)

**Status: PREPARED — awaiting OWNER activation.** No ad account is touched, no
budget is set, nothing is published by this document. The owner controls ad
account, spend, budget and final activation. Everything before that line is
prepared here.

**Production evidence (queried 2026-08-14 ~18:40Z, re-verify at launch):**
37,198 user-visible current Swedish opportunities · all 21 regions ·
15,435 profession-classified (precision-first, label/title-only categorizer,
0 known false positives) · stream cadence live and caught up (cursor
2026-08-14T18:09:51Z, 3×/day schedule). Numbers below MUST be re-queried
immediately before ad copy is finalized (`public_vacancies`, active ∧
unexpired predicate — the same one production reads use).

---

## 1. Pilot philosophy (binding)

We do NOT advertise "come here because you are unemployed."
We do NOT advertise "upload a CV and leave after applying."

The worker proposition: **look for better opportunities now AND keep using
LabourMarket.ai while working.** The retention spine:

```
CURRENT WORK
→ record completed work / results / capabilities / appropriate evidence
→ professional activity history
→ living CV / professional profile
→ LabourMarket.ai better understands what the person can do and offer
→ more relevant opportunity discovery
→ new work / project / opportunity
→ more real activity → stronger professional history
```

Language rule: we improve **our understanding** of capabilities, work
performed, results, experience, services, availability and evidence. We never
say the person's value increases, never show a person-score, never imply the
platform makes anyone "worth more."

Honesty rule: we do not promise that every Journal entry improves matching —
only relevant structured information can (this matches the shipped behavior:
journal skill pipeline → profile facts → matching inputs → board
revalidation).

## 2. Campaign families (recalculated from production 2026-08-14 ~18:40Z)

| # | Family | Current visible ads | Regions |
|---|---|---|---|
| 1 | Care & assistance (caregiver) | 3,709 | 21/21 |
| 2 | Kitchen & restaurant (cook 706 + kitchen_helper 638 + waiter 348 + baker 170) | 1,862 | 21/21 |
| 3 | Construction trades (electrician 596 + carpenter 352 + welder 203 + concrete 132 + heavy-equipment 124 + plumber 71) | 1,478 | ~20/21 |
| 4 | Warehouse & logistics + drivers (warehouse 865 + driver 786) | 1,651 | 21/21 |
| 5 | Retail (sales_assistant 961) | 961 | 21/21 |

Education (teacher, 1,397) stays **excluded from wave 1**: licensing/
qualification handling is not demonstrably ready and many ads carry
Swedish-language and certification requirements we cannot pre-screen.
Software development (723) is a viable later EN-language niche, not wave 1.

## 3. Geography truth (binding)

The verified inventory is **SWEDEN**. Never attach Sweden's numeric inventory
to Europe ("37,000+ jobs across Europe" is banned). Sweden-specific ads may
use a bounded number ONLY if still true at launch (re-query first):
`Daugiau nei 37 000 aktualių darbo galimybių Švedijoje`. Prefer the durable
form `Tūkstančiai aktualių darbo galimybių Švedijoje` wherever copy may
outlive the count. European positioning stays non-numeric.

Other binding copy constraints: no salary claims (source publishes none),
no employment guarantees, no employer counts we don't verify, ads are in
Swedish — copy must not imply translated listings.

## 4. Landing destination + UTM structure

- Landing: `/{locale}/create-cv` — the declared acquisition entry
  (`app/[locale]/(marketing)/create-cv/page.tsx`, pinned by
  `create-cv-acquisition-intent.test.ts`). Locales: `lt`, `ru`; `en` as
  supporting fallback.
- First-touch attribution is already shipped (`lib/telemetry/attribution.ts`):
  the five `utm_*` params + referrer host + landing path are captured ONCE
  (first touch wins), sanitized and length-capped, and ride as metadata on
  `pilot_events`. No tracker, no cookie, no schema change.

UTM convention for this pilot:

```
utm_source   = facebook            (meta ads; instagram placements inherit)
utm_medium   = paid_social
utm_campaign = se_{family}_{lang}_v1     e.g. se_care_lt_v1, se_kitchen_ru_v1
utm_content  = {creative-slug}           e.g. hook-better-opps, hook-living-cv
utm_term     = {audience-slug}           optional, e.g. lt-in-se, lt-in-lt
```

Family slugs: `care`, `kitchen`, `construction`, `warehouse_driver`, `retail`.

## 5. First-session path (verified against shipped code)

```
FACEBOOK ad (LT/RU)
→ /{lt|ru}/create-cv?utm_…        landing_viewed + first-touch capture
→ CTA                              cta_clicked → registration_started → signup_completed
→ onboarding                       onboarding_* (role, profile)
→ profession/context declared      (onboarding profile step; discovery chips
                                    narrow retrieval on the board — #1157)
→ /dashboard/opportunities         marketplace_or_opportunities_viewed;
                                    fit bands best/possible/explore answer
                                    "why these opportunities"
→ profile / CV bootstrap           profile_*, cv_upload_*
→ save / apply / open external ad  external_ad_opened (+ confirm step keeps
                                    attribution)
→ Work Journal contribution        journal_entry_started/saved (chat-first)
→ rematch                          journal_rematch_viewed +
                                    "View updated opportunities" CTA
→ return                           return_visit_detected
```

The three "why stay" answers (each must remain visible in the first session):
- **Didn't find the perfect vacancy:** your profile + recorded capabilities
  keep working — the board updates as inventory refreshes 3×/day and as your
  recorded information grows; save what's close, record what you can do.
- **Already employed:** availability unknown/employed is never a penalty
  (pinned by `employed-worker-acceptance.test.ts`) — record real work now,
  see better/different opportunities when they are justified.
- **Got a job (possibly through us):** the Journal is where the new job's
  results accumulate into your professional history and living CV — the
  return loop, not the exit.

## 6. Campaign packs (drafts — owner reviews wording before any publishing)

Retention message (shared spine, adapt per family): LT
«Dirbk. Fiksuok savo rezultatus. Stiprink savo profesinę istoriją —
LabourMarket.ai padės tavo gebėjimams būti pastebėtiems ir ieškos vis
tinkamesnių galimybių.» / RU «Работай. Фиксируй результаты. Укрепляй свою
профессиональную историю — LabourMarket.ai поможет вашим навыкам быть
замеченными и будет искать всё более подходящие возможности.»

### 6.1 Care & assistance — `se_care_{lang}_v1`
- **Proposition:** the deepest real family (3,709 ads, every region). Honest
  caveat baked into copy: many care ads state Swedish-language requirements —
  copy must invite, not overpromise.
- **LT** — HOOK: «Priežiūros ir pagalbos darbas Švedijoje — visoje šalyje.»
  PRIMARY: «Tūkstančiai aktualių priežiūros srities galimybių iš oficialaus
  Švedijos šaltinio. Susikurk profilį, nurodyk savo sritį — matyk realius
  skelbimus ir kodėl jie tinka būtent tau. Dalyje skelbimų reikalinga švedų
  kalba — matysi tai iš karto, be staigmenų.»
  HEADLINE: «Priežiūros darbas Švedijoje» · CTA: «Peržiūrėk galimybes»
  Landing: `/lt/create-cv?utm_source=facebook&utm_medium=paid_social&utm_campaign=se_care_lt_v1`
- **RU** — HOOK: «Работа по уходу и помощи в Швеции — по всей стране.»
  PRIMARY: «Тысячи актуальных возможностей в сфере ухода из официального
  шведского источника. Создайте профиль, укажите свою сферу — увидите
  реальные объявления и почему они подходят именно вам. В части объявлений
  требуется шведский язык — это видно сразу, без сюрпризов.»
  HEADLINE: «Работа по уходу в Швеции» · CTA: «Смотреть возможности»
  Landing: `/ru/create-cv?…utm_campaign=se_care_ru_v1`

### 6.2 Kitchen & restaurant — `se_kitchen_{lang}_v1`
- **Proposition:** 1,862 ads across cook/kitchen-help/service/bakery; lower
  language barrier than care; every region.
- **LT** — HOOK: «Virtuvės ir restoranų darbas Švedijoje.»
  PRIMARY: «Virėjai, virtuvės pagalbininkai, padavėjai, kepėjai — tūkstančiai
  aktualių skelbimų iš oficialaus šaltinio visoje Švedijoje. Susikurk
  profilį ir matyk, kurie skelbimai atitinka tavo patirtį. Dirbdamas fiksuok
  rezultatus — tavo profesinė istorija auga su kiekvienu darbu.»
  HEADLINE: «Virtuvės darbas Švedijoje» · CTA: «Susikurk profilį nemokamai»
- **RU** — HOOK: «Работа на кухне и в ресторанах Швеции.»
  PRIMARY: «Повара, кухонные работники, официанты, пекари — тысячи
  актуальных объявлений из официального источника по всей Швеции. Создайте
  профиль и смотрите, какие объявления соответствуют вашему опыту. Работая,
  фиксируйте результаты — ваша профессиональная история растёт с каждой
  работой.»
  HEADLINE: «Работа на кухне в Швеции» · CTA: «Создать профиль бесплатно»

### 6.3 Construction trades — `se_construction_{lang}_v1`
- **Proposition:** 1,478-ad bundle (electricians lead at 596). Strong LT/RU
  audience fit; certifications named per-ad, never promised away.
- **LT** — HOOK: «Statybų ir techninių specialybių darbas Švedijoje.»
  PRIMARY: «Elektrikai, dailidės, suvirintojai, betonuotojai, technikos
  operatoriai — realūs skelbimai iš oficialaus Švedijos šaltinio. Nurodyk
  savo specialybę ir patirtį — matyk, kurios galimybės tinka tau, ir kaupk
  savo atliktų darbų istoriją vienoje vietoje.»
  HEADLINE: «Statybų darbai Švedijoje» · CTA: «Peržiūrėk galimybes»
- **RU** — HOOK: «Работа для строительных и технических специалистов в Швеции.»
  PRIMARY: «Электрики, плотники, сварщики, бетонщики, операторы техники —
  реальные объявления из официального шведского источника. Укажите свою
  специальность и опыт — смотрите подходящие возможности и собирайте историю
  выполненных работ в одном месте.»
  HEADLINE: «Строительная работа в Швеции» · CTA: «Смотреть возможности»

### 6.4 Warehouse & logistics + drivers — `se_warehouse_driver_{lang}_v1`
- **Proposition:** 1,651 ads; fast onboarding professions; forklift/C-license
  requirements visible per-ad.
- **LT** — HOOK: «Sandėlio ir logistikos darbas Švedijoje.»
  PRIMARY: «Sandėlininkai, krovėjai, vairuotojai, kurjeriai — tūkstančiai
  aktualių galimybių visoje Švedijoje iš oficialaus šaltinio. Susikurk
  profilį, pažymėk turimus pažymėjimus — matyk tau tinkamus skelbimus.»
  HEADLINE: «Sandėlio ir vairavimo darbas Švedijoje» · CTA: «Peržiūrėk galimybes»
- **RU** — HOOK: «Работа на складе и в логистике в Швеции.»
  PRIMARY: «Складские работники, грузчики, водители, курьеры — тысячи
  актуальных возможностей по всей Швеции из официального источника. Создайте
  профиль, отметьте свои удостоверения — видите подходящие объявления.»
  HEADLINE: «Склад и вождение в Швеции» · CTA: «Смотреть возможности»

### 6.5 Retail — `se_retail_{lang}_v1`
- **Proposition:** 961 ads, all regions; customer-facing → language
  requirements common; copy stays honest about it.
- **LT** — HOOK: «Prekybos darbas Švedijoje.»
  PRIMARY: «Pardavėjai ir prekybos salės darbuotojai — šimtai aktualių
  skelbimų visoje Švedijoje. Dalyje skelbimų reikalinga švedų ar anglų kalba —
  matysi reikalavimus iš karto. Susikurk profilį ir sek naujas galimybes.»
  HEADLINE: «Prekybos darbas Švedijoje» · CTA: «Susikurk profilį»
- **RU** — HOOK: «Работа в торговле в Швеции.»
  PRIMARY: «Продавцы и работники торгового зала — сотни актуальных
  объявлений по всей Швеции. В части объявлений требуется шведский или
  английский — требования видны сразу. Создайте профиль и следите за новыми
  возможностями.»
  HEADLINE: «Работа в торговле в Швеции» · CTA: «Создать профиль»

### 6.6 EN supporting pack (fallback / broad)
- HOOK: «Looking for better work opportunities in Sweden?»
- PRIMARY: «Thousands of real, current job listings from Sweden's official
  public source — matched to what you can actually do. Create your profile,
  record your real work and results, and let opportunities find you — even
  while you're employed.»
- HEADLINE: «Real opportunities in Sweden» · CTA: «Join free»
- `utm_campaign = se_{family}_en_v1`; landing `/en/create-cv?…`.

## 7. Pilot metrics & owner-readable measurement plan

The pilot is NOT judged primarily by registrations. Judged funnel (each stage
= an already-registered `pilot_events` event; ad-platform stages come from
the platform):

| Stage | Source | Event |
|---|---|---|
| Impression / click | Meta ads manager | (platform) |
| Campaign visit | product | `landing_viewed` (+ first-touch utm metadata) |
| Opportunity discovery | product | `marketplace_or_opportunities_viewed` |
| Profile/CV start | product | `registration_started` → `signup_completed`, `cv_upload_started/succeeded`, `profile_saved` |
| Useful opportunity view | product | fit-band board views + `external_ad_opened` |
| Save / apply / external open | product | `external_ad_opened` (attributed) |
| Journal / activity contribution | product | `journal_entry_started` / `journal_entry_saved` |
| Rematch | product | `journal_rematch_viewed` |
| Return visit | product | `return_visit_detected` |

Key questions the weekly readout must answer: Are workers clicking? Do they
find real opportunities? Do they register? Do they understand the
professional-history proposition? Do they contribute useful professional
information? Does it feed matching? Do they return?

**Owner dashboard spec (simple, no new subsystem):** one SQL readout (can be
run via the existing admin `conversion-funnel` surface or as a saved query)
per campaign (`utm_campaign` metadata), per week: counts for each event
above + stage-to-stage conversion, split LT vs RU. Success gates for wave 1
(directional, not vanity): campaign visit → opportunities view ≥ 40%;
visit → signup is INFORMATIONAL ONLY; signup → journal contribution within
7 days ≥ 15%; any `journal_rematch_viewed` occurring at all proves the loop;
week-2 `return_visit_detected` for signups ≥ 20%. If workers click but do
not reach opportunities, the landing—not the ad—is the suspect; if they view
but never open external ads, family/language mix is the suspect.

## 8. Owner activation checklist (the only remaining human steps)

1. Re-run the inventory + family queries (§2) — refresh counts in final copy.
2. Approve/adjust wording of §6 packs (drafts by policy).
3. Create campaigns in the ad account with the UTM convention of §4.
4. Set budget; launch small (2 families first: care + kitchen recommended,
   both languages); keep the rest as wave 1.5.
5. Weekly §7 readout; kill/scale decisions owner-only.
