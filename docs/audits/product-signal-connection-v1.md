# Product Signal Connection v1 — audit (PR #480)

Date: 2026-06-19 · Branch: `feat/product-signal-connection-v1`.

## Gap found
Accepted suggestions (#478) persist to `profile_skill_claims` (self-declared), but My Work View (#476) and the Labour Market World Map (#475) read skill state from `getOwnCapabilities` → `worker_skills` only. So an accepted suggestion did NOT light up those surfaces.

## Decision (no DB)
Connect via a READ-ONLY UNION: surface `profile_skill_claims` (existing table, migration 0015, RLS owner-only) as self-declared skill signals in the shared computation. No schema/RLS/migration change — not a hard-stop.

## What this PR adds
- `lib/signals/connected-skill-signal.ts`:
  - pure `mergeSkillSignal(capabilityCounts, claimCount)` → one honest summary {confirmed, supported, selfDeclared (declared + claims), claims, total}. Claims are ALWAYS self-declared — never promoted to supported/confirmed.
  - `getOwnAcceptedClaimCount()` (RLS owner-only, reuses `listProfileSkillClaims`).
- Wired into **My Work View** (skills block + its internal world-zone calc) and the **Labour Market World Map** (skills/trust zones) so accepted suggestions appear honestly as self-declared.
- Tests `connected-skill-signal.test.ts` (4): claims add to self-declared, never inflate confirmed/supported, guards against negative/non-integer.

## How the product now connects
work text → recognition (#477) → review/accept (#478 → self-declared claim) → **My Work View skills block + World Map zones light up** (this PR, self-declared) → Evidence report (#479) already separates the ladder. Wording stays honest: self-declared / supported / confirmed; "possible fit signals" / "needs more data"; no fake matches.

## Remaining / future
- Work-need fit using skill requirements vs supported skills (richer, after a real need-skill model) — honest "needs more data" until then.
- Promoting a claim to a catalogued `worker_skill` (taxonomy mapping) would be a separate owner-gated change.

No DB/migration/Supabase/RLS/auth/billing/env. No fake data, no auto verification, no external AI, no old LABMA, no living/gyvas/живой.