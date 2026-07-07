# LabourMarket.ai — Company Demand Outreach Master v1

## Project
LabourMarket.ai

## Repo path
`C:\Users\Mano\Documents\labourmarketai`

## Goal
Prepare a repeatable daily company-demand outreach workflow for LabourMarket.ai before full promotion.

Every daily run must find at least 100 unique real companies in Europe that have publicly visible hiring or staffing needs from the last 6 months, prioritize the newest/current needs, deduplicate companies, and prepare one personalized invitation email draft per company for owner review.

Do not send emails automatically.

## Owner intent
LabourMarket.ai is moving toward public/paid promotion. The system needs real employer-side demand.

The daily task is:
- find companies currently or recently looking for workers,
- include both direct employers and staffing/recruitment/temporary-work agencies,
- cover multiple sectors and wider Europe,
- prepare personalized, non-spammy B2B invitation drafts,
- invite companies to publish their staffing/company needs on LabourMarket.ai,
- explain the long-term value: trust between workers and employers, clearer CVs, better worker evaluation context,
- keep owner approval before any outbound sending.

## Core positioning
Use this positioning in drafts:

LabourMarket.ai is a new labour-market project where:
- people look for work locally and internationally,
- companies can publish real staffing needs,
- workers can present clearer AI-structured CV information,
- AI helps structure work history, practical skills, evidence, preferences, location, and availability,
- the long-term goal is to build trust between workers and employers,
- companies get clearer context before deciding whom to contact,
- hiring becomes less random than reading generic CVs or unstructured messages.

Do not overclaim. Do not say the platform has massive traffic, guaranteed applicants, automated hiring, verified supply, or mature marketplace liquidity unless real source evidence exists.

## Main acceptance rule
A company can enter the ready outreach batch only if:
- it is a real company or agency,
- it has a visible hiring/staffing signal from the last 6 months,
- the source URL is recorded,
- a contact route is public and lawful,
- it is not a duplicate from the same batch or previous batches,
- only one draft is prepared for that company.

If no date is visible:
- mark as `needs recency verification`,
- do not mark ready for sending,
- place in watchlist/review only.

If the only hiring signal is older than 6 months:
- exclude from ready outreach,
- place in `excluded-or-watchlist.md`.

## Recency scoring
Sort daily lead selection by freshness:
- 5 points: posted/updated in last 14 days,
- 4 points: posted/updated in last 30 days,
- 3 points: posted/updated in last 90 days,
- 2 points: posted/updated in last 180 days,
- 1 point: undated or older than 180 days — exclude from ready outreach.

Target:
- at least 70 of 100 leads should ideally be from the last 30 days when enough evidence exists,
- all ready leads must be within the last 180 days.

## Deduplication
Never duplicate companies in the same daily batch or across previous batches.

Deduplicate by:
- normalized company name,
- official website domain,
- public registration/company number if available,
- contact email domain,
- LinkedIn/company URL if used,
- obvious parent/subsidiary relation.

If the same company appears in several sources:
- keep one master row,
- merge useful hiring signals into notes,
- prepare only one email draft,
- choose one best contact route.

Before adding a company, check:
`runtime/outreach/labourmarketai-company-demand/`

Maintain:
`runtime/outreach/labourmarketai-company-demand/company-dedupe-ledger.csv`

Ledger columns:
- first_seen_date
- last_seen_date
- normalized_company_name
- official_domain
- country
- contact_value
- last_hiring_signal_date
- last_source_url
- last_outreach_status
- notes

Do not create a new ready draft if the company already has:
- ready draft already prepared,
- owner-approved sent status,
- skipped status,
- do-not-contact status,
- duplicate status.

If new stronger evidence appears for an existing company:
- update ledger,
- add to `recheck-existing-companies.md`,
- do not prepare a second cold email unless owner explicitly approves follow-up.

## One-company-one-email rule
For cold outreach preparation:
- one company = one draft,
- one draft = one contact route,
- no multiple emails to different contacts at the same company,
- no repeated emails to the same company without owner approval,
- no automatic sending.

Contact priority:
1. official HR/recruitment email,
2. public contact form,
3. generic company email,
4. public LinkedIn/company page,
5. private personal email only if clearly listed as official recruitment/business contact.

## Daily target
Minimum per daily run:
- 100 unique ready companies,
- from multiple sectors,
- with source URL and hiring signal date/status,
- each with one personalized email draft.

Preferred sector split:
- 20 staffing/recruitment/temporary-work agencies,
- 20 construction/renovation/technical-service companies,
- 15 manufacturing/warehouse/logistics companies,
- 10 hospitality/cleaning/care/facility-service companies,
- 10 agriculture/seasonal/food-production companies,
- 10 transport/delivery/driver-related companies,
- 10 trade/installation/maintenance/field-service companies,
- 5 other high-signal companies with urgent worker needs.

Adjust split based on real current demand but keep sector diversity.

## Geography
Search broadly across Europe.

### Core priority countries
Use daily where possible:
- Lithuania
- Netherlands
- Germany
- Denmark
- Norway
- Sweden
- Finland
- Poland
- Latvia
- Estonia

### Wider Europe rotation
Also cover:
- Belgium
- Ireland
- United Kingdom
- France
- Austria
- Switzerland
- Czech Republic
- Slovakia
- Slovenia
- Croatia
- Romania
- Bulgaria
- Hungary
- Spain
- Portugal
- Italy
- Greece

Daily geography mix:
- include at least 6 countries when possible,
- no more than 25 companies from one country unless intentionally country-focused,
- at least 20 companies from wider Europe expansion countries when current sources exist,
- suggested split: 60–75 core countries, 25–40 wider Europe.

## Source order
Do not search randomly. Use this source order and record which source produced each lead.

### 1. Official company career pages
Highest-quality direct-employer leads:
- `/careers`
- `/jobs`
- `/vacancies`
- `/karjera`
- `/darbas`
- `/stellenangebote`
- `/vacatures`
- `/ledige-stillinger`
- `/rekrytering`
- equivalent local-language vacancy pages.

Evidence required:
- exact company page URL,
- role title,
- location/country,
- date/current status if visible.

### 2. Public job boards / public job ads
Use job boards as discovery and evidence. Prefer extracting company name and then checking official website/contact page.

Examples by country:
- Lithuania: CVbankas.lt, CVonline.lt, Užimtumo tarnyba public job listings, company career pages.
- Netherlands: Indeed.nl public listings, Nationale Vacaturebank, Werk.nl public listings, company career pages, staffing agency vacancy pages.
- Germany: StepStone.de, Indeed.de, Bundesagentur für Arbeit public job listings, company career pages, staffing agency vacancy pages.
- Denmark: Jobindex.dk, Workindenmark.dk, company career pages, staffing agency vacancy pages.
- Norway: Finn.no/job, Arbeidsplassen.nav.no, company career pages.
- Sweden: Arbetsförmedlingen Platsbanken, Indeed.se, company career pages.
- Finland: Job Market Finland / TE-palvelut public listings, Oikotie Työpaikat, company career pages.
- Poland: Pracuj.pl, OLX Praca public listings, company career pages, agency vacancy pages.
- Latvia: CV.lv, NVA public listings, company career pages.
- Estonia: CVKeskus.ee, Töötukassa public listings, company career pages.
- Wider Europe: official job boards, major public boards, agency vacancy pages, and company career pages for each country.

### 3. Staffing/recruitment/temporary-work agency vacancy pages
Use agency vacancy pages as a major source because they reveal repeated staffing demand.

Search terms:
- staffing agency construction workers
- temporary work agency warehouse workers
- recruitment agency production workers
- employment agency drivers
- uitzendbureau vacatures bouw logistiek productie
- Zeitarbeit Stellenangebote Bau Lager Produktion
- vikarbureau job construction warehouse production
- bemanningsbyrå bygg lager produktion
- personalirent ehitus tootmine ladu

Evidence required:
- agency name,
- country,
- active roles/sectors,
- vacancy page URL,
- public contact route.

### 4. Directories/contact enrichment only
Use directories only to verify identity/contact after a hiring signal is found elsewhere.

Allowed enrichment:
- official company contact page,
- national business registry public page where normal access is allowed,
- public company LinkedIn page if normally accessible,
- public industry/chamber member page,
- Google Business snippets only as secondary support.

Do not count a company only because it exists in a directory.

## Query templates
Use local-language search queries.

Lithuania:
- `site:.lt karjera statybos ieško darbuotojų`
- `site:.lt darbo pasiūlymai gamyba sandėlis vairuotojas`
- `site:.lt ieškome darbuotojų valymas logistika`
- `statybos įmonė ieško darbuotojų Lietuva`
- `gamybos įmonė ieško darbuotojų Lietuva`

Netherlands:
- `site:.nl vacatures bouw medewerkers gezocht`
- `site:.nl vacatures productie magazijn logistiek`
- `uitzendbureau vacatures bouw Nederland`
- `vacatures timmerman schilder stukadoor Nederland`
- `vacatures warehouse production logistics Netherlands`

Germany:
- `site:.de Stellenangebote Bau Mitarbeiter gesucht`
- `site:.de Jobs Produktion Lager Logistik Mitarbeiter`
- `Zeitarbeit Bau Produktion Lager Stellenangebote Deutschland`
- `Maler Trockenbauer Elektriker gesucht Deutschland`

Denmark:
- `site:.dk ledige stillinger byggeri produktion lager`
- `vikarbureau job lager produktion byggeri Danmark`
- `construction workers wanted Denmark jobs`

Norway:
- `site:.no ledige stillinger bygg lager produksjon`
- `bemanningsbyrå ledige stillinger bygg Norge`
- `production warehouse construction jobs Norway`

Sweden:
- `site:.se lediga jobb bygg lager produktion`
- `bemanningsföretag lediga jobb bygg produktion Sverige`
- `warehouse production construction jobs Sweden`

Finland:
- `site:.fi avoimet työpaikat rakennus varasto tuotanto`
- `henkilöstövuokraus työpaikat rakennus tuotanto Suomi`
- `warehouse production construction jobs Finland`

Poland:
- `site:.pl praca budowa produkcja magazyn kierowca`
- `agencja pracy oferty budowa magazyn produkcja Polska`
- `firma szuka pracowników budowlanych Polska`

Latvia:
- `site:.lv vakances celtniecība ražošana noliktava`
- `personāla atlase vakances celtniecība Latvija`
- `darbs noliktava ražošana Latvija`

Estonia:
- `site:.ee tööpakkumised ehitus tootmine ladu`
- `personalirent tööpakkumised ehitus tootmine Eesti`
- `warehouse production construction jobs Estonia`

Add equivalent local-language queries for wider Europe countries.

## Compliance and anti-spam rules
This task prepares outreach drafts and review files only.

Do not send emails automatically unless owner separately and explicitly approves sending.

Every draft must:
- be relevant to visible hiring need,
- identify LabourMarket.ai clearly,
- avoid deceptive claims,
- avoid fake urgency,
- avoid pressure,
- include a simple opt-out sentence if used for cold outreach,
- be personalized from source evidence,
- be short enough for B2B outreach.

Do not:
- bypass paywalls, logins, CAPTCHAs, robots restrictions, or rate limits,
- scrape private data,
- use leaked/bought/contact databases,
- harvest private personal emails,
- send bulk email,
- create multiple drafts for the same company.

## Required output folder
Create per run:
`runtime/outreach/labourmarketai-company-demand/YYYY-MM-DD/`

## Required files

### `companies.csv`
Columns:
- date
- company_name
- normalized_company_name
- official_domain
- country
- city_or_region
- sector
- company_type
- hiring_signal
- hiring_signal_date
- recency_bucket
- source_date_visible_yes_no
- roles_needed
- source_url
- contact_method
- contact_value
- outreach_angle
- priority_score_1_5
- language_recommended
- duplicate_status
- previous_contact_status
- ready_for_owner_review_yes_no
- notes

Allowed `recency_bucket`:
- last_14_days
- last_30_days
- last_90_days
- last_180_days
- undated_needs_verification
- older_than_180_days_excluded

Allowed `duplicate_status`:
- new_unique_company
- duplicate_same_day_merged
- duplicate_previous_batch_skipped
- existing_company_new_signal_recheck
- do_not_contact

### `email-drafts.md`
For each ready company:
- company name,
- source evidence summary,
- recommended language,
- subject line,
- personalized email body.

Each draft must include at least 2 company-specific details:
- role needed,
- country/city/region,
- sector,
- agency/direct employer type,
- urgency wording,
- skill/certificate/language requirement,
- shift/season/project type,
- hiring scale if public.

### `daily-report.md`
Include:
- total raw leads found,
- total unique ready companies,
- count by country,
- count by sector,
- newest lead date found,
- oldest accepted lead date,
- number from last 14 days,
- number from last 30 days,
- number from last 90 days,
- number from last 180 days,
- number excluded for being too old/undated,
- strongest 10 opportunities,
- suggested next-day focus,
- risks/compliance notes,
- top 10 search queries that produced best leads.

### `owner-review-next-actions.md`
Include:
- which companies are ready for owner-approved sending,
- which need better contact discovery,
- which should be skipped,
- whether any LabourMarket.ai company-need page gaps were discovered.

### `dedupe-report.md`
Include:
- total raw leads found,
- companies removed as duplicates,
- companies merged from multiple sources,
- companies skipped because previously contacted/prepared,
- companies moved to recheck-existing list,
- final unique companies count,
- confirmation that no company was prepared for multiple cold emails.

### `excluded-or-watchlist.md`
Include:
- old leads older than 6 months,
- undated leads needing verification,
- hidden-company job-board ads,
- companies without usable public contact route,
- duplicates not used,
- reason for exclusion.

### `recheck-existing-companies.md`
Include:
- companies already known from previous batches,
- new hiring signal found,
- whether follow-up might be useful,
- why no second email was drafted.

## Email draft structure
Subject examples:
- `New way to receive clearer worker profiles for [role/sector] needs`
- `Invitation to publish [company/sector] staffing needs on LabourMarket.ai`
- `For your [role] hiring needs — clearer CV context from workers`

Body:
1. Show why the company was selected using source evidence.
2. Introduce LabourMarket.ai.
3. Give sector-specific benefit.
4. Explain long-term trust angle.
5. Invite company to publish its need or reply with roles.
6. Offer help preparing the first listing.
7. Add opt-out sentence.

Example style:

Subject: Invitation to publish your staffing needs on LabourMarket.ai

Hello,

I noticed that your company is currently looking for workers for [role/sector/location]. That is exactly the type of real staffing need LabourMarket.ai is being prepared to support.

LabourMarket.ai is a new labour-market project where companies can publish staffing needs and workers can present clearer, AI-structured CV information: work history, practical skills, availability, location preferences, and relevant experience.

For companies in [sector], the long-term value is not only receiving names, but getting clearer context before deciding whom to contact. The platform is being built around trust between workers and employers, so hiring decisions can become more precise over time.

You are welcome to publish your first company need here:
https://labourmarket.ai/lt/company-need

If useful, reply with the roles you are looking for and we can help prepare the first listing.

If this is not relevant, you can simply reply “no” and we will not contact you again.

Best regards,
LabourMarket.ai team

## LabourMarket.ai route
Use:
`https://labourmarket.ai/lt/company-need`

If repo source shows a newer canonical company-need route, use the current route and document it.

## Product feedback loop
While preparing outreach, inspect whether the company-need page is ready for cold traffic:
- clear invitation for companies,
- plain-language value,
- suitable LT/EN/RU wording,
- no “preview”, “coming soon”, “not saved”, “AI disabled”, or dead-end wording,
- confirmation explains next step.

Do not fix product page inside this task unless owner explicitly allows it. Record gaps.

## Automation expectation
Prepare repeatable daily process:
- CLI/script or documented runbook,
- output files under runtime,
- no auto-send,
- easy owner review,
- optional future Gmail draft creation only after explicit owner approval.

If Agentai OS is the correct repo for recurring daily job orchestration and LabourMarket.ai is only the product context, choose the correct architecture without asking owner. Record decision.

## Validation
Run relevant checks. At minimum:
```powershell
npm run typecheck
npm run lint
```

If repo has launch/outreach/company-need guards, run them too.

## Final owner report
Report:
- branch name,
- commit SHA,
- PR link,
- exact changed files,
- how to run the daily task,
- where output files are written,
- how many companies were collected in the first run,
- source mix by country/sector,
- recency breakdown,
- duplicate count removed,
- wider Europe country coverage,
- how many drafts are ready for owner review,
- how many excluded,
- validation results,
- product-page gaps discovered,
- confirmation no emails were sent and no company got multiple drafts.

## Success definition
Successful when:
- repeatable daily process exists,
- at least 100 unique companies can be prepared per run,
- each ready company has a hiring/staffing signal from the last 6 months,
- newest/current needs are prioritized,
- wider Europe is included,
- duplicates are removed,
- one company has only one draft,
- no email is sent automatically.
