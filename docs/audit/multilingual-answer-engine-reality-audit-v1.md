# Multilingual Answer Engine — Reality Audit v1 (Wave 0)

**Date:** 2026-07-18 · **Base:** `main` @ `2bf5d455` · **Status:** Wave 0 — audit +
canonical question registry + contract + policies + guards. **Nothing is generated
as a final answer, published, or indexed in this wave.**

Goal: at least **500 canonical questions**, each answerable in every fully-active
public locale, delivered as an AI/search "answer engine" that fits the existing
apex-SEO + i18n + taxonomy architecture — never a second CMS, never a second
professions/skills system.

---

## 1. Active-locale classification

Source of truth: `apps/web/lib/i18n/config.ts`.

| Class | Locales | Notes |
|---|---|---|
| **Fully active** (routed / prerendered / selectable / indexable) | **lt, en, ru, nl, de** (5) | `activeLocales`; `defaultLocale = lt`; `x-default → lt`. |
| Present-but-inactive (JSON exists, NOT routed) | lv, et, da, no, sv, pl (6) | `/{that-locale}/…` **404s** (`layout.tsx` `notFound()`); coerced to `lt` for SEO. NOT indexable. |
| Experimental / hidden | — | none separate from the inactive set. |
| Fallback | any non-active `requestLocale` → `lt` (`request.ts`). | |
| Not suitable to index | the 6 inactive locales. | Must never enter sitemap/hreflang. |

**Canonical question count:** **550** (≥ 500). **Localized-page floor = 550 × 5 = 2,750** (fully-active locales only). Inactive locales are excluded from the floor and from indexing.

## 2. Existing architecture (what to reuse, not duplicate)

- **Canonical host:** `lib/domain/canonical.ts` — apex `labourmarket.ai` (`MARKETING_ORIGIN`). App host `app.labourmarket.ai` is NOT a public canonical. www→apex 308 (middleware).
- **Metadata / canonical / hreflang:** `lib/seo/metadata.ts` — `localizedUrl(locale, path)`, `hreflangAlternates(path)` (one per active locale + `x-default`→lt), `buildPageMetadata` / `buildPageMetadataFor` + `PAGE_SEO`.
- **Sitemap:** `app/sitemap.ts` — single flat file (no index). Emits path × active-locale via `localizedUrl` + `hreflangAlternates`. Guarded: no forbidden host literals; `/vision` gated by `isVisionPublic()`; `/legal/marketplace-rules` present.
- **robots:** `app/robots.ts` — single `userAgent:"*"`, `allow:"/"`, disallow `/api/`, `/*/dashboard`, `/*/onboarding`, `/*/auth`, `/*/cv`, `/*/design`. Sitemap + host on apex.
- **Structured data (JSON-LD):** **NONE anywhere** — greenfield.
- **Content-registry precedent:** `lib/seo/profession-problem-content.ts` — pure per-locale TS registry (`type L = Record<ActiveLocale,string>`, `SEO_PROFESSIONS`/`SEO_PROBLEMS` with real search-style `question`s), stored OUTSIDE `messages/*.json` to avoid i18n-debt/parity coupling. **This is the model the answer registry follows.**
- **Canonical taxonomy (single source):** 49 profession slugs (`messages/*/professions.json` = `lib/taxonomy/profession-skills.ts` keys, snake_case), 152 skill slugs (`messages/*/skill-names.json`, kebab-case). The registry REFERENCES these; it defines no second taxonomy.
- **Prior plan:** `docs/seo/profession-problem-search-strategy-v1.md` (programmatic-SEO per-profession/problem pages). The answer engine aligns to this direction.

## 3. Existing Q&A content (reuse as honest seed, do not duplicate)

- 16 curated FAQ pairs in `messages/*.json` (`workers.faq`, `companies.faq`, `agencies.faq`, `pricing.faq`), rendered by `components/app/faq-accordion.tsx`.
- 11 `SEO_PROBLEMS` real search-style questions (5-locale) in `profession-problem-content.ts`.
- Real question SOURCES mined: worker-intake fields (`lib/staffing/worker-intake.ts`), company-need fields (`lib/buyer/customer-requests.ts`), onboarding, dashboard-search object types, country-readiness requirement keys, contextual-fit explainability, marketing `PAGE_SEO`. **No competitor content copied.**

## 4. Distribution report (registry = 550)

Category minimums (spec) are all met exactly; sum = 550 ≥ 500:

| # | Category | Count / Min |
|---|---|---|
| 1 | job_search_discovery | 55 / 55 |
| 2 | cv_profile_experience | 40 / 40 |
| 3 | skills_competencies | 45 / 45 |
| 4 | professions_directions | 45 / 45 |
| 5 | career_change_transferable | 35 / 35 |
| 6 | reskilling_learning | 35 / 35 |
| 7 | salary_conditions | 35 / 35 |
| 8 | working_in_eu_countries | 45 / 45 |
| 9 | international_regional_mobility | 25 / 25 |
| 10 | employers_finding_workers | 45 / 45 |
| 11 | companies_teams_projects | 25 / 25 |
| 12 | students_graduates_institutions | 25 / 25 |
| 13 | agencies_partners | 15 / 15 |
| 14 | labour_market_data_trends | 20 / 20 |
| 15 | ai_automation_future | 20 / 20 |
| 16 | platform_usage_security_privacy | 40 / 40 |

**Risk mix:** LOW 355 · MEDIUM 121 · HIGH 74. **Audiences** span workers, job-seekers, freelancers, students, graduates, career-changers, reskillers, employers, companies, teams, project-owners, agencies, education-institutions, partners. **Countries:** the 9 launch markets, balanced (each appears in 5 clustered family questions); the large majority of questions are country-agnostic. **No single sector or country is prioritised** (the profession family is cross-sector incl. software developer / teacher / caregiver; construction is a minority).

## 5. AI-crawler audit

`app/robots.ts` has **no per-bot rules** — under the single `*` rule, GPTBot, ClaudeBot, Google-Extended, CCBot, PerplexityBot, Bytespider, etc. are currently **allowed** to crawl the public apex surface (only app/auth/internal paths are blocked). There is **no** AI-specific allow/deny list, no `Crawl-delay`, no separate agent-readable surface. For an answer engine this is the key lever, but **changing crawler permissions is an OWNER decision** (content-usage boundary) and is NOT changed in Wave 0. Recommendation documented in the ADR (§AI readiness) for owner sign-off.

## 6. IndexNow / Search Console / Bing readiness

**None present.** No `verification` key in any `Metadata`, no `google-site-verification` / `msvalidate.01` / `BingSiteAuth`, no IndexNow key file or env reference, nothing client-exposed. Readiness (all greenfield, all owner-gated):
- **Google Search Console / Bing Webmaster:** add `metadata.verification.{google,other}` in `layout.tsx`/`buildPageMetadata`, or a `public/<token>` file. Owner provides tokens.
- **IndexNow:** server-only key in env + `public/<key>.txt`; ping only `READY_FOR_INDEX`/`PUBLISHED` URLs; **no mass submit** in Wave 0. **The key must never reach the client bundle** (guarded).

## 7. Wave 0 deliverables (this PR)

1. This audit. 2. Canonical 550-question registry (`content/answer-engine/question-registry.json`) + generator (`scripts/build-answer-registry.ts`) + typed contract (`lib/answer-engine/contract.ts`) + loader/validators (`lib/answer-engine/registry.ts`). 3. Category/audience distribution (above). 4. Locale classification (§1). 5. Publishing-architecture ADR (`docs/DECISIONS/0009-multilingual-answer-engine.md`). 6. Answer data contract (contract.ts). 7. Translation-QA + freshness policy. 8. High-risk content policy. 9. AI-crawler audit (§5). 10. Sitemap/canonical/hreflang plan (ADR). 11. IndexNow/SC/Bing readiness (§6). 12. Behavior-neutral guard (`lib/guards/answer-engine-registry.test.ts`). 13. One Draft PR.

## 8. Owner decisions required (before any later publishing wave)

- AI-crawler policy change (allow/deny specific AI bots; content-usage boundary).
- Search Console / Bing verification tokens + IndexNow key provisioning.
- Human editorial + legal review of HIGH-risk answers before any indexing.
- Approval to add `/questions` routes + their sitemap entries (only for `READY_FOR_INDEX`).

**Not done in Wave 0 (by design):** no answer bodies, no `/questions` route, no sitemap/robots change, no JSON-LD, no IndexNow submit, no migrations, #798 untouched.
