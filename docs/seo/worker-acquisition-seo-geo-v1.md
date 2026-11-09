# Worker Acquisition SEO / GEO v1 — RU + TR guides

**Date:** 2026-11-09 · **Owner task:** "LabourMarket.ai Global Worker Acquisition SEO / GEO", P0
**Status:** Phase A audited, Phase B built. Publishing waits on ONE owner decision (product gate, §6).

## 1. What already existed and is reused (nothing duplicated)

| Capability | Where | Used for |
|---|---|---|
| 6 routed UI locales (lt, en, ru, nl, de, pl), `localePrefix: always` | `lib/i18n/config.ts`, `routing.ts` | RU guides live under `/ru` with a full Russian UI |
| Unrouted language codes → `/en` (307), incl. `tr`, `uk`, `ro` | `lib/i18n/unsupported-language.ts` | TR guides live under `/en`; `/tr` keeps redirecting; no Turkish UI is claimed |
| Apex canonical, hreflang builder, `brandedTitle`, OG image | `lib/seo/metadata.ts` | Guide metadata |
| `sitemap.xml` + `questions-sitemap.xml` + `jobs-sitemap.xml`, robots | `app/sitemap.ts`, `app/robots.ts` | Guides added to `sitemap.xml`, once each, with their own hreflang cluster |
| `llms.txt` (AEO) | `lib/seo/llms-txt.ts` | Every guide listed by its real URL |
| Organization + WebSite JSON-LD on every page; BreadcrumbList helper; safe JSON-LD | `app/[locale]/layout.tsx`, `lib/answer-engine/answer-seo.ts`, `lib/seo/json-ld.ts` | Guides add BreadcrumbList + Article (with `citation` of official sources) pointing at the one Organization `@id` |
| Public job board with profession filter (real, sourced ads) | `/jobs?profession=` | "See current vacancies" CTA per profession |
| Free worker sign-up with `?next=` | `/auth/signup?next=/dashboard/profile` (as `/create-cv`) | Registration CTA |
| Privacy-preserving funnel events (`cta_clicked`, first-touch attribution) | `components/app/tracked-cta.tsx` | Every guide CTA carries `guide_register_{ru,tr}` / `guide_jobs_{ru,tr}` and `audience=workers_guide_{lang}` |
| `/work-abroad` worker hub | existing page | Now lists every guide, per language, on every locale |
| Answer Engine (`/questions`) | `lib/answer-engine/*` | Not reused for guides: it publishes one question in all six UI locales and only `HUMAN_APPROVED`; a Turkish guide has no UI locale and no human reviewer yet |

## 2. Phase A — technical audit

Production could not be crawled from this session: the sandbox proxy refuses `labourmarket.ai` (`connect_rejected`). The audit below is from the repository, the guards and a local production build. A live crawl and Search Console read remain open (§7).

| Check | Result |
|---|---|
| robots.txt | Allows `/`, blocks `/api`, dashboard, onboarding, auth, cv, invite, oauth, design. Three sitemaps advertised on the apex. No change needed. |
| sitemap.xml | Apex only, per-locale with hreflang. Guides added once each (not per locale — other locales 404 by design). |
| hreflang | x-default = `/en` (U-2 fix already shipped). Guides use **content-language** keys (`ru`, `tr`), reciprocal, no x-default. |
| Canonical | Self-canonical on every guide. Known open defect **SEO-8** (job board page 2+ canonicalises to page 1) — fix is in draft #2984, blocked on an owner push approval; not touched here. |
| Unknown addresses | `/work-abroad/<x>` was depth 1 in the 404 map; raised to 2 so guides are not rewritten to the 404 page; deeper paths still 404. |
| Private data | `/cv` is `noindex` + robots-blocked; guides render no personal data and write nothing. |
| JobPosting | Not emitted (IDX-9 owner decision: only with reliable public fields). Guides do not emit JobPosting either. |
| Search Console / Bing / Yandex | No access from this session. |

No new indexing defect was found in the repository beyond the already-registered SEO-8 and IDX-9.

## 3. Phase B — what is built

Route: `/{locale}/work-abroad/{guide}` (`app/[locale]/(marketing)/work-abroad/[guide]/page.tsx`), statically generated, `dynamicParams = false`.

- **32 guides**: 10 country guides × 2 languages + 6 profession × country guides × 2 languages.
- Countries: DE, NL, BE, LU, AT, PL, SE, DK, FI, FR.
- Profession × country, only where a true country-specific note exists: electrician DE, electrician NL, plumber BE, construction DE, construction NL, welder SE.
- Each page: direct short answer (search/AI friendly), who may work there (EU rules + the country route + TPD note in RU / Ankara Agreement note in TR), what is needed on site, profession notes, the 7-step worker journey, CTA to free sign-up and to the real job board, FAQ (free, no guarantee, visibility, UI language), official sources with check date, related guides, disclaimer, review state.
- Copy: `content/worker-guides/countries.ts`, `content/worker-guides/professions.ts`. Logic: `lib/seo/worker-guides.ts`. Guard: `lib/seo/worker-guides.test.ts`.

### First RU / TR URLs

| Key | RU | TR |
|---|---|---|
| Germany | `/ru/work-abroad/rabota-v-germanii` | `/en/work-abroad/almanyada-calismak` |
| Netherlands | `/ru/work-abroad/rabota-v-niderlandah` | `/en/work-abroad/hollandada-calismak` |
| Belgium | `/ru/work-abroad/rabota-v-belgii` | `/en/work-abroad/belcikada-calismak` |
| Electrician DE | `/ru/work-abroad/rabota-elektrikom-v-germanii` | `/en/work-abroad/almanyada-elektrikci-olarak-calismak` |
| Electrician NL | `/ru/work-abroad/rabota-elektrikom-v-niderlandah` | `/en/work-abroad/hollandada-elektrikci-olarak-calismak` |
| Plumber BE | `/ru/work-abroad/rabota-santehnikom-v-belgii` | `/en/work-abroad/belcikada-tesisatci-olarak-calismak` |
| Construction DE | `/ru/work-abroad/rabota-stroitelem-v-germanii` | `/en/work-abroad/almanyada-insaat-isi` |
| Construction NL | `/ru/work-abroad/rabota-stroitelem-v-niderlandah` | `/en/work-abroad/hollandada-insaat-isi` |
| Welder SE | `/ru/work-abroad/rabota-svarshchikom-v-shvecii` | `/en/work-abroad/isvecte-kaynakci-olarak-calismak` |

(+ LU, AT, PL, SE, DK, FI, FR country guides in both languages.)

### Honesty rules the guard enforces

Unique title/description/H1/lede per page; SEO-7 length limits; ≥3 profession notes on a profession page; ≥2 official sources per country; RU in Cyrillic, TR in Latin; no "guarantee" in guide copy and the FAQ answers "no"; no pay figures or counts; no "demo"; the Turkish FAQ names the real UI languages and says there is no Turkish UI; hreflang reciprocal; sitemap and llms.txt list every guide by its real URL.

**Review state:** copy is AI-drafted from the cited official sources and **pending native review** (doctrine §7.4). Each page says so. Keyword volumes were not measured: the query list in the task is treated as hypotheses.

## 4. Distribution plan (prepared — nothing published)

No post, message or ad is sent without owner approval. Order, all free:

1. **Search engines** — submit `sitemap.xml` in Google Search Console, Bing Webmaster Tools (also feeds Copilot/ChatGPT search) and Yandex Webmaster (RU). IndexNow is already wired for answers (`lib/answer-engine/indexnow.ts`); extending it to guides is a follow-up.
2. **AI answer engines** — llms.txt lists guides; monthly hand panel per AEO-4 (10 questions per language, record named / cited URL / what was wrong).
3. **Communities (owner approval per channel)** — RU: Telegram channels and Facebook groups of Russian-speaking workers in DE/NL/BE; TR: Facebook groups "Almanya'da yaşayan Türkler", Hollanda/Belçika Türk toplulukları; UA (Phase C). Post only where group rules allow, as a member, with the guide that matches the group's country.
4. **Vocational schools and associations** — a factual one-pager per country linking the guide and the free CV; outreach is owner-gated.
5. **YouTube / TikTok / LinkedIn** — short "what you need to work as X in Y" scripts built from the same facts.

Ready-to-use post texts (owner approval required before any use):

> **RU:** Работаете в Европе и думаете о переезде в Германию, Нидерланды или Бельгию? Мы собрали, кто может работать в каждой стране, какие карты и сертификаты спрашивают на стройке и где официальные источники. Профиль работника и CV — бесплатно. {guide URL}

> **TR:** Avrupa'da yaşıyor ve Almanya, Hollanda ya da Belçika'da çalışmayı düşünüyor musunuz? Her ülkede kimlerin çalışabileceğini, şantiyede hangi kart ve sertifikaların istendiğini ve resmi kaynakları bir araya getirdik. İşçi profili ve CV ücretsizdir. {rehber URL}

Each shared link should carry `?utm_source={channel}&utm_medium=community&utm_campaign=guides_{lang}` so first-touch attribution separates channels.

## 5. Measurement

| Metric | Source today | Note |
|---|---|---|
| Impressions / clicks by page, country, language | Search Console, Bing WMT, Yandex WMT | Needs owner verification of the properties |
| Indexed vs excluded | Search Console coverage | — |
| Guide CTA clicks | funnel `cta_clicked` with `cta_id=guide_*`, `audience=workers_guide_{lang}` | Built in this change |
| Registrations / completed profiles / first journal entry | existing funnel and product tables | Join on first-touch attribution |
| AI referrals | referrer host (chatgpt.com, perplexity.ai, gemini, copilot) | Only where the referrer is sent |
| Cost per registration | €0 spend today | — |

Baseline: no guide existed before this change; every number starts at 0.

## 6. Owner decision required

The product gate (A-01) reports exactly ONE finding for the new route: `not_ai_controlled` on `/work-abroad/[guide]`. A pre-auth page for an anonymous search visitor is honestly not AI-controlled — the same category error already excused for `/`, `/jobs` and `/create-cv`. The other four readiness answers are excused by the owner-ruled A-14 `distinctSurface` block. The gate accepts this only through a scoped owner waiver bound to the PR; this change does not write its own waiver.

## 7. Next priorities

1. Owner waiver → merge → deploy → submit sitemap in GSC / Bing / Yandex.
2. Live crawl of all 32 URLs at 375 px (status, canonical, hreflang, JSON-LD) once production is reachable.
3. Native review of RU and TR copy.
4. Phase C: Ukrainian, Romanian (acquisition-only, under `/en` like TR) and Polish (routed `/pl`).
5. Expand profession × country combinations only where a real note exists and search data shows demand.
6. IndexNow for guides; AEO-4 panel.
