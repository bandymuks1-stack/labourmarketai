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

## Gates (local, this worktree)

See the PR body for the final lines: typecheck (web, mobile, client-core), lint, full vitest
suite, `check:i18n-debt`, build, launch smoke.
