# Localization / Language Launch Scope — Audit (2026-07-05, PR14)

**Owner question:** what does each language ACTUALLY get at launch, and can
the product ever claim more than that?

**Headline:** the language architecture was already tiered and mostly
honest — the gap was that the scope lived only in config comments and
doctrine prose, with no single declaration and no guard that cross-checks
the claims against routing, files on disk, the selector and the recognition
registry. PR14 adds `lib/i18n/launch-language-scope.ts` (the one honest
declaration) and `lib/guards/localization-launch-scope.test.ts` (the
cross-check), and flips the launch-board item to green_scoped.

## Classification (verified against the repo, not assumed)

| Tier | Languages | What it means | Verified by |
|---|---|---|---|
| UI ACTIVE | **lt, en, ru** (default lt) | routed, prerendered, selectable; full key parity + no empty values enforced | `routing.locales`, `i18n-lt-en-parity.test.ts` (lt↔en↔ru, base + all 6 namespace files) |
| — human-verified | en, lt (Tier 1) | RU is active but preview-tagged in the selector until DI promotes it (§7.4) | `tier1Locales` + selector tagging pin |
| UI CATALOG | 11 (§2.4): en lt lv et nl de da no sv pl ru | files exist and never shrink; the 8 non-active are `[EN]`-prefixed shells (debt ratchet da/de = 843), NOT routed, NOT selectable | file-presence pins; `i18n-debt.ts` |
| TAXONOMY + RECOGNITION | **12 = the 11 + FI** | skill/profession/journal names (6 files per locale) + offline text recognition (base lexicon lt/en/ru + 9 packs) | 6×12 taxonomy-file pins; `COVERED_RECOGNITION_LANGUAGES` set-equality; `offline-language-pack.test.ts` |

## FI decision (owner default applied)
FI stays **taxonomy + recognition ONLY** (doctrine §2.4 amendment,
2026-07-04). Guarded so it cannot drift: `fi` not in `locales` /
`activeLocales`, `messages/fi.json` must NOT exist, the locale switcher has
no Finnish entry, and active catalogs may not name Finnish as an interface
language. Promoting FI to a UI locale is an explicit owner decision
(full catalog + routing + parity guards) — recorded on the launch board as
the standing ownerDecision note.

## Fixes in PR14
1. Canonical scope module `lib/i18n/launch-language-scope.ts` (3 tiers,
   FI non-UI list, the six taxonomy name files).
2. Cross-check guard `localization-launch-scope.test.ts` (routing =
   active; selector/sitemap active-only; 11 catalog files exist, fi.json
   forbidden; 12×6 taxonomy files exist; recognition coverage set-equals
   the taxonomy tier; no Finnish-UI claim in active catalogs).
3. Stale comment fix: `lib/i18n/config.ts` pointed at a non-existent
   guard file (`i18n-active-locale-parity.test.ts`) — now points at the
   real one (`i18n-lt-en-parity.test.ts`), pinned so it cannot go stale
   again.
4. Launch board: `localization` → **green_scoped** citing this audit,
   keeping the FI ownerDecision note visible.

## What PR14 deliberately does NOT do
- No translation expansion (the 8 passive catalogs stay `[EN]` shells —
  honest, ratcheted, and invisible to routing).
- No FI promotion.
- No numeric public language claims (already banned by
  `public-market-entry.test.ts` from PR13).

## Status
Localization / language launch scope: **GREEN scoped** — lt/en/ru UI live
with enforced parity; 12-language taxonomy + offline recognition; every
scope claim CI-cross-checked; FI promotion parked as an explicit owner
decision.
