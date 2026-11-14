# Landing V3 — what was built and how it was checked

Owner-approved structure and LT/EN copy (2026-11-13), implemented on branch
`feat/cc/landing-v3`. Not merged, not deployed; production is unchanged.

This text contains no personal data, no secrets, no security-vulnerability detail, no
commercial facts.

## The page, in order

1. **Header** — unchanged. "For training providers" is now under More.
2. **The goal centre** — the question, one line under it, six goals:
   Find work · Find workers · Offer services · Find services or contractors · Find partners ·
   For agencies. On a phone the first four are whole cards (2×2) and the other two sit under
   "More options"; nothing scrolls sideways.
   - Goal 4 is the buyer. Its two actions (business services enquiry, individual project
     enquiry) land on `#request` and open the matching form. No account is needed.
   - "Offer services" holds four actions: Your services, Service requests, Market listings,
     Proposals and contracts. An old `#goal=orders` link opens it.
   - "or describe it in your own words" — the sentence field — and "Submit a request": one
     entry to the three existing request forms (folded on phones, open on wide screens).
3. **Job adverts in the market** — one sentence with the figures from the canonical snapshot,
   saying they are public adverts and not registered customers, plus up to three real
   adverts. With no snapshot the block says the data is unavailable and links to the search.
4. **How it works** — four points and three links.
5. **Footer** (landing only) — five links, then the operator sentence and the copyright
   line, unchanged. The "built together" line is no longer in the public footer.

## Checks run on the final build (local production build, signed out)

| Check | Result |
|---|---|
| Six-language walk (`tests/e2e/landing-v3.spec.ts`): lt, en, ru, pl, de, nl × 375 and 1440 × light and dark — first screen, goal 4 opened, "Offer services" opened, request form opened through the goal's action; no sideways scroll, no cut card text, the field's example whole | 24 of 24 pass |
| Landing and navigation walks, including the CI smoke subset | 216 pass, 20 skipped (need a signed-in account or the live site), 0 fail |
| Guard suite (`lib/guards`) | all pass except `next-static-encoded-path-lookup`, which fails only in this local environment and is untouched by this change |
| Lint | 0 errors |
| Product gate | pass (existing scoped waivers only; none added) |
| Automated accessibility scan (axe, WCAG 2.0–2.2 A/AA): 6 languages × 2 widths × 2 themes × 3 states = 72 states | 0 findings |

Performance, lab only: emulated phone (4× CPU slow-down, 1.6 Mbit/s, 150 ms latency), the
same machine, production commit `59b1c75` and this branch served side by side, two rounds
of five loads each, medians:

| | production `59b1c75` | this branch |
|---|---|---|
| Largest contentful paint | 1.62 s / 1.67 s | 1.53 s / 1.54 s |
| Layout shift (CLS) | 0.016 | 0 |
| Response to a tap on a goal (interaction duration) | 128 ms / 136 ms | 120 ms / 104 ms |
| Goal cards respond to the script | 3.97 s / 4.03 s | 4.01 s / 3.95 s |
| First-load script for the page | 300 kB in 29 files | 259 kB in 26 files |
| Full page height, phone 375 (lt) | 8,556 px | 2,218 px |

These are lab numbers from one machine, not field data. Field speed: NOT MEASURED.

## Screenshots (`final/`, 120 files)

`{lt,en,ru,pl,de,nl}-{375,1440}[-dark]-{0-full-page,1-first-screen,2-goal-contractors,3-goal-services,4-request-form}.png`

Looked at by eye: all 24 full pages; all phone states in both themes for all six languages;
the wide-screen opened states in one theme per language. The remaining wide-screen opened
states were checked by the automated walk only.

The market block in these screenshots shows the "data unavailable" state: this build has
no database behind it. The state with figures and adverts is covered by guards, not shown.

`before-59b1c759-*.png` — the live page before this change.

## After the owner's answers of 2026-11-13

- **Second review of ru / pl / de / nl.** Each language was read by a separate automated
  reviewer that had not written it; 183 strings per language. Changed: ru 19, pl 20, de 12,
  nl 12. The full table, what was not applied and why, and the open questions are in
  `translation-review.md`. No native speaker has read these texts.
- **"Built together" line.** Removed from the signed-in shell too and from every catalog; it
  was a marketing credit. The legal statements (operator, software owner, copyright) are
  unchanged and still pinned by guards.
- **Free-plan limit statements.** Left to the pricing work (#3302). On 2026-11-14 the
  coordinator took the independent review's option A: this PR does not change any price
  statement. The pricing answers, the companies and agencies answers, the staffing-service
  note and the assistant's internship answer are as on `main`. The landing's own lines
  ("Registration and basic request posting are free", "Submission is free") stay: they are
  true for a first need.
- **#3306** closed as replaced; its head is an ancestor of this branch.

## Not done, not claimed

- Usability with people: NOT TESTED.
- ru, pl, de, nl (and the five non-routed catalogs) were translated in this work and have
  not been read by native speakers; see `translation-review.md`.
- Legal review of the cookie sentence, the "Your data and privacy" point and the footer's
  legal sentence: pending.
- `V3-D1-marsrutu-schema.md` and `V3-LT-EN-redakcijos-rekomendacijos.md` are the records
  written before the implementation; their status lines describe that earlier moment.
