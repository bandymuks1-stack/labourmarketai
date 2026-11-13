# Landing V3 — structure preview (for owner approval; nothing merged, no PR)

Branch `evidence/landing-v3-preview`. A working prototype, not a proposal on paper: the
"preview" screenshots in this folder are rendered from a production build of this branch.
The "before" screenshots are the live site (`labourmarket.ai`, build `59b1c759`), captured
2026-11-13.

This text contains no personal data, no secrets, no security-vulnerability detail, no
commercial facts.

## Goal

A new visitor understands within five seconds who it is for, what they can do and how to
start — and meets each choice once.

| | live `59b1c759` | preview |
|---|---|---|
| Full page height, phone 375×740 (lt) | 8,556 px (≈11.6 screens) | 2,171 px (≈2.9 screens) |
| Full page height, desktop 1440×900 (lt) | 4,862 px (≈5.4 screens) | 1,229 px (≈1.4 screens) |
| Sideways overflow on the phone | — | 0 px |
| Blocks between header and footer | 10 | 3 |
| Places a visitor is asked "who are you / what do you want" | 4 (goals, example chips, starting contexts, closing band) | 1 (+ the sentence field as an alternative) |
| Places that print market numbers | 2 (under the sentence field, the market band) | 1 |

## The page, in order

1. **Header** — unchanged: the original LabourMarket.ai logo, More, Ask the assistant, Sign in,
   Sign up, theme, language.
2. **The goal centre** (one block)
   - The question "What do you want to do?" (the page's h1).
   - One line under it: *"For every profession and sector. Signing up and posting a need are
     free."*
   - The goals. Desktop: all six in one row, as today. **Phone: four first, in a 2×2 grid, and
     the other two under one "More choices" button** (opens in place, works with no script).
     No carousel, no half-cut card, no "Swipe", no sideways scrolling — also inside an open
     goal (its functions are a two-column grid; professions are a list; sector chips wrap).
   - Phone only: the Sign up button (the phone header has room for Sign in only).
   - "or say what you need" — the sentence field, as the alternative way into the same
     actions, and beside it (below it on a phone):
   - **Submit a need** — ONE entry. Opening it shows the three existing request services
     (order a worker search, send a B2B request, order an individual project) as three rows;
     each opens its own existing form. Their logic, rules and routes are untouched.
3. **The job market right now** (`#market`) — the only place with numbers:
   *"57,998 active job adverts, naming 13,932 employers. These are adverts collected from
   public job sources — not LabourMarket.ai customers or registered users. Updated 13 Nov
   2026."* + one link to the adverts.
4. **How it works** (`#how-it-works`) — four short points (agree → record in the work journal →
   a manager confirms and it becomes proof of skill → the assistant suggests, a person
   decides, you choose who sees your records) and three links to the detail: For workers,
   For companies, Your data and who can see it.
5. **Footer** (home page only; other pages keep theirs) — only what is necessary, as the
   owner confirmed on 2026-11-13: Privacy policy · Terms of use · Cookie settings · Legal
   information · Contact, then the legal sentence and the copyright line, **word for word as
   today**. Gone from the home page: the decorative dot strip, the brand paragraph, the
   product and company link columns, the second language switcher and the line "Built
   together: LabourMarket.ai × Nonstop Group × Rexora". Who operates the platform, who owns
   the software and who holds the copyright are not changed anywhere.

**Form of address.** Lithuanian is the polite "jūs" throughout the preview (owner decision):
"Parašykite, ko reikia", "Ko ieškote?", "kartu su jumis". Checked in the texts this page
shows: Russian (вы), German (Sie) and Dutch (u) are already polite; **Polish is informal
today** ("Napisz…", "Twoje…", "Czego szukasz?") and is NOT changed in this preview — it
needs the polite form ("Proszę napisać…", "Państwa…") written and read by a Polish speaker.
English as natural.

## The four goals shown first on a phone — proposal and reason

**Find work · Find workers · Offer services · For agencies.** Under "More choices": Find
orders · Find partners.

- Find work and Find workers are the two sides of the market: of 237 new real accounts in 30
  days, 156 are workers and 27 are companies (183 of 237).
- Offer services and For agencies each open something a signed-out visitor can read and use
  now. Find orders and Find partners open only signed-in areas (their first step ends at the
  sign-in page), so they are the two that cost least by being one tap further.
- This is my proposal, not a measured ranking: I have no click data per goal.

## What was removed or merged, and where it is still reachable

| Live section | In the preview | Still reachable |
|---|---|---|
| Line under the goals + three facts (#3306) | merged into the one line under the question | — |
| Example chips ("I need workers", …) and "More examples" | removed (they repeat the goals) | the goals; the field's own placeholder shows an example |
| Vacancy and employer counts under the sentence field | removed from there | the market block (one place) |
| Three request cards | merged into "Submit a need" | the same three forms, one tap further on every screen size |
| "Hiring is the start, not the end" (two-sides lifecycle) | merged into How it works | `/for-workers`, `/for-companies` |
| Market band (two big number cards, top profession chips, notes) | reduced to one sentence with its source | `/jobs`, `/labour-market` (via Find workers) |
| "A few open jobs" band | removed from the landing | `/jobs` — Find work → Job board (2 actions), More → Jobs, footer |
| Starting contexts ("I am a worker / employer / agency / school", partner line) | removed (a second role choice) | sign-up: header and phone button; `/company-need`: Find workers → Describe your need; agency setup: For agencies; school setup: More → For schools and training providers; `/for-workers`, `/for-companies`, `/for-agencies`: goals, How it works, footer; `/about`: More, footer |
| Product chain (six steps) | merged into How it works (four points) | `/for-workers`, `/for-companies`; the `#how-it-works` anchor still exists |
| Trust band ("Your records, under your control") | merged into How it works, point 4 | `/legal/data-access`, `/legal/data-protection` (How it works link, footer) |
| Closing band ("Start where you are": Start now, Jobs) | removed (a repeated call to action) | Sign up in the header; `/jobs` as above |
| Footer dot strip, brand paragraph, "Built together …" line | removed on the home page | — |
| Footer link columns (Jobs, For workers / companies / agencies, Pricing, About, Cookie policy, Marketplace rules, Data protection, Your data and who can see it) | removed on the home page only | Jobs, Pricing, About: More; For workers / companies: How it works; For agencies: the goal; Your data: How it works; Cookie policy, Marketplace rules, Data protection: from the Privacy policy and Legal information pages and from every other page's footer |

Anchors kept: `#goals`, `#find`, `#request`, `#market`, `#how-it-works`.
Nothing changed: routes, page titles, canonical, hreflang, JSON-LD, sitemap, the header, sign-in
and sign-up, the request forms, the sentence reader, the goal panels opening before the
scripts are alive (the response-time fix is intact — the phone "More choices" part also works
with no script).

## Files in this folder

- `before-59b1c759-{lt,en}-{375,1440}[-dark].png` — the live site, full page; `…-first-screen.png` — its first screen.
- `preview-{lt,en}-{375,1440}[-dark].png` — the prototype, full page; `…-first-screen.png` — its first screen.
- `preview-{lt,en}-375-goal-open.png` — a goal chosen on a phone (functions in a grid, no swipe).
- `preview-{lt,en}-375-goal-professions.png` — the profession list of "Find work" on a phone.
- `preview-{lt,en}-375-more-choices.png` — "More choices" opened.
- `preview-{lt,en}-375-need-open.png` — "Submit a need" opened: the three services.
- `preview-{lt,en}-375-goal-open-no-script.png` — a goal chosen with scripts switched off.

Checked while capturing: a goal under "More choices" opens its panel with scripts switched off;
no console errors on the prototype's landing.
Looked at by eye: `preview-lt-375.png`, `preview-lt-1440-dark.png`, `preview-lt-375-goal-open.png`.
The other files: NOT looked at by eye.

Seen in those three and NOT fixed in the preview:
- the cookie notice still says "tau leidus" (informal) in Lithuanian — it is the consent text, not
  a landing text, and I did not change it;
- on a 375 px phone the example in the field ends one word early ("…darbuotojų V"); a shorter
  example or a two-line field would fix it.

## What this prototype is NOT yet

- **Languages:** the new lines exist in Lithuanian and English only, in one preview file
  (`apps/web/lib/marketing/landing-v3-copy.ts`), written by me and not read by a native
  speaker. ru, pl, de, nl show English for those lines. After approval they move into the
  six catalogs.
- **Tests and guards are not updated** — several existing guards and walks describe the live
  structure and will fail on this branch. That is expected for a preview and is why there is
  no PR. Typecheck passes.
- **The market figures in the screenshots** are the ones the live site showed at capture time
  (57,998 / 13,932), passed to the preview build by a setting, because this build has no
  database behind it. The real page reads only the canonical snapshot, as today.
- **Not looked at by people.** Usability: NOT TESTED. Speed of this branch: NOT MEASURED.
- The removed sections' components are still in the repository, unused by the landing.

## What happens to #3306

Folded in here: the phone grid (now 2×2 + "More choices"), the neutral example sentence, the
education link under More, the inner-page hero scale, the sign-in focus ring, the fix for a
goal fragment written onto the next page, and the request doors as rows. Superseded: the
three first-screen facts (now one line) and "request block open on desktop" (now one
"Submit a need" entry). If this direction is approved, #3306 is closed and replaced by one PR
from this work; if not, #3306 stays as it is.

## The owner's fourteen observations on the live phone page → the preview

| # | Live | Preview |
|---|---|---|
| 2 | rail with a cut fourth card and "Swipe" | four whole cards 2×2 + "More choices" |
| 3 | one tagline | one line, now above the goals: who it is for and what is free |
| 4 | sentence box: cut example, five chips, "More examples", numbers inside | one field with the whole example visible (button under the field on a phone), no chips, no numbers |
| 5 | three stacked request cards | one "Submit a need" entry |
| 6, 10, 11 | two chains and a trust section | one "How it works": four points and three links |
| 7 | "on the platform": two big number cards, profession chips | one sentence that says these are public adverts, not registered employers |
| 8 | advert cards, some in another language | none on the home page; one link to the adverts (decision 4 below) |
| 9, 12 | a second role choice and a third start button | removed; the goal centre is the start |
| 13 | decorative dot pattern | removed |
| 14 | long footer, "built together" line | five links + the unchanged legal sentence and copyright line |
| — | "tu" and "jūs" mixed | "jūs" |

## Decisions needed from the owner

1. **The direction itself:** four sections instead of eleven.
2. **Which four goals come first on a phone** (proposal above).
3. **"Submit a need" folded on desktop too?** In the preview it is one entry on every screen
   size; this replaces the earlier "open on desktop" answer. One tap more to reach "Order a
   worker search".
4. **Real job adverts on the landing:** the preview shows none (the live page shows a few).
   For a visitor looking for work — most new accounts — two or three real adverts may be the
   most useful thing on the page. Add them back under the market sentence, or keep it short?
5. **The market sentence:** is the wording of the source acceptable, and should the page also
   print a number of real registered LabourMarket.ai users? I have not added one: I have no
   approved public source for it.
6. **Footer legal sentence — needs the owner's / legal confirmation, not decided here:** the
   sentence naming the operator and the software owner is kept in full. It could become a
   single link to the Legal information page only if that page carries the same statement
   and a lawyer confirms nothing legally required is lost. Also to confirm: "Cookie settings"
   stays in the footer (it is how a visitor withdraws consent). Note: an existing guard pins
   the "built together" line as owner-approved wording; removing it for good needs that
   guard changed with the owner's decision recorded.
7. **"Official sources":** I wrote "public job adverts collected from job-advert sources". I
   did not write "official sources" because I have not checked that every source is one;
   the trust audit (Lane F) owns the source list.
8. **"How it works" wording** in Lithuanian and English (four points) — and who reads the
   other four languages.
