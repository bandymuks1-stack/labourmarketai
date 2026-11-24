# Company onboarding: automatic-first (correction)

Branch: `fix/cc/company-automatic-first-onboarding`.
Corrects the earlier framing where company use looked gated on manual admin
approval. **Company creation is automatic-first; admin review is the exception
layer, not the default gate.**

## What changed (manual-admin-first → automatic-first)
- **Before:** `save_company_setup` defaulted a company to `draft` and the primary
  button moved it to `pending_verification` ("submit a request, then wait for an
  admin"). Copy implied full company use required verification.
- **After:** saving a company makes it **usable immediately**. Status is derived
  from **automated checks**, not admin approval. Manual review is an **optional
  escalation**. `verified` stays a stronger admin/registry-only trust state.

## Status model now (additive migration `20260604140000`)
`verification_status` CHECK widened to:
`draft | active_unverified | needs_checks | pending_verification | unverified | verified`
- **active_unverified** (new DEFAULT) — created + automated checks passed; usable now, not identity-verified.
- **needs_checks** — a basic automated check failed; **still usable**, flagged to fix.
- **pending_verification** — set ONLY on explicit user escalation ("Request manual review", optional).
- **verified** — stronger trust; admin / real-registry only. Never automatic, never "user filled the form". The PR #250 trigger still makes promotion to `verified` admin-only on every path.
- `draft` / `unverified` kept for back-compat. Existing `draft` rows backfilled → `active_unverified`.

## What a user can do immediately (no admin action)
Create/start a company profile, set name + country + optional registration code /
address / website / contact email-phone / role, and use the company space — all
without waiting for admin review.

## Automated checks (`lib/company/company-checks.ts`, mirrored in the RPC)
name present · country present · registration code format (if provided) ·
website/domain format (if provided) · contact email format · requester role
present · optional email/website domain consistency (soft warn only). Any
required-or-malformed failure → `needs_checks` (still usable); else
`active_unverified`. **No fake official-registry verification** (no registry API
is connected).

## What still needs stronger verification
`verified` — a real check by an admin (exception/override) or a future connected
registry/API. Not required for basic company use.

## What admin review is now for (exception layer)
The `/dashboard/admin/company-verification` surface (PR #252 RPC) is repurposed
as **exception / escalation review**, not an approval queue: verify on request,
fix flagged `needs_checks`, or override a suspicious company. Copy updated
accordingly (LT/EN); empty state says nothing needs admin attention.

## Validation
typecheck ✅ · lint ✅ (0 errors) · build ✅ (both locales) · **2187 unit tests** ✅
(incl. `company-checks.test.ts` + `company-automatic-first.test.ts`). Local
signed-in browser smoke: a fresh user created a company → **`active_unverified`
(usable now)**; optional escalation → `pending_verification`. Screenshot:
`docs/evidence/company-automatic-first/01-lt-active-unverified-usable-now.png`.

## Migrations / prod
- Includes additive migration `20260604140000_company_automatic_first.sql`
  (widen CHECK, default `active_unverified`, backfill draft→active_unverified,
  `create or replace save_company_setup`). PR #250 trigger untouched; no new
  `companies` grant. **NOT applied to prod by the agent.**
- **Prod migration #252** (`20260604130000_admin_company_verification`) is **NOT
  superseded** — the admin RPC is still wanted as the exception/override tool.
  Recommended prod apply order after approval: `20260604130000` then
  `20260604140000` (both additive, idempotent).
