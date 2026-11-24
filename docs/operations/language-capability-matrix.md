# LANGUAGE_CAPABILITY_MATRIX (V9 §16, updated V10 §23)

Basis: W4 audits (2026-08-13) + #1148 shipped fixes + ESCO DB measurement. Detection priority
(implemented, test-pinned): NEXT_LOCALE cookie → profiles.locale (login) → Accept-Language → lt.
No country→language inference exists anywhere; user choice always wins. COUNTRY != LANGUAGE honoured.

| LANGUAGE | UI COVERAGE | CHAT (scripted) | AI layer | EMAIL (invites) | LEGAL | NOTIFICATIONS | CRITICAL JOURNEYS | STATUS |
|---|---|---|---|---|---|---|---|---|
| lt | FULL (tier-1, human-verified) | YES | YES (when AI on) | YES (#1148) | FULL | YES | ALL | READY |
| en | FULL (tier-1) | YES | YES | YES | FULL | YES | ALL | READY |
| ru | FULL routed (AI-seeded, preview) | YES | YES | YES | FULL | YES | ALL; ESCO has NO Russian labels (taxonomy falls back) | READY (preview tier) |
| nl | FULL routed (preview) | YES | NO — silent EN fallback (moot: AI disabled) | YES | FULL | YES | ALL | READY (preview; AI gap documented) |
| de | FULL routed (preview) | YES | NO — same | YES | FULL | YES | ALL | READY (preview; AI gap documented) |
| lv,et,da,no,sv,pl | 65/171 namespaces (106 missing incl. dashboard/CV/journal/planning) | NO | NO | NO | NO (legal namespaces absent) | copy exists (#1143: 11 catalogs) | marketing/auth core only | NOT ROUTED — promotion = translation project, not config flip |
| fi | taxonomy/recognition only (deliberate) | NO | NO | NO | NO | NO | none | RECOGNITION ONLY |

V10 additions:
- VALUE ROUTER (intent + structurer + eligibility + corrections): systematic LT/EN/RU needles,
  opportunistic NL/DE; interpretation/option/refusal copy in all 5 routed locales.
- CHANNEL registry copy (listings/services hints, legal-check, refusals): 5 routed locales.

Supplementary facts:
- Auth emails (signup confirm / password reset) are Supabase GoTrue templates managed outside the
  repo — language behaviour UNKNOWN from code; owner console check needed. (CONFIG note.)
- Vacancy translation: no provider configured (€0); external Swedish ads shown in Swedish with
  LT/EN UI chrome; translation columns present, never filled — honest state.
- Voice transcription seam (whisper.cpp) unconfigured — CONFIGURATION_GATED.
- ESCO taxonomy DB carries 28 locales (all platform locales except ru) — labels available for
  every routed + catalog locale; typeahead locale behaviour per code audit (pending).

SAFE HIGH-VALUE GAPS (assessment):
1. AI locale cap (en/lt/ru → +nl/de): moot while AI_PROVIDER_MODE=disabled; implement at AI
   activation (single constant + prompt-locale variants; noted in code audit W4-B).
2. 6-locale promotion: NOT safe as a quick fix (106 namespaces × 6 locales of real translation;
   fake/machine-shell translations violate the no-fake-translations gate) → project, OWNER-planned.
3. GoTrue email template language: owner console item.
No further quick implementation is truthful this window → matrix is the deliverable.
