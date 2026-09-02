# J3 — accessibility basics walk on production (2026-09-02)

Structural checks run in a real Chromium at 390 px against https://labourmarket.ai (no axe-core in the repo; these are the WCAG-A structural basics: `html[lang]`, one `h1`, one `main` landmark, image `alt`, accessible names on controls, labelled form fields, no positive `tabindex`, heading-level skips, titled iframes, skip link). Anonymous for public routes; the bounded walker identity for member routes. Read-only.

| who | route | → final | lang | h1 | main | skip link | issues |
|---|---|---|---|---|---|---|---|
| anon | `/lt` | `/lt` | lt | 1 | 1 | no | none |
| anon | `/en` | `/en` | en | 1 | 1 | yes | none |
| anon | `/lt/jobs` | `/lt/jobs` | lt | 0 | 0 | no | h1 count = 0; main landmark count = 0 |
| anon | `/lt/login` | `/lt/login` | lt | 1 | 1 | no | none |
| anon | `/lt/signup` | `/lt/signup` | lt | 1 | 1 | no | none |
| anon | `/lt/pricing` | `/lt/pricing` | lt | 1 | 1 | no | none |
| anon | `/lt/privacy` | `/lt/privacy` | lt | 1 | 1 | no | none |
| anon | `/lt/terms` | `/lt/terms` | lt | 1 | 1 | no | none |
| anon | `/lt/for-workers` | `/lt/for-workers` | lt | 1 | 1 | no | heading skip h1→h3 |
| anon | `/lt/for-companies` | `/lt/for-companies` | lt | 1 | 1 | no | heading skip h1→h3 |
| anon | `/lt/jobs/650cd5a3-8a15-488d-8ee3-e4f8774d056b` | `/lt/jobs/650cd5a3-8a15-488d-8ee3-e4f8774d056b` | lt | 1 | 2 | no | main landmark count = 2 |
| walker | `/lt/dashboard` | `/lt/dashboard` | lt | 1 | 0 | no | unlabelled textarea[name=null] placeholder=Parašyk, ko tau reikia…; main landmark count = 0 |
| walker | `/lt/dashboard/journal` | `/lt/dashboard/journal` | lt | 1 | 1 | no | none |
| walker | `/lt/dashboard/hours` | `/lt/dashboard/hours` | lt | 1 | 1 | no | none |
| walker | `/lt/dashboard/planning` | `/lt/dashboard/planning` | lt | 1 | 1 | no | unlabelled select[name=organizationId] placeholder=; unlabelled input[name=periodStart] placeholder=; unlabelled input[name=periodEnd] placeholder=; unlabelled input[name=note] placeholder=Kodėl grąžinama? |
| walker | `/lt/dashboard/account` | `/lt/dashboard/account` | lt | 1 | 1 | no | none |
| walker | `/lt/dashboard/opportunities` | `/lt/dashboard/opportunities` | lt | 1 | 1 | no | none |
| walker | `/lt/dashboard/network` | `/lt/dashboard/network` | lt | 1 | 1 | no | none |
| walker | `/lt/dashboard/documents` | `/lt/dashboard/documents` | lt | 1 | 1 | no | none |
| walker | `/lt/dashboard/cv` | `/lt/dashboard/cv` | lt | 1 | 1 | no | none |
| walker | `/lt/dashboard/advanced` | `/lt/dashboard/advanced` | lt | 1 | 1 | no | none |

Routes walked: 21. Routes with zero issues: 15.