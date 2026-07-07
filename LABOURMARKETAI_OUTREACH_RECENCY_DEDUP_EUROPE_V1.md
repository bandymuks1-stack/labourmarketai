# LabourMarket.ai — Outreach Recency, Deduplication and Wider Europe Rules v1

## Purpose
Add these rules to the daily company-demand outreach task. These rules override any weaker wording in the previous outreach files.

## Main rule
Every company lead must be a real company/contact with a visible hiring or staffing-need signal from the last 6 months.

The strongest priority is always:
1. active/current job needs,
2. newest postings,
3. repeated hiring signals,
4. older but still relevant signals within the last 6 months.

Do not build lists from generic company directories without a recent hiring signal.

## Recency requirement
A company can enter the outreach batch only if at least one source proves hiring/staffing demand within the last 6 months.

Accepted recency proof:
- job ad date,
- career page posting date,
- public vacancy page update date,
- public campaign/news post date,
- job-board listing date,
- agency vacancy page with visible active/current status,
- repeated current listings for the same company or sector need.

If no date is visible:
- mark the lead as `needs recency verification`,
- do not mark it ready for sending,
- include it only in a separate review section unless stronger evidence is found.

## Current/newest priority
Sort daily lead selection by freshness:
- 5 points: posted/updated in last 14 days,
- 4 points: posted/updated in last 30 days,
- 3 points: posted/updated in last 90 days,
- 2 points: posted/updated in last 180 days,
- 1 point: no visible date or older than 180 days — exclude from ready outreach.

For the daily 100-company target, at least 70 should ideally come from the last 30 days when enough evidence exists.

## Six-month cutoff
Do not prepare ready-to-send email drafts for companies whose only hiring signal is older than 6 months.

If the company is strategically important but the only source is older than 6 months:
- place it in `excluded-or-watchlist.md`,
- explain why it was not used,
- do not include it in the ready outreach count.

## Deduplication rule
Never duplicate companies in the same daily batch or across previous batches.

Deduplicate by:
- normalized company name,
- official website domain,
- public registration/company number if available,
- contact email domain,
- LinkedIn/company URL if used,
- known parent/subsidiary relation if obvious.

If the same company appears from multiple job boards or countries:
- keep one master company row,
- merge all useful hiring signals into the notes,
- prepare only one email draft,
- choose the most relevant contact method,
- do not send multiple emails to the same company.

## Cross-day duplicate prevention
Before adding a company, check previous output folders:
`runtime/outreach/labourmarketai-company-demand/`

Maintain or create:
`runtime/outreach/labourmarketai-company-demand/company-dedupe-ledger.csv`

Columns:
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

Do not create a new ready email draft if the company already exists in the ledger with:
- ready draft already prepared,
- owner-approved sent status,
- skipped status,
- do-not-contact status,
- duplicate status.

If new stronger hiring evidence appears for an existing company:
- update the ledger,
- add it to a `recheck-existing-companies.md` section,
- do not create a second cold email unless owner explicitly approves a follow-up.

## One-company-one-email rule
For cold outreach preparation:
- one company = one draft,
- one draft = one contact route,
- no multiple emails to different contacts at the same company,
- no repeated emails to the same company without owner approval,
- no automatic sending.

If several contacts exist:
1. prefer official HR/recruitment email,
2. then public contact form,
3. then generic company email,
4. then public LinkedIn/company page,
5. avoid private personal emails unless clearly listed as official recruitment/business contact.

## Wider Europe scope
The search must cover Europe more broadly, not only the first 10 priority countries.

### Core priority countries
Use daily:
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

### Wider Europe expansion countries
Rotate through:
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

Use wider Europe especially for sectors with strong labour demand:
- construction and renovation,
- technical trades,
- logistics and warehouse,
- manufacturing,
- agriculture and seasonal work,
- cleaning and facility services,
- care/support services,
- hospitality,
- transport/drivers,
- installation and maintenance.

## Daily geography mix
For each daily 100-company batch:
- include at least 6 countries when possible,
- no more than 25 companies from one country unless the day is intentionally country-focused,
- at least 20 companies should come from wider Europe expansion countries when enough current sources exist,
- keep direct employers and agencies mixed.

Suggested daily split:
- 60–75 companies from core priority countries,
- 25–40 companies from wider Europe expansion countries.

## Required CSV additions
Add these columns to `companies.csv`:

- hiring_signal_date
- recency_bucket
- source_date_visible_yes_no
- normalized_company_name
- official_domain
- duplicate_status
- previous_contact_status
- ready_for_owner_review_yes_no

Allowed `recency_bucket` values:
- last_14_days
- last_30_days
- last_90_days
- last_180_days
- undated_needs_verification
- older_than_180_days_excluded

Allowed `duplicate_status` values:
- new_unique_company
- duplicate_same_day_merged
- duplicate_previous_batch_skipped
- existing_company_new_signal_recheck
- do_not_contact

## Required new output files
In each daily folder, also create:

### `dedupe-report.md`
Include:
- total raw leads found,
- companies removed as duplicates,
- companies merged from multiple sources,
- companies skipped because previously contacted/prepared,
- companies moved to recheck-existing list,
- final unique companies count.

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

## Email draft rules with recency
Each email draft must mention a real current/recent signal without sounding invasive.

Good:
- “I noticed your company recently listed roles for warehouse and logistics staff in [country/region].”
- “Your careers page shows current openings for [role].”
- “Your agency is currently advertising several [sector] roles.”

Bad:
- “We saw your private hiring data.”
- “You urgently need workers.”
- “You failed to find staff.”
- “We can guarantee workers.”

## Final report additions
The final owner report must include:
- newest lead date found,
- oldest accepted lead date,
- number of leads from last 14 days,
- number from last 30 days,
- number from last 90 days,
- number from last 180 days,
- number excluded for being too old or undated,
- duplicate count removed,
- wider Europe country coverage,
- confirmation that no company received or was prepared for multiple cold emails.

## Success definition
The daily run is successful only when:
- at least 100 unique companies are prepared,
- each ready company has a hiring/staffing signal from the last 6 months,
- newest/current needs are prioritized,
- duplicates are removed,
- no company is prepared for multiple cold emails,
- wider Europe is included,
- no email is sent automatically.
