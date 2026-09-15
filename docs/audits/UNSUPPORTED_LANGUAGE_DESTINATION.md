# `/sv` resolved. That was the problem.

**Date:** 2026-09-09
**Branch:** `fix/cc/unsupported-language-destination-v1`
**Base:** `e7acc283` (#1675)
**Reported by:** Agentai OS #678 (`3736206`), which composes the Swedish copy

## The finding

Measured against production 2026-09-09, redirects not followed:

```
/en 200 lang=en   /de 200 lang=de   /lt 200 lang=lt   /ru 200 lang=ru   /nl 200 lang=nl
/sv 307 -> /lt/sv
/pl 307 -> /lt/pl
/uk 307 -> /lt/uk
```

`/sv` does not 404. `localePrefix: "always"` means every real page lives under
`/{activeLocale}/`, so next-intl does not recognise `sv` as a locale, treats it
as an ordinary path and prefixes the default locale. The route **works** — it
delivers a Lithuanian page to a reader who just clicked Swedish copy, at a URL
containing their own language code.

That is worse than an English landing page. English is a language a Swedish
reader may not have; Lithuanian is one they certainly do not. And the URL is
evidence that we thought about them and got it wrong anyway.

**Nothing in this repo could have caught it.** No broken link, no 404, no
failing test, no missing translation warning — the redirect is next-intl
behaving exactly as configured. It was found from outside, by the system that
writes the Swedish posts.

## What I did NOT do, and why

The obvious repair is to activate `/sv`. Measured on this commit:

| catalog | leaf strings | `[EN] ` placeholders | |
|---|---:|---:|---|
| en / lt / ru / nl / de | 11,610 | 0 | **active** |
| sv.json | 4,741 | 2,475 (52.2%) | shell |
| pl.json | 4,741 | 2,472 (52.1%) | shell |
| da.json | 4,741 | 1,288 (27.2%) | shell |
| no.json | 4,741 | 2,475 (52.2%) | shell |
| et.json / lv.json | 4,741 | 2,544 (53.7%) | shell |
| uk.json | — | — | **does not exist** |

Activating `sv` today ships a product missing 59% of its strings, more than
half the remainder rendered in English inside a page claiming to be Swedish.
`lib/i18n/config.ts` already forbids exactly this — NL and DE were promoted
only after reaching full parity — and the owner instruction for this train says
it in the same words: *do not create fake "translated" locales with mostly
Lithuanian/English content; prefer a truthful supported-language destination.*

So the honest destination for a Swedish reader today is the English product.

## The change

One derived list, one pure function, one middleware step before `intl`.

`UNROUTED_LANGUAGE_CODES` is **computed**, from three categories the codebase
already declares:

1. UI-catalog locales that are not active — `lv et da no sv pl` (§2.4 shells)
2. Taxonomy/recognition-only — `fi` (we recognise Finnish text and ship Finnish
   taxonomy names, so `/fi` unambiguously names a language)
3. Acquisition-only — `uk` (Agentai composes Ukrainian worker copy; no catalog)

Because (1) is derived from `activeLocales`, **promoting a locale in `config.ts`
removes it from the redirect in the same edit.** A stale redirect for a locale
that has since gone live is impossible by construction, and a guard asserts it.

### Three decisions worth stating

**307, not 308.** A permanent redirect is cached by browsers and search engines
and outlives its reason. `/sv → /en` is true only until the Swedish catalog is
finished; a 308 issued today would still be sending Swedish readers to English
out of caches nobody can reach.

**English for every language, including Ukrainian.** The mechanically clever
answer for `uk` is `ru` — active, and lexically nearest. It is the wrong answer.
Many Ukrainian speakers actively reject being addressed in Russian, and a
redirect is a statement about the reader the product cannot take back. English
is neutral, complete, and reads as a claim about nobody.

**Only the first segment, and only known languages.** `/pricing` and
`/nonsense/deep` keep their existing behaviour and still 404 — turning every
unknown segment into an English redirect would hide real 404s behind a 307.
`/en/sv` and `/lt/pl-tools` are ordinary pages inside an active locale and are
untouched.

## Listing `uk` is not a language claim

`ACQUISITION_ONLY_LANGUAGES` is the record that we know the code names a
language, so the router stops reading it as a page. It is **not** a §2.4 catalog
addition, adds no route, no selector entry and no product claim of Ukrainian
support — and a guard asserts `uk` is absent from `locales`.

## What was already correct

`app/sitemap.ts` and `lib/seo/metadata.ts#hreflangAlternates` both iterate
`activeLocales`, so `sv`/`pl`/`uk` were never in the sitemap or hreflang.
The SEO layer was right; only the runtime redirect was wrong. Nothing there
needed changing and nothing there was changed.

## Tests

`lib/guards/unsupported-language-destination.test.ts` — 15 cases:

- the three acquisition languages reach `/en`, and **no** unrouted language can
  reach `/lt` (the exact production behaviour being replaced)
- deep links survive: `/sv/dashboard` → `/en/dashboard`
- every active locale, the root, ordinary unknown paths and second-segment
  matches are all untouched
- the list contains every inactive catalog locale and no active one
- the fallback is itself an active locale
- **a catalog that reaches parity fails the test**, with a message saying to
  activate it in `config.ts` rather than loosen the guard

## Not in scope, and why

The first-party supply emitter (P0-B..E of this train) is **already implemented**
in open draft PR **#1496** `feat/cc/first-party-supply-bridge-v1` — emitter,
vendored Agentai v1 contract, migration + rollback, consent purpose, privacy UI,
internal pull route, ABSENT/EMPTY/NONEMPTY semantics, 45 contract cases. It was
not rebuilt here. Its reconciliation state is recorded in the PR description of
this branch; this branch shares **zero files** with it.
