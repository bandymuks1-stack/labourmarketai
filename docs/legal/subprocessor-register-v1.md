# Vendor / Subprocessor Register — v1 (2026-07-11)

Controller: UAB „Nonstop Group“ (302676973, Lithuania). Register of
processors/subprocessors that touch platform personal data, plus vendors
that do NOT. DPA status honestly marked — VERIFY items are owner actions.

| # | Vendor | Service | Personal data touched | Region | Role | DPA / terms status |
|---|---|---|---|---|---|---|
| 1 | Supabase (Supabase Inc.) | database, auth, storage (project gorgitwvdzxbnaxhrsrw) | all platform data (profiles, CVs refs, journals, ledgers) | eu-west-1 (Ireland) | processor | Supabase standard DPA available — **VERIFY: accepted/on file for this account** |
| 2 | Vercel Inc. | web hosting, serverless functions, logs | request metadata, server logs (may contain user ids) | EU edge + US company | processor | Vercel standard DPA — **VERIFY: accepted/on file** |
| 3 | Google (OAuth) | sign-in identity provider | email, name at sign-in | EU/US | independent controller for its own service + processor aspects | Google terms — **VERIFY scope** |
| 4 | Telegram (owner-alert bot) | operator notification channel | company-need intake fields (B2B contact data, capped/clipped); NO worker personal data | Telegram infra | processor-like channel to the operator | **VERIFY: acceptable for B2B contact data; keep worker data out (enforced in code)** |
| 5 | Anthropic (Claude API, if/when AI features run server-side) | AI processing | currently NONE in production flows with personal data | EU/US | — | add BEFORE any personal data flows |
| — | Labour Market AI Sp. z o.o. | IP licensor | **NONE — no routine access (by design + licence §5)** | PL | neither controller nor processor | intercompany licence §5 |

Rules: adding any vendor that touches personal data requires updating this
register, the Privacy Policy recipients section, and (if outside the EEA)
a transfer-mechanism check BEFORE go-live. International transfers today:
Vercel (US parent) and Google — **VERIFY SCC/adequacy coverage with the DPA
paperwork** before stating "no third-country transfers" publicly; the
Privacy Policy currently names recipient categories without asserting a
transfer-free guarantee.
