# Landing-freeze baseline update — 2026-08-18 (Russian localization, OWNER DECISION U-15)

The landing freeze (`apps/web/lib/guards/landing-freeze.ts`) hashes the landing
render tree and the `lt/en/ru` landing i18n namespaces, and fails CI on any
drift. Regenerating its baseline is an owner-gated act. This file records one
such regeneration so it stays auditable and trivially revertible — same format
as `landing-freeze-baseline-update-2026-08-09.md`.

## The owner decision this executes

> **U-15 — RU LANDING: APPROVED to fix the Russian landing localization
> properly.**
>
> Russian is a first-class product language and must not expose raw English
> where a Russian translation is expected.
>
> Do NOT bypass, weaken or silently regenerate the landing-freeze
> guard/baseline. Use the repository's legitimate owner-ruling / governance
> mechanism, preserve the guard's purpose, translate the affected first-screen
> content properly, run the full relevant test suite, and browser-verify the
> Russian production surface after deployment.

This regeneration is therefore *inside* the "explicit, owner-approved landing
change" carve-out the guard's own header names. It is not a bypass: the guard
still hashes all 30 files and all 27 namespaces, still fails on any drift, and
was **not** modified.

## What moved

Exactly one hash, and nothing else:

```
ru.landing
  fb01011ee152463aed73ffc127122ab88f17be246d21371c7382abbb77990f53  (before)
  a51906fce7362ca8f12300020b3ea2e173a8dd31aecbb8998aecb72af265c706  (after)
```

- **0** of the 30 frozen files changed.
- **0** of the other 26 frozen namespaces changed — `lt.*` and `en.*` are
  byte-identical, and every other `ru.*` namespace (`ru.hero`, `ru.journey`,
  `ru.labourMarket`, `ru.live`, `ru.map`, `ru.draft`, …) is byte-identical.

Verify with
`git show <this commit> -- apps/web/lib/guards/landing-freeze-baseline.json`:
the diff is a single line.

## Why the namespace changed

41 values under `landing.hero.*` in `apps/web/messages/ru.json` were **raw
English**, not Russian. Measured against `en.json`, 44 of the 61 hero keys were
byte-identical to their English source; 41 of those are real strings and were
translated. The remaining 3 are legitimately identical and stay: the bare
numbers `14`, `3` and `7`.

Examples of what a Russian visitor saw on the product's first screen before
this change:

| key | was (rendered to RU users) |
|---|---|
| `landing.hero.decisionLabel` | `AI DECISION` |
| `landing.hero.reason.r1a` | `Checking open needs by role and region…` |
| `landing.hero.decision.d1.whyHere` | `Rotterdam and Eindhoven have more open needs than available electricians.` |
| `landing.hero.persistWhy` | `An account is only needed to save, apply or make contact — looking is free.` |

## Why this is not a landing redesign

The freeze exists so that no PR outside the landing plan changes **what the
landing renders**. This one changes only **which language it renders in**, for
one locale:

- **No component, layout, markup or style changed.** All 30 frozen files hash
  identically before and after.
- **No key was added or removed.** The key set is untouched; only values
  changed, and only inside `landing.hero.*`.
- **No meaning changed.** Each value is a translation of the already-approved
  English/Lithuanian source, not new copy. The Lithuanian version is the tone
  reference — the Russian follows it in content and register.
- **The ICU placeholder and separators are preserved** and pinned by tests:
  `{count}` survives in `landing.hero.reacting`, and `·` survives in
  `landing.hero.previewRole`.

## Translation decisions worth recording

- **Register: formal `вы`/`ваш`.** Chosen by measuring the existing catalogue
  rather than by preference — `ru.json` already uses `вы` 373× and `ваш` 561×,
  against `ты` 0× and `твой` 1×. The new strings match what is already there.
- **`{count}` pluralisation avoided, not faked.** Russian pluralises across
  three forms (1 сигнал / 2 сигнала / 5 сигналов) and the source string carries
  no ICU `plural` block. Rather than pick one form and be wrong for most
  counts, the string is phrased count-safe: `Рынок реагирует… сигналов:
  {count}`. Adding a real `plural` block would change the key's ICU shape, which
  is a source-side change and out of scope here.
- **The persona name is transliterated** — `Jonas P.` → `Йонас П.` — because
  the surrounding UI is Cyrillic and Russian convention transliterates personal
  names. This is why RU's remaining identical-value count is 3 while LT's is 4.

## Reverting

Restore the `before` hash above in
`apps/web/lib/guards/landing-freeze-baseline.json` and revert the `ru.json`
change in the same commit. The Russian landing returns to its previous bytes —
and to showing English on its first screen.

## Evidence

- New guard `apps/web/lib/guards/i18n-untranslated-ratchet.test.ts` — measures
  values byte-identical to English per locale, which is the class of defect
  every existing gate missed (`check:i18n-debt` counts *missing* keys and
  reported `ru=0` throughout). RU's baseline drops from 107 to 66 with this
  change.
- `landing-freeze.test.ts` — green against the regenerated baseline.
- Local full run with this change: 968 files / 16,003 tests green.
- Production browser verification of `https://labourmarket.ai/ru` is recorded
  in this file's companion section below once the deploy lands.
