# Organisation profile creation — gap audit v1

Companion to `docs/policies/organization-profile-creation-policy-v1.md`. Maps what the current code actually supports against what the policy requires, and proposes the smallest safe implementation slices.

## Where users can currently switch / create roles

| Surface | What it does | Source |
|---|---|---|
| `/lt/auth/signup` rolePicker | Picks initial worker / company / agency / customer role at signup | `apps/web/components/app/signup-form.tsx` |
| `RoleSwitcher` in dashboard header | Switches `profiles.active_role` between worker / company / agency / customer | `apps/web/components/app/role-switcher.tsx` |
| `/lt/dashboard/account` "preview workspaces" | Lets the user enable additional role workspaces | `apps/web/app/[locale]/dashboard/account/page.tsx` |
| Admin promote scripts | `scripts/admin-promote.ts` / `admin-grant-superadmin.ts` — CLI, owner-only | not exposed in UI |

There is **no in-UI gate** today that asks for organisation data before switching into a company / agency / buyer workspace. The switch just flips `active_role`.

## Whether org profiles can be created too easily

**Yes — for the current pilot.** A tester can:
- Switch to `company` workspace via the role switcher.
- Land on `/dashboard/company`.
- Fill the pilot draft form (`pilot_drafts` row with `draft_type='company_request'`).
- Save.

Without ever providing: country, organisation legal name, registration code, correspondence address, representative role.

This is **intentional in v1** — the policy doc treats v1 as Tier 1 ("Pilot exploration"). The drafts are private; nothing reaches a real worker; nothing is invoiced. The risk is bounded.

But: the UI does NOT currently tell the user that. A pilot tester switching to `company` probably assumes the form they're filling is real-org material when it isn't, OR assumes it'll go somewhere when it stays private. Either confusion is fixable with a single bordered note above the draft form, not a new gate.

## Data model — what exists, what's missing

| Required for Tier 2 | Schema state | Notes |
|---|---|---|
| organisation country | `organizations.country` (text) | present; not enforced as NOT NULL |
| organisation legal name | `organizations.legal_name` (text) | present |
| display name | `organizations.display_name` (text) | present |
| organisation_type | `organizations.organization_type` (text) | present (`company` / `agency` / `customer` / etc.) |
| registration code | **NOT modeled** | needs migration |
| correspondence address | **NOT modeled** | needs migration (probably structured: country + city + line + postcode) |
| representative role | **NOT modeled** | needs migration on `engagement_contexts` or a sibling `organization_representatives` table |
| VAT id | **NOT modeled** | optional; same migration as above |
| multi-country support per org | partially — `organizations.country` is one row, would need a sibling table for cross-country presence | the schema supports MULTIPLE organisations per profile via `engagement_contexts.profile_id` + `organization_id`, but each organisation is single-country |
| multi-org per profile | yes — `engagement_contexts` is m:n profile × organisation | supports the multi-company case already |

## Multi-org / multi-country support

**Multi-org per profile:** supported today. A profile can hold engagement_contexts rows for multiple organisations across multiple types (worker, company representative, agency representative, etc.). The role switcher only surfaces the active workspace's organisation context though — there's no UI for "switch which company I'm representing right now" when the user holds two company-rep engagements.

**Multi-country per organisation:** NOT supported. `organizations.country` is one value per row. The cleanest extension is a sibling `organization_countries` table (org_id, country_code, role) so a single org can declare presence in LT + PL + LV.

## Proposed safe implementation slices

### A. Pre-role-switch copy warning (smallest)

Add a small bordered note above the company / agency / buyer workspace pages (and inside the role-switcher dropdown tooltip):

> LT: "Ši rolė skirta realiai organizacijai ar atstovaujamam klientui. Bandomajame etape juodraščiai privatūs ir realių pasekmių nesukelia. Rimtam naudojimui reikės įmonės duomenų (šalies, pavadinimo, registracijos kodo)."
>
> EN: "This role is for a real organisation or a client you represent. In pilot mode, drafts are private and have no real consequence. Serious use will require organisation details (country, name, registration code)."

Zero schema change. Zero new policy. Sets expectation. **Deferred to a follow-up PR** to keep this sprint's scope contained — this PR's audit is the gating doc; the copy lands in a focused 2-file PR.

### B. Migration `00XX_organization_rekvizitai` (medium)

Adds:
- `organizations.registration_code` (text, nullable, indexed)
- `organizations.correspondence_address` (jsonb — structured: `{country, city, line, postcode}`)
- `organizations.vat_id` (text, nullable)
- New table `organization_countries (organization_id, country_code, presence_kind)` for multi-country.

All nullable so existing rows survive. Additive only.

No UI in the same PR — the migration ships and lights up the data layer. UI gating is layer C.

### C. Tier-2 gate (large)

Once B lands, the UI starts asking for rekvizitai when the user attempts any "serious" action (which doesn't exist in v1 — there's no public posting, no formal request). The gate is the natural next slice once the marketplace surface starts to ship.

## What this PR ships

**Doc only.** The policy doc + this audit doc are the deliverables. Slices A / B / C are tracked here; each lands as its own focused PR.

## See also

- `docs/policies/organization-profile-creation-policy-v1.md`
- `docs/policies/account-and-role-model-v1.md`
- `apps/web/components/app/role-switcher.tsx`
- `apps/web/app/[locale]/dashboard/{company,agency,buyer}/page.tsx`
- `supabase/migrations/0013_work_journal_m1.sql` — `organizations` schema.
