# Owner review — Account space clarity + public copy cleanup v1

**Provisional owner review before deploy. Final verdict after deploy.**

## Problem summary
Public-facing buyer/account screens exposed internal implementation text
(`public.customers`, `save_customer_setup RPC`, `public.customers.contact_name`,
`Idempotentinis`, migration filenames, `RLS`, "production DB", "Supabase SQL
Editor / MCP apply_migration"), and the mobile profile-explanation card
collapsed into unreadable narrow columns with long paragraphs. Copy/UI only —
no DB, schema, or behaviour change.

## Removed technical text (now human copy)
| Surface | Before | After |
|---|---|---|
| buyer setup `formSubtitle` | "…persist to public.customers via the save_customer_setup RPC. Idempotent…" | **"These details are saved to your account. You can update them later."** |
| buyer `contactNameHelp` | "…Becomes public.customers.contact_name." | **"Required. 2–200 characters."** |
| buyer `newRequestSubtitle` | "…persist to public.customer_requests via save_customer_request. RLS limits…" | **"These details are saved to your account and visible only to you…"** |
| buyer migration-blocker × several | "Migration 0026… apply supabase/migrations/…sql via Supabase SQL Editor or MCP apply_migration" | **"This feature is not available yet. Please try later."** |
| company/agency worker-setup blockers | "…public.company_workers… + RLS via owns_company() + RPC invite_company_worker()" | **"…is being prepared and will be enabled later."** |
| messaging admin footnote | "…RLS scopes SELECT to participants OR is_admin()." | **"Admins only."** |

All buyer surfaces verified clean of `public.*`, `RPC`, `RLS`, `idempotent`,
`contact_name`, `apply_migration`, "production DB" (guard-enforced). Remaining
`RLS` mentions live only in **admin/superadmin telemetry** (internal operator
audience, out of public scope).

## Buyer private-person clarity
The buyer namespace contains **no** organization-setup wording
(`Jūsų organizacija` / `Įmonės duomenys` / `Registracijos kodas`) and **no**
`darbuotojas` (generic buyer copy already uses service/specialist/team), both
guard-enforced. So a private buyer is not pushed through company/org setup
language.

## Company-as-buyer vs employer/hiring
Unchanged and already separated by PR #202: employer hiring uses
"Sukurti darbo pasiūlymą / Create job request" (company workspace), distinct
from buyer "užklausa". This PR keeps buyer copy in request language and does not
route hiring through buyer setup copy.

## Mobile profile-explanation layout
`ProfileCvClarityCard` rows were a forced `flex items-baseline` row that
collapsed on phones. Now: **`flex flex-col` (stacked card) on mobile, `sm:flex-row`
at ≥640px** — each item shows label → short body → status badge, full-width and
readable. The five explanation bodies were shortened from 95–212 chars to short
single sentences (≤140 chars; guard-enforced), keeping the honesty intent (no
fake "Verified" badge claim).

## Affected routes (copy/layout only)
- `/[locale]/dashboard/buyer` (buyer setup + requests copy)
- `/[locale]/dashboard/profile`, `/[locale]/profile` (ProfileCvClarityCard)
- company/agency worker-setup blocker copy (shared message namespaces)

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1353 passed / 98 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/account-space-clarity-public-copy-cleanup-v1`
- Base main SHA: `f298b22`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
