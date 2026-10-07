# Handoff to the VISUAL lane — "be findable by employers" at onboarding and on the work card

From: functional / connector lane, 2026-09-30.
Owner priority: **P0.** The marketplace's supply side is blocked.

## The measured problem (production, 2026-09-30)

| Stage | Real workers |
|---|---|
| Real supply accounts | 18 |
| Minimally matchable (profession + country + availability) | 6 |
| **Discoverable to employers** | **0** |

Why 0: `can_view_worker()` lets an employer see a worker only with a CURRENT
granted `profile_discoverability` consent in the `privacy_consent_events`
ledger, read through `worker_profile_discoverable()`. No real worker has one.

Today the consent is reachable only in two places:

- the full consent on `/dashboard/privacy`;
- a device-local, one-time "ask" after a work-card save
  (`components/app/employer-visibility-ask.tsx`). That ask only LINKS to the
  privacy screen, which is two hops away.

Five real workers saved a work card after #1855 (2026-09-23 → 29). None of
them granted. Onboarding never offers the choice at all.

## What to build (UI only — the backend is ready on `main` after this PR)

1. **Worker onboarding, last step** — render the consent IN PLACE:
   `<DiscoverabilityConsent source="onboarding" locale={locale} {...consent} />`
2. **Work card** — replace the link-only ask with the same component in
   place: `source="work_card"`.

Load `consent` exactly the way the chat already does. The server action
`loadEmployerVisibilityForChat()` (`lib/conversation/employer-visibility-chat.ts`)
returns `{ state, legal, preview, labels }` for the signed-in person. Extract
or reuse it; do not read the ledger another way.

## Hard rules (owner, 2026-09-30) — not negotiable in the design

- **Use ONLY the canonical action:** `grantProfileDiscoverability({ locale, source })` /
  `withdrawProfileDiscoverability()` → RPC `grant_profile_discoverability_consent` →
  `privacy_consent_events` (purpose `profile_discoverability`). **Never** write or
  read `profiles.consent_data_processing`; it is deprecated.
- **Voluntary and never pre-granted:** the component starts undecided. No
  pre-checked box, no auto-grant on save, no grant tied to finishing onboarding.
- **No dark patterns:** "Yes, show me to employers" and "Not now" are equal in
  size and weight. "Not now" writes nothing and must not block continuing.
- **Clear:** show WHO sees it and WHAT they see. The component already renders
  `legal` (recipients: registered companies and agencies on LabourMarket.ai;
  data categories) and `preview` (the exact fields an employer would see).
  Keep both visible, or one tap away inside the component; never hidden.
- **Revocable:** the "manage / withdraw" link to `/dashboard/privacy#visibility`
  stays.
- **Auditable:** `source` MUST be the surface's own value (`onboarding` or
  `work_card`). These are now in the closed set
  `DISCOVERABILITY_CONSENT_SOURCES`; any other value is recorded as the
  privacy screen, which would be false provenance.
- **Unknown ≠ off:** if the state read fails, render nothing. Never "you are
  not visible".
- **Only for a worker profile:** a company-only account is not asked.

## Measurement (already wired on the backend)

The ledger is the measure: `source` tells which door produced each grant. The
activation funnel (`marketplace.funnel.get`, admin/operator) counts
`DISCOVERABILITY_GRANTED` and `DISCOVERABLE` over REAL workers only. After you
ship, the owner reads the funnel. Nothing else needs to be emitted from the UI.

## Not in scope for you

Consent text, version, hash or the RPC. Changing any of them is a legal-text
change and needs its own owner decision.
