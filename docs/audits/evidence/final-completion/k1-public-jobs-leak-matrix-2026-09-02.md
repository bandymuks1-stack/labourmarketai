# Train K1 — public-jobs leak matrix, anonymous, production (2026-09-02)

Rule under test (handoff §26): anonymously, a job may expose **position and salary**; employer / contact /
location detail / application link / full description stay protected until registration and consent.

| Surface | Probe | Exposed | Protected fields present | Verdict |
|---|---|---|---|---|
| anon search RPC `search_public_vacancy_previews_v1` | PostgREST with the anon key | `id, title_raw, profession_slug, occupation_raw, employment_form, working_time, positions, compensation_currency/min/max, source_language, attribution_code (null), published_at, total_count` | none (attribution_code is emitted as `null` by the function body) | PASS |
| anon detail RPC `get_public_vacancy_preview_v1` | same | same column set for one id | none | PASS |
| anon direct table read `public_vacancies?select=employer_name,application_url` | same | **401 / 42501** (no anon grant) | — | PASS |
| `GET /lt/jobs` (HTML, 142 KB) | anonymous fetch | list markup | no `employer_name` / `application_url` / `hiringOrganization` / `jobLocation` / `addressLocality` / platsbanken links | PASS |
| `GET /lt/jobs/<id>` (HTML, 96 KB) | anonymous fetch | detail preview | none of the above | PASS |
| JSON-LD | both pages | **0 `ld+json` blocks** | — | PASS for privacy; note for K3 |
| `/robots.txt` | anonymous | allows `/`, disallows `/api/`, `/*/dashboard`, `/*/onboarding`, `/*/auth`, `/*/cv`, `/*/design` | — | PASS |
| `/sitemap.xml` | anonymous | urlset present (locale alternates) | — | PASS |

**Zero protected fields exposed anonymously** across API, HTML, metadata, robots and sitemap.

K3 note (SEO/AEO): there is no schema.org markup on job pages. `JobPosting` requires `hiringOrganization`,
which the privacy rule forbids anonymously — so a JobPosting block must NOT be added. Safe options for K3 are
page-level `WebPage`/`ItemList` markup with title + salary only, and the existing OG metadata; recorded, not
built here.

Script: scratchpad `k1-leak-probe.mjs` (statuses, column names and marker hits only).
