# Signed-in first run and daily screens — ranked defect list (2026-11-14)

Owner issue #3322, workstream 5 (final UX/UI). This text contains no personal data, no
secrets, no security-vulnerability detail, no commercial facts.

## How it was looked at

A throwaway local stack (local database with every migration replayed, the app in acceptance
mode, nothing connected to production). Three synthetic accounts signed up through the real
form — worker, employer, agency — in Lithuanian, at 390×844 and 1440×900, and opened their
first-run and daily screens: sign-up, both onboarding steps, company setup, the home, and
9–11 further screens per role (67 screen states per width pass, all returned 200). Every
phone and most desktop screenshots were looked at by eye; a script also measured, on the phone
pass, every control lower than 40 px and every text smaller than 12 px.

Not done: no people were asked. Usability with people: NOT TESTED. Other languages, real
data volumes and the production build were not walked.

## Ranked list

"Size": S = a class or a few lines in one component; M = one component reworked; L = many
files or a decision first.

| # | Screen | What a first-time user cannot understand or do | Size | Status |
|---|---|---|---|---|
| 1 | Worker home, first visit | The first card ends with an error line, "Atvirų punktų perskaityti nepavyko" (open items could not be read), with "try again", on a brand-new account that has nothing to read. A new user's first screen says something failed. | S–M | In #3270's files (`today-screen.tsx`); its last commit addresses a failed read on the home. **For Lane A2 — not touched here** |
| 2 | Employer and agency home, phone | "Įmonės sritys" is a sideways carousel with a cut second card and arrow buttons — the pattern the owner rejected on the landing. The first card is an empty queue ("Laukia patvirtinimo: 0"), above the one action a new employer needs ("Aprašyti poreikį"). | M | In #3270's files (`company-model-screen.tsx`, home). **For Lane A2** |
| 3 | Sign-up → onboarding → app, all roles | The landing addresses the visitor formally ("jūs"); sign-up, onboarding and every signed-in screen use the informal "tu" ("Sukurk paskyrą", "Šiek tiek apie tave", "Tvarkyk…"). One onboarding card mixes both in two neighbouring sentences ("matai tik tu" / "jūsų profesinio profilio"). | L | Open — owner decision on the form of address for the product, then a copy pass |
| 4 | Sign-up → onboarding | Sign-up is a light page; the next screen (onboarding) and the app are dark, with no choice made by the user. It reads as two different products. | M | Open — needs a decision: which theme a new account starts in |
| 5 | Company workspace pages, phone (`/dashboard/company`, people, projects) | Four layers stand above the content: header, workspace + menu row, three wrapped rows of section chips, a "back" row and an eyebrow. The page title starts about 60% down a 844 px screen. | M | Open |
| 6 | Forms on phones: candidate / provider drafts, proposals and contracts, team creation, project creation, company setup, worker invitation | Fields were 30–38 px high with 14 px text: hard to hit, and phones zoom the page on focus. | S | **Fixed in this change** — 44 px and 16 px below 640 px; unchanged on wider screens |
| 7 | Onboarding step 2, all roles | "Atgal" (back) was a 16 px high text button under the form. | S | **Fixed in this change** — a 44 px target |
| 8 | Second header row, phone | The right-hand control is the navigation menu, but its label is sometimes "Meniu" and sometimes the current page's name; the workspace name on the left is cut ("Bandomoji em…"). | M | In #3270's files (`conversation-header.tsx`). **For Lane A2** |
| 9 | Account settings, all roles | Notification choices are bare 16 px checkboxes in a grid of 14+ controls. | S–M | Open |
| 10 | CV page, phone | Template chips are 26 px high; the back link 20 px. | S | Open |
| 11 | Disclosure rows ("Kaip tai veikia", "Eigos veiksmai", "Užregistruoti sutartį"…) | 16–20 px high tap rows on several pages. | S each | Open |
| 12 | Profile and journal, phone | Status labels at 10 px ("Dar nėra darbo įrašų", "Dirba dabar"). | S | Open |
| 13 | `/dashboard/inbox` for a worker or an agency | The page is the reviewer's queue ("Įrašai, laukiantys patvirtinimo") with reviewer wording, shown to someone who reviews nothing. Reached here by address; whether the menu leads a worker there was not checked. | M | Open — to verify |
| 14 | Every screen until the cookie notice is answered, phone | The notice takes about 70 px above the header on every screen, including onboarding. Expected once; it stays through sign-up and onboarding if not answered. | — | By design; noted |

Also seen on `main` (not in the V3 branch): the cookie notice still reads "tau leidus"
(informal) in Lithuanian; #3314 replaces that sentence.

## What this change does

Items 6 and 7 only, inside existing components, phone widths only:

- `candidate-drafts-manager.tsx`, `commercial-panel.tsx`, `team-brigades-panel.tsx`,
  `project-assignment-manager.tsx`, `company-setup-form.tsx`, `company-workers-section.tsx`:
  text fields get `max-sm:min-h-11 max-sm:text-base`.
- `onboarding-wizard.tsx`: the back button becomes a 44 px target.

Measured again after the change on the same screens: no field under 40 px remains on the
candidate drafts form, the onboarding step, the proposal and contract forms' text fields or
the worker invitation. Still under 40 px on those pages: disclosure rows, two filter selects
and the search field on the commercial page, the file chooser on the people page (items 9–11).

## Files in this folder

- `employer-390-candidate-form-before-after.png`, `agency-390-commercial-before-after.png`,
  `employer-390-onboarding-before-after.png` — left: before, right: after.
- `before-{worker,employer,agency}-{390,1440}-10-dashboard.png` — the three homes as walked
  (items 1, 2, 8), and `before-employer-390-12-dashboard_company.png` (item 5).

## Note for Lane A2 (#3270)

#3314 renames the public goal id `orders` to `contractors` and moves its two areas into
`services`; #3270 keys its goal tables on the public goal ids, so whichever merges second
must follow. Items 1, 2 and 8 above are in files #3270 rewrites and are left to it.
