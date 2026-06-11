# Translation — Safe Service Layer (Design + Audit, v1)

**Slice:** `translation-safe-service-layer-v1`
**Status:** **INTERFACE + DESIGN ONLY.** No external AI / translation provider is
connected to private messages. The default provider returns `unavailable`; the
worker keeps seeing the original. Connecting a real provider is a **separate,
owner-approved (RED) action** — external AI + private data.

> Order: this lands AFTER project scope (F4/F5) and BEFORE any real provider.
> Honesty rules: never fake translation, never overwrite the original, always
> show the original, honest "not prepared yet" state.

---

## 1. Provider audit (no connection made)

Common options (DeepL, Google Cloud Translation, Azure Translator, on-prem MT
like LibreTranslate/Argos). **None is wired here.** Each would send the
**private instruction text** to an external service — which is exactly the RED
condition ("external AI / private data") that requires the owner's explicit,
separate decision. So this slice ships only the safe interface; the choice and
connection are deferred.

Selection criteria to decide later (owner call): data-processing terms (no
training on our data), EU data residency, on-prem/self-host option for
sensitive sites, per-language quality, latency, cost.

---

## 2. The safe interface (`apps/web/lib/translation/translation-service.ts`)

- **`TranslationStatus`** lifecycle: `pending → unavailable → available`, plus
  `failed` and `needs_review`. (The DB check today allows the first three; a
  future additive migration widens it to include `failed` / `needs_review` when a
  provider is wired.)
- **`NO_PROVIDER_CONFIGURED`** — the only provider shipped: returns `unavailable`,
  `translatedText: null`. No external call.
- **`translateInstruction(req, provider?, opts?)`** enforces, for any future
  provider:
  - the **original is immutable** (`req.text` is never mutated, never overwritten);
  - **only `available` may carry text**; an empty result or one that just echoes
    the original is downgraded to **`needs_review`** — never a fake translation;
  - **bounded timeout** (default 8s) + **at most 2 retries**; any error → `failed`;
  - the caller persists `translated_text` **separately** from the original `body`
    (no silent overwrite).
- **`isTranslationProviderConfigured()`** — always `false` until approval.

---

## 3. No-silent-overwrite contract

The original message `body` is the source of truth and is written once, at send
time (F1). A translation, when it exists, is stored in `translated_text` with
`translation_status = 'available'` and the worker UI shows it **labelled** as an
automatic translation with the original one tap away. The `body` column is never
updated by the translation layer.

---

## 4. The gate to connect a real provider (RED — separate owner approval)

Before any real provider is wired to private messages, the owner must approve:
1. the specific provider + its data-processing terms (no training on our data);
2. secrets handled by env name only (never printed/committed);
3. the additive migration widening `translation_status` to `failed` /
   `needs_review`;
4. a kill switch / `isTranslationProviderConfigured` flag to disable instantly.

Until all four hold, `translateInstruction` returns `unavailable` and the product
states honestly that translation is not prepared yet.

---

## 5. What ships now
The safe interface module + this design + a guard
(`translation-service-honesty`) pinning: no external provider connected, original
never mutated, empty/echo → `needs_review` (no fake translation), default returns
`unavailable`. No migration, no UI change, no external call.

## 6. Next slice
Adaptive skill discovery (unknown skill = candidate signal, not error) → then
worker-first avatar / player-card + "My Work Space".
