# Sweden Market Truth — production read-back 2026-08-17

Source: production Supabase project `labourmarket.ai` (gorgitwvdzxbnaxhrsrw),
table `public.public_vacancies`, queried live 2026-08-17. All numbers are
COUNT/COUNT DISTINCT read-backs, not estimates. Base commit under audit:
`9ecd063b` (origin/main).

## A. Totals

| Metric | Value |
|---|---:|
| TOTAL_STORED | 41,642 |
| TOTAL_ACTIVE_VISIBLE_VACANCIES (`is_active`, lifecycle=`published`) | **41,606** |
| Removed (lifecycle=`removed`, is_active=false) | 36 |
| Withdrawn / expired lifecycle rows | 0 (lifecycle enum only uses `published`/`removed` today) |
| Duplicate `external_id` rows | 0 |
| Duplicate `content_hash` among active | 0 |
| Countries | 1 (SE only) |
| Regions (län) with active ads | 21 (+826 active ads with NULL region) |
| SUM(positions) across active ads | 69,840 |

Note: the previously quoted "37,198 visible vacancies" is stale; the live
number after the 2026-08-14/15 full pass is 41,606.

## B. Employer identity

Normalization rule used (no fuzzy merge):
1. Primary identity = `employer_external_org_id` (official Swedish
   organisationsnummer delivered by the source) when present — 41,178 of
   41,606 active ads (99.0%).
2. Fallback identity = lowercased, whitespace-collapsed `employer_name`
   only for ads with no org number — 428 ads → 311 distinct names, of
   which 1 name also appears under an org-id identity (not double-counted).
3. No AB/Aktiebolag folding was applied across different org numbers —
   two different org numbers are always two employers (legal-unit truth).

| Metric | Value |
|---|---:|
| DISTINCT_IDENTIFIED_EMPLOYERS (org-id identities + non-overlapping name-only) | **7,669** (7,359 + 310) |
| — of which official org-number identities | 7,359 |
| — of which name-only identities (no org number) | 310 |
| DISTINCT_STAFFING_AGENCIES (heuristic, name-pattern¹) | 207 org-id employers (3,944 ads) |
| DISTINCT_DIRECT_EMPLOYERS (identified minus heuristic agencies) | ~7,462 (7,669 − 207) |
| UNKNOWN_OR_ANONYMOUS_EMPLOYERS (no name AND no org id) | 0 ads |
| VACANCIES_WITH_IDENTIFIABLE_EMPLOYER | 41,606 (100% — all have name and/or org id) |
| VACANCIES_WITH_ORG_NUMBER | 41,178 (99.0%) |
| VACANCIES_WITH_UNKNOWN_EMPLOYER | 0 |

¹ Staffing-agency detection is a NAME-PATTERN HEURISTIC
(bemanning/rekrytering/interim/konsult/known agency brands). The source
feed carries no is-agency flag. Treat 207 as a floor, not an exact count;
"direct employers" is correspondingly a ceiling. Do not publish the
direct/agency split without this caveat.

## C. Top 50 employers by active ads (org-number identities)

Academic Work Sweden AB (394), Västra Götalandsregionen (373),
Försvarsmakten (358, 491 positions), Aura Personal AB (335), Region Skåne
(312), Region Stockholm (264), Göteborgs kommun (226), Veterankraft AB
(220), Hemfrid i Sverige AB (208), Lernia Bemanning AB (197), Region
Uppsala (192), Uniflex AB (187), Hitachi Energy Sweden AB (185),
Stockholms kommun (185), StudentConsulting (184 ads / 861 positions),
Kriminalvården (182), Adecco Sweden AB (166), Avaron AB (163), Region
Sörmland (162), Region Östergötland (156), Techrytera AB (155), YCLA AB
(155), Randstad AB (152), Experis AB (152), Region Jönköpings län (147),
NearYou Sverige AB (141), Region Dalarna (138), Vattenfall AB (136),
Brukarkooperativet JAG (136), KLETOR Sverige AB (130), Region
Västernorrland (127), Friday Väst AB (127), Region Västerbotten (126),
Region Örebro län (125), Region Norrbotten (124), Humana AB (124), Almia
AB (123), Allakando AB (120), Statens Institutionsstyrelse (120 ads / 513
positions), Bravura Sverige AB (118), H & K Entreprenad AB (117 ads /
2,199 positions), Malmö kommun (115), Kraftsam Rekrytering & Bemanning AB
(115), Verisure Sverige AB (114), TopWork Sverige AB (111), Capio Sverige
AB (111), Willy:s AB (108), Apotek Hjärtat AB (105), Frösunda Personlig
Assistans AB (101), SAAB AB (98).

Mix check: the top-50 is a healthy blend of public sector (regions,
municipalities, state agencies), large private employers, and staffing
agencies — consistent with a whole-market feed, not a scrape artifact.

## D. Employers by region (active ads / distinct employers)

| Region | Ads | Employers |
|---|---:|---:|
| Stockholms län | 10,772 | 2,711 |
| Västra Götalands län | 6,316 | 1,732 |
| Skåne län | 4,413 | 1,369 |
| Östergötlands län | 2,204 | 578 |
| Jönköpings län | 1,716 | 534 |
| Norrbottens län | 1,545 | 436 |
| Uppsala län | 1,494 | 470 |
| Västerbottens län | 1,241 | 394 |
| Dalarnas län | 1,161 | 333 |
| Örebro län | 1,128 | 415 |
| Södermanlands län | 1,123 | 355 |
| Hallands län | 1,037 | 391 |
| Västmanlands län | 979 | 401 |
| Västernorrlands län | 961 | 333 |
| Värmlands län | 916 | 313 |
| Gävleborgs län | 852 | 321 |
| (no region) | 826 | 399 |
| Kronobergs län | 796 | 292 |
| Kalmar län | 768 | 288 |
| Jämtlands län | 598 | 218 |
| Blekinge län | 515 | 186 |
| Gotlands län | 245 | 100 |

## E. Employers by profession family (top 25, classified subset)

Classification coverage: 17,305 of 41,606 active ads classified (41.6%);
24,301 unclassified. Per-profession employer counts therefore
UNDERSTATE full-market reality.

caregiver 4,186/807 · teacher 1,536/433 · sales_assistant 1,062/282 ·
warehouse_worker 923/243 · driver 890/452 · cleaner 844/367 · cook
824/561 · software_developer 802/345 · production_worker 755/268 ·
kitchen_helper 751/346 · electrician 657/314 · office_administrator
536/332 · auto_mechanic 420/197 · carpenter 396/204 · waiter 389/299 ·
customer_service_specialist 361/195 · receptionist 282/154 · welder
233/105 · general_laborer 223/118 · baker 202/188 · concrete_worker
143/71 · heavy_equipment_operator 134/86 · hairdresser 112/100 · gardener
105/34 · recruiter 102/75.

## F. Claim separation (public-copy invariant)

These four populations are DIFFERENT and may never be conflated:

| Population | Value (2026-08-17) |
|---|---:|
| A. Companies represented in marketplace data (imported ads) | 7,669 identified employers |
| B. Registered LabourMarket.ai organizations | 13 |
| C. Active LM employer accounts (orgs with live membership) | 13 (14 active memberships) |
| D. Paying LabourMarket.ai companies | 0 (billing_subscriptions=0, subscriptions=0, lmc_accounts=0) |

## G. EXACT SAFE PUBLIC CLAIM

Proven safe to publish (as of 2026-08-17, numbers move daily):

> **"41,000+ active job opportunities from 7,600+ employers across all
> 21 Swedish regions."**

Also safe: "opportunities from 7,600+ identified employers, 99% with an
official Swedish organisation number".

NOT safe, never derivable from this data:
- "7,600 companies use LabourMarket.ai" (population A ≠ B/C/D)
- any "X companies trust/joined LabourMarket.ai" where X comes from ads
- "7,462 direct employers" without the heuristic caveat from §B.

Invariant: marketing/analytics copy must source company-usage claims from
`organizations`/`company_memberships`/billing tables ONLY, and
market-coverage claims from `public_vacancies` ONLY, always with the
"employers in marketplace data" framing.
