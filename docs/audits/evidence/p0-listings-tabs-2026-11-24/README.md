# Listings — browse and my listings as tabs (decision 0034), 2026-11-24

Local production build on the local Supabase stack, QA-SYNTHETIC sessions,
Chromium. `page-length.tsv` = document height ÷ viewport height.

| | 390 | 1440 |
|---|---|---|
| main before (#3785 fold; browse + my listings + three intro lines) | 2.22 | 1.20 |
| after, browse (`/dashboard/listings`) | 1.87 | 1.07 |
| after, my listings (`?tab=mine`) | 1.14 | 1.07 |

Browse keeps the #3785 fold (five rows + "Show all (n)"); the five cards
themselves fill the rest of the phone screen.
