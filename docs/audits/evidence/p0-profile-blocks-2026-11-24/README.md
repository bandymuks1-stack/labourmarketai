# Profile — one block per screen (decision 0034), 2026-11-24

Local production build (`next build && next start`) on the local Supabase stack,
QA-SYNTHETIC worker and learner sessions, Chromium, 390×844 and 1440×900.
`page-length.tsv` = document height ÷ viewport height.

| Block (`?tab=`) | Before, 390 (learner / worker) | After, 390 (learner / worker) |
|---|---|---|
| whole page (all blocks stacked, five closed bars) | 4.57 / 3.47 | — |
| overview (default) | — | 4.45 / 3.35 |
| edit | — | 1.24 / 1.24 |
| details (work card) | — | 3.78 / 3.78 |
| background (languages, education, certificates, links) | — | 3.07 / 2.97 |
| skills | — | 2.21 / 2.21 |
| about | — | 1.60 / 1.60 |

Before, every editor sat behind a closed bar on one page; after, each block is
its own screen and opens already expanded. Old anchors forward to their tab
(`#capabilities` → `?tab=skills#capabilities`, `#cv-languages` →
`?tab=background#cv-languages`), measured in the TSV `final_url` column.

Still longer than one screen: the overview (ProfileHubOverview 2 154 px + the
learner's Compass 655 px) and the details tab (the work-card form, 1 901 px).
Each is one block; shortening them is a change inside those components.

`tests/e2e/profile-hierarchy.spec.ts` (rewritten for tabs): 5/5 passed, three
consecutive runs, against this build.
