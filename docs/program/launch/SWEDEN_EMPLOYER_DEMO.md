# Employer walkthrough and market truth table

Status date: 2026-11-14. Production build: `f0d8306`. Author: Lane E (languages and markets).
Governing instruction: issue #3322 (owner). This document describes what exists; it changes no code.

**Read this first**

- **No country is preferred** (#3322). The employer from Sweden is one example persona. Every step
  below is the same for an employer from any country. The file name is historical.
- **The Swedish interface is not ready and must not be presented as ready.** `/sv/...` redirects to
  `/en/...` on production. The walkthrough is shown in English.
- **Nothing here was walked for this document.** The evidence column cites production walks already
  recorded in `docs/program/FUNCTION_REGISTER.md` (FR). Those walks ran on synthetic accounts, in
  headless Chrome, mostly in the Lithuanian interface with Lithuanian synthetic organisations. No
  recorded walk used a company from Sweden, and few steps were read in English. FR itself says the
  walks "prove what each walk's steps cover, not the whole of a row's scope, and not a person's
  Chrome".
- **Acceptance under #3322 is not met by this document.** #3322 asks for fresh journeys on one build
  for every supported country and language. Section 4 lists what is missing.

Evidence levels used below:

| Level | Meaning |
|---|---|
| PROD | A production walk is recorded in FR with a run id and date |
| CI | Proven in code and CI only; no production walk |
| NO | Not built, not verified, blocked or retired, as FR records it |

---

## 1. Walkthrough: nine steps, English interface

All routes are under `https://labourmarket.ai`. Labels are the English catalogue's.

| # | Step | Where and what to click | Evidence | Do not promise |
|---|---|---|---|---|
| 1 | Sign in or register a company | `/en/auth/signup` → "Sign up" (e-mail, password, confirmation link) → `/en/onboarding`: "I run a company or team" → "Continue" → name, country → "Finish" → `/en/dashboard/start/company`: legal name, activity area, country, optional registration code → "Save company" | Onboarding and company creation: PROD (fresh-activation 41279196446, 2026-11-01, owner-created accounts). The sign-up form itself: CI (`signup-isolated`; FR 1.x "proven in CI only"). | Company verification. The form stores an unverified status only. |
| 2 | Understand the platform without training | `/en/dashboard` in the company workspace: the chat and the company doors ("What we need", "What we offer", "People & team", "Projects & objects", "Messages", "Clients & suppliers", "Candidates", "Calendar", "Work & hours", "Results"). `/en/dashboard/company` → first door "Describe a need". | PROD (fresh-activation 41279196446; role-routes 41280157502) | An AI assistant. The AI runtime is off (FR 10.6–10.10 BLOCKED); the chat answers deterministically. |
| 3 | Publish an offer or a need | `/en/dashboard/company/needs?audience=need#demand-intake` → role and description → "Next" → details (country, optional free-text location, pay with currency) → "Next" → "Create job request" → "View the request and its matches" | PROD (fresh-activation 41279196446; company-chain 41283188592, 13/13) | A public job advert. The need stays private in the company's space and reaches signed-in workers and the matcher. It does not appear on the public `/en/jobs` board, which shows imported adverts only. |
| 4 | Search for workers and agencies | "Candidates" → `/en/dashboard/company/scouting?request=<id>`: people matched to **that need**, with skill, country and availability filters. Organisation name search: `/en/dashboard/network?q=`. | Candidates for a need: PROD (run 41283989921; "48 candidates listed" for a new company's need). Organisation name search: PROD (same run). | A general search of workers by profession or place: NO (FR SR-8 "People / candidates search — NOT VERIFIED"). A CV database. An agency directory: there is none; an agency link starts from the agency's invitation. The agency "candidate pool" is retired. |
| 5 | Review candidates and qualification | Same page. Cards are anonymous ("Contacts stay hidden — no phone, email, or name"); each shows match reasons, gaps and the evidence tier (manager-confirmed / journal-supported / self-declared). Name and photo appear only for people who applied to the company's own need. Shortlist: "Saved", "Interested", "Not a fit", "Reviewed", internal note. | PROD (company-talent-history 41279265278, K-1..K-5) | Verified formal qualifications (FR SC-12 BLOCKED: "the product must keep saying declared"). A percentage score. |
| 6 | Contact and discuss | On an applicant's card: "Contact in the platform" → `/en/dashboard/communication/<id>`. For a matched person: shortlist, then "Request to communicate" (only when the worker is open to contact; daily cap). Inbox: `/en/dashboard/communication`. | PROD (company-chain 41283188592, C-3/C-4; agency-chain 41717112150 for an agency–client thread) | Translation of messages (BLOCKED; the original is shown and labelled). SMS, WhatsApp or push. |
| 7 | Decide about a candidate | "Propose booking" → "Send proposal"; the worker accepts → "Agreed to the dates" → "Assign to a project". For a person offered by an agency: "Accept candidate" / "Decline". "Close this need". | Booking proposal and acceptance: PROD (orders-bookings 41718546706, 2026-11-03). Agency offer answer: PROD (agency-chain 41717112150). | A formal hire / reject decision with history: NO (FR 4.30 NOT_VERIFIED, "decision + history UI and agency parts missing"). Contracts, commissions, invoices. |
| 8 | Invite workers and start a project | "People & team" → "Invite" → `/en/dashboard/network?type=join_as_employee` (e-mails or a link). Project: `/en/dashboard/company/projects/new` → "Create project" → `/en/dashboard/projects/<id>` and `/operations` (stages, tasks, assignment, readiness, handover). | PROD (invited-worker 41430482903, 7/7, 2026-11-02; project-execution 41722638759, 2026-11-03) | The forecast engine and overlap alternatives (NOT_VERIFIED). Subcontractor hours flowing into the project (NOT VERIFIED). Expired and project-linked invitations were not walked. |
| 9 | Work journal and worker activity | The worker records at `/dashboard/journal`. The employer approves in `/en/dashboard/inbox` or from the company home card "Waiting for approval". "Work & hours" (`/en/dashboard/hours`), "Results" (`/en/dashboard/reports`), per-person recorded work on "People & team". | PROD (journal-confirm 41478434884, 4/4, 2026-11-02) | Voice journal (BLOCKED), AI suggestions (BLOCKED), profession templates (NOT_VERIFIED), the experience-dispute flow (FAIL). Approval is per employee and is off until switched on in "People & team". |

### What the presenter must say plainly

- **Language.** The interface is English (or lt, ru, pl, de, nl). There is no Swedish interface on
  production. Legal texts, e-mails and the sign-up confirmation mail are not in Swedish.
- **Plans.** Registration and posting a need are free. The paid plan is prepared, not purchasable
  (FR: "EUR 99 subscription checkout — BLOCKED"). The free plan's one-open-need limit is enforced
  only where billing is active for an organisation; an ordinary new organisation is not limited
  (FR: "PASS_CI_ONLY"). Do not present either as a working commercial offer.
- **The imported adverts are not customers.** The Swedish and Norwegian adverts on `/en/jobs` come
  from public employment services and serve job seekers. They are not employers on the platform and
  must not be shown as contactable companies.
- **A company from Sweden is not blocked by the forms.** Country is chosen from the full ISO list;
  the registration code is optional free text (a Swedish organisation number passes the format
  pattern); there is no VAT field. A need can carry pay in SEK (EUR, PLN, SEK, NOK, DKK). Location
  is a country plus optional free text: there is no county or municipality field. These are code
  facts, not walked on production.
- **Do not open** `/dashboard/talent` (sample cards, superadmin only) or `/en/pricing` as proof of an
  offer: its FAQ reads as if the paid plan were on sale.

### Suggested order (about 15 minutes)

1. Steps 1–2 with a prepared company account (the confirmation e-mail is documented as Lithuanian / English; not checked live).
2. Step 3: describe one need, with country Sweden and pay in SEK.
3. Steps 4–5: open "Candidates" for that need; explain the evidence tiers and why names are hidden.
4. Step 6: one message thread. Step 7: propose dates.
5. Steps 8–9: create a project, show the approval queue.

A rehearsal on the build that will be shown is required before any presentation; none has been done
for this document.

---

## 2. Market truth table: all supported countries

Read from production signed out, 2026-11-14 06:35–06:38 UTC, 69 pages one at a time, no form
submitted. "Code" marks facts read from the repository, not from the live site.

**The public job board has no working country filter and does not show the country of an advert.**
`/en/jobs?country=XX` returns the same list for every code and prints "Filtering by country (…) is
not available yet. Showing jobs from all countries." No per-country count is displayed anywhere.

Live totals (all countries together): "58,547 active job listings · 14,076 employers · refreshed
Nov 13, 2026" on the home page; the board prints the same 58,547.

| Country | Imported adverts | Advert language seen | Country page `/en/labour-market/xx` | Advert source (code) |
|---|---|---|---|---|
| Sweden | Yes. Per-country count not displayed. Code comment, measured 2026-11-04: 46,022 | Swedish (20 of 20 cards on the first page) | Not found (404); index card links to the job board | Arbetsförmedlingen / JobTech |
| Norway | Yes. Per-country count not displayed. Code comment, measured 2026-11-04: 8,457 | Norwegian Bokmål (seen through searches only) | Not found (404); index card links to the job board | NAV job feed |
| Lithuania, Latvia, Estonia, Poland, Germany, Netherlands | None seen in any probe; no importer | — | 200. EU-level figures and "what this country requires of you"; no advert counts | None |
| Denmark, Finland, Georgia, Belgium, France, Spain, Austria, Switzerland | None; no importer | — | Not found (404); index card "Coming soon" | None |
| United States | None; no importer | — | Not found (404); not on the index | None |

Seventeen countries are listed as active markets in code (`ACTIVE_MARKETS`); adverts exist for two.

**What a signed-out visitor sees on an advert:** occupation, mapped profession, advert language,
employment form, working time, positions, publish date. **Hidden:** "Employer and location: after
sign-in"; the detail page says "Creating an account is free." The source is given as "an official
public employment service", unnamed.

**Sectors:** mixed, not construction-only (sales, cooking, driving, care, teaching, nursing, IT,
engineering on the first page).

**Professions:** one global catalogue of 49 professions; no per-country profession data.

**Freshness (code):** an advert is shown only while active and unexpired; the total is refreshed by
a scheduled job. Whether the importers are running now was not verified beyond the publish dates of
11/12–11/13 and the "refreshed Nov 13" line.

### Search probes (`/en/jobs?q=…`, all countries; a country cannot be selected)

| Query | Result | Note |
|---|---|---|
| svetsare / welder | 349 / 347 | Relevant; Swedish adverts |
| undersköterska | 1,357 | Relevant |
| lärare / teacher | 2,364 / 2,357 | Relevant; Swedish adverts |
| sveiser, sykepleier, lærer (Norwegian) | 27, 921, 775 | Relevant |
| nurse | 38 | Misleadingly low: sjuksköterska 2,385, sykepleier 921 |
| Schweißer, spawacz, lasser (de, pl, nl) | 347 each | Mapped to Welder; the adverts are Swedish, none German, Polish or Dutch |
| Pflegefachkraft, Krankenpfleger, pielęgniarka, verpleegkundige | 0 | "No vacancies match this search right now." |

### Faults seen (reported, not fixed here)

1. The country parameter does nothing, so a visitor cannot learn that adverts exist for two countries only.
2. The labour-market index says "Source-backed evidence for the markets we serve" and names six further "open markets"; 10 of its 16 countries have no page and 14 have no adverts.
3. Norwegian adverts are missing from profession pages: "sveiser" finds 27 as text and 0 under Welder; "lærer" 775 and 0 under Teacher.
4. Miscategorised adverts: the Crane operator page lists an accounting manager and a resident doctor.
5. English words outside the catalogue undercount ("nurse" 38).
6. The Builder profession page shows 0 adverts.
7. Text and profession counts differ slightly (349 vs 347; 2,364 vs 2,357).
8. Dates on the English interface are in US format.

### Routed interface languages: what has been checked

Routed on production: lt, en, ru, nl, de, pl. All checks below are machine checks by an AI model;
no native speaker has read any language.

| Check (2026-11-13) | lt | en | ru | pl | de | nl |
|---|---|---|---|---|---|---|
| 16 public pages load in their own language (landing, jobs, pricing, role pages, about, sign-in, sign-up, legal pages) | yes | yes | yes | yes | yes | yes |
| Sign-up / sign-in path read (landing, forms, five error states, forgot / reset) | yes | yes | yes | yes | yes | yes |
| Signed-in pages read | no | no | no | no | no | no |
| The job board, search and country pages of this section | no | yes | no | no | no | no |

Findings of those checks are in the Lane E entry of the launch register (#3265).

---

## 3. Swedish interface (PR #3261): what would have to be true to switch it on

PR #3261 is a draft at head `d3e3224` with CI green. It is not merged and not deployed.

It may be switched on only when all of these hold:

1. An independent review of head `d3e3224` is complete and its findings are closed.
2. The owner decides to route `sv`.
3. A competent Swedish reader has read the interface. Today every Swedish string is AI-written and
   none has been read by a native speaker.
4. The three consent legal texts exist in Swedish and are legally reviewed (the separate, owner-gated
   PR #3232), or the owner accepts them staying in English with the on-screen note the PR adds.
5. The 45 Swedish question-and-answer pages stay unpublished until reviewed (the PR holds them back).
6. A production walk in `/sv` is recorded after deployment.

Known gaps that switching it on would not close: no county / municipality fields, no SSYK occupation
codes, the confirmation and reset e-mails stay Lithuanian / English, and the search reads adverts in
their source language only.

Until then nobody may say the Swedish interface is ready, prepared for customers, or localised.

---

## 4. Not verified, and what #3322 still requires

- No step of section 1 was walked for this document, in English, as a company from Sweden, or on a
  phone. The cited runs date from 2026-11-01 to 2026-11-03, before build `f0d8306`.
- No fresh journey exists for any country other than the Lithuanian synthetic organisations.
- Per-country advert counts are not displayed; the only split is a code comment from 2026-11-04.
- The country of an advert was inferred from its language.
- The job board, search and country pages were read in English only.
- Nothing signed-in was read for section 2.

A proposal for the missing proof: one synthetic employer journey through the nine steps on the
deployed build, in English and in one other routed language, on desktop and phone, recorded with run
id, build, screenshots and outcome per step. Production synthetic accounts are owner-dispatched, so
this lane cannot run it.
