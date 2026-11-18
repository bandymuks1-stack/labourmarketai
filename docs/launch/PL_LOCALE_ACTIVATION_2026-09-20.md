# PL — Polish UI locale activation (2026-09-20)

Owner approval (2026-09-20): "Activate PL as a LabourMarket.ai UI locale using the existing
canonical i18n architecture. Do not create a parallel locale/translation system. Preserve
LT/EN/RU and all existing locale, auth-return, canonical/hreflang and multilingual invariants.
This approval is limited to activating PL through the existing architecture and fixing the
observed PL campaign → EN landing drop-off."

## Why now

The first Polish-language campaign post for a live Swedish welder job
(`lm-job-welder-se-2026-09`, Facebook group PRACA - NORWEGIA - SZWECJA - DANIA - SKANDYNAWIA)
had to link `/en/jobs/<id>` because `/pl` was not routed: a Polish reader clicking a Polish
post landed on an English page. Measured 2026-09-20 in Agentai `site-locales.ts`
(`/pl → 307 → /lt/pl`) and again on production the same morning.

## What "through the existing architecture" meant (doctrine §2.4 / §2.5, `config.ts`)

A locale is promoted by ONE row in `apps/web/lib/i18n/config.ts` — but only after the base
catalog and the six taxonomy files reach full parity with EN, exactly as NL and DE were
activated on 2026-07-11. Measured before this work:

| Catalog | EN leaves | PL leaves | missing | `[EN]` markers |
|---|---|---|---|---|
| `messages/pl.json` | 12,397 | 4,659 | 7,755 | 2,357 |
| `pl/journal.json` | 784 | 235 | 550 | 68 |
| `pl/labour-market.json` | 137 | 122 | 15 | 43 |
| `pl/skill-names.json` | 161 | 161 | 0 | 131 |
| `pl/professions.json` | 49 | 49 | 0 | 36 |
| `pl/productivity-units.json` · `relationship-types.json` | 14 · 10 | 14 · 10 | 0 | 10 · 9 |

10,971 strings were translated from EN in this PR (AI-seeded, the same class as RU/NL/DE,
preview-tagged by the language selector until §7.4 human review). Rules applied: ICU
placeholders byte-identical; Polish plural forms `one / few / many / other` wherever EN had
`one / other`; placeholder-only and product-name strings kept identical to EN (90 reverted by a
post-pass); the marketplace inquiry noun is **zapytanie** (§19; legacy "zapotrzebowanie"
swept out of the inquiry namespaces); existing real Polish values were kept.

After the merge: 12,397 / 12,397 leaves, 0 missing, 0 extra (17 orphan keys removed),
0 `[EN]` markers, 7,854 values carry Polish diacritics.

## The one-row change and everything the existing architecture derives from it

- `activeLocales` += `pl` (`config.ts`); routing, middleware, `unsupported-language.ts`,
  sitemap, hreflang alternates, the locale switcher (preview-tagged: not Tier 1),
  `getSafeReturnPath` / auth `next=` handling and `locale-preference` are all derived from
  that set — no edit was needed in any of them.
- Typed per-locale source maps (`Record<ActiveLocale, …>`): 365 `pl` entries across 12 files
  (public job page + board + professions/skills/work-opportunities copy, SEO brand/page copy,
  OG locale `pl_PL`, command-finder labels/synonyms + speech `pl-PL`, answer-engine chrome,
  vacancy card).
- Answer engine: 45 Polish answer bodies (`content/answer-engine/*-answers.ts`), registry
  regenerated (`build-answer-registry.ts`: 550 questions gained `pl` = TRANSLATION_PENDING /
  NOT_READY).
- Chat-first intent router: Polish stems in the multilingual patterns + a `pl` row per intent in
  the parity matrix (see the PR body for the count).
- `@labourmarket/client-core` mirror + mobile catalogue (`apps/mobile/src/i18n/messages.ts`).
- Guards: parity guard now covers `pl`; untranslated-string ratchet baseline regenerated
  (`pl=154` accounted identical values, first screen 0); i18n-debt tracks `pl` with a ZERO
  baseline; launch-scope pin = lt/en/ru/nl/de/pl; 81 test files that iterate the active set
  widened; per-locale regex maps in 12 guards received a Polish row; `unsupported-language`
  test moved its "pl → en" case to `sv` (pl is routed now).
- Launch smoke: `scripts/nl-de-launch-smoke.ts` now runs `pl` as a full locale and requires
  `pl` in the hreflang set.

## Deliberately NOT done (owner items)

1. **Consent legal blocks** (`lib/privacy/consent-definitions.ts`, 3 purposes × 7 legal
   paragraphs) — legal text is owner wording (§4). `CONSENT_LOCALES` stays lt/en/ru/nl/de; a
   Polish member sees the consent explanation in **English** (fallback changed from `lt` to
   `en` in the three consent readers, same rule as `unsupported-language.ts`). Owner sentence
   to close: "Translate the three consent text blocks to PL" (then add `pl` to
   `CONSENT_LOCALES`).
2. **§7.4 human review** of the Polish catalog — the selector shows PL as preview until DI
   promotes it. Known style note from the translators: pre-existing Polish values sometimes use
   lower-case `ty/twój`; the new copy uses capitalised `Ty/Twój`.
3. Agentai `site-locales.ts` observation for `pl` is updated only after this PR is in
   production and `/pl` is measured to answer 200 in Polish (evidence-derived by design).

## Product-locale acceptance verification (owner contract, 2026-09-20 afternoon)

Owner ruling: acquisition language ≠ product UI locale; #1810 is a **product locale candidate**
judged against the normal acceptance contract, not by the campaign. Findings, in the order found:

| Item | Result | Evidence / fix |
|---|---|---|
| Catalog parity real | 12,397 / 12,397 base + 6 taxonomy files (13,515 leaves) — 0 missing, 0 extra | `i18n-lt-en-parity` |
| Translated vs inherited strings counted | translated 10,971 (11 chunks) + 51 taxonomy leftovers + 5 landing evidence + **347 array-held strings** (137 array items + 210 strings inside array objects: legal page sections, pricing features and concierge steps, marketing FAQ / steps on workers, companies, agencies, pages, services, about, work-abroad) that the first merge had copied from EN unchanged + 54 short words the normaliser had wrongly kept English ("No", "or", "To do", "up to …", "e.g." → "np."); inherited identical-to-EN after all passes: **100** in base (proper nouns, e-mail examples, units, plan/product names — the regenerated ratchet baseline), 137 in taxonomy files (country codes, units, "Estonia") | catalog scans in this PR |
| No user-facing internal keys | 0 `MISSING_MESSAGE` / raw keys on any walked `/pl` page; `i18n-key-resolution` green | browser walk |
| No broken interpolation | placeholder sets identical EN↔PL on all 13,515 leaves; 0 tag mismatches; every PL string parses as ICU (`intl-messageformat`) | catalog scan |
| Mixed PL/EN journeys | DEFECTS FOUND AND FIXED before the second commit: (a) `/pl/legal/privacy` and `/legal/terms` bodies 22 of 46 paragraphs English (array strings); (b) `/pl/pricing` flow steps English (array strings); (c) intake / company-need sector and work-type selects in **Lithuanian** — `lib/taxonomy/work-categories.ts` resolved every non-lt/en/ru locale to `lt` → 54 Polish labels added, resolver returns `pl`; (d) country names in the intake select English → taxonomy leftovers translated | this PR, second commit |
| Auth (signup / login) | SSR in Polish, CTAs keep `next=/pl/jobs/<id>?via=auth`; the client render must be re-verified on the rebuilt output (the first walk hit a stale-server chunk mismatch, not a locale error) | see gates below |
| Onboarding, worker profile, employer/org, opportunities, interest, messaging, calendar, journal, evidence/history, settings | **NOT walked as a member in this session** — no worker credentials are held here and creating accounts is out of bounds for the agent. Verified at catalog level only (parity, ICU, no EN leftovers, guards per surface). Needs the owner's QA account walk or the e2e suite run in `pl` before "fully supported". | open |
| Errors / empty states | `/pl/<unknown>` renders the Polish 404; the global error boundary is bilingual LT/EN by design (not localised, pre-existing) | browser walk |
| Transactional notices | notification e-mail + digest render from the catalog in the stored profile locale (pl now valid) — not exercised end-to-end | catalog only |
| SEO metadata | `<title>` / description Polish on every walked page; `og:locale` `pl_PL` | browser walk |
| Canonical / hreflang | canonical `https://labourmarket.ai/pl/...`; hreflang set lt,en,ru,nl,de,pl,x-default on marketing pages; job detail page has canonical only (pre-existing R-12) | HTML |
| Sitemap | 29 `/pl/` locs, 180 pl hreflang alternates — identical counts to every other active locale | `/sitemap.xml` |
| Locale detection / switching | `NEXT_LOCALE` cookie + profile locale accept `pl`; client-core device-locale resolver returns `pl` for `pl-PL`; switcher lists Polski (preview-tagged) | code + unit tests |
| Route stems | identical stem set between `/pl/*` and `/en/*` marketing links (9 = 9) | HTML |
| Legal / consent surfaces | public `/legal/*` pages Polish (draft banner kept); the three CONSENT definitions remain EN fallback — owner packet `docs/human-gates/pl-consent-texts-owner-review-v1.md` | this PR |
| Jobs board `/pl/jobs?profession=welder` | Polish chrome, 0 cards on the cold local DB read (R-B, not locale) | browser walk |

Pre-existing defects seen in passing (not PL-specific, not changed): NL/DE intake selects also fall
back to Lithuanian labels (`work-categories.ts`); the global error boundary is LT/EN only.

## Gates (local, this worktree)

See the PR body for the final lines: typecheck (web, mobile, client-core), lint, full vitest
suite, `check:i18n-debt`, build, launch smoke.
