# Organisation workspace foundation — implementation plan v1

Converts `docs/policies/organization-profile-creation-policy-v1.md` + `docs/audit/organization-profile-creation-gap-audit-v1.md` into a sequenced, owner-reviewable implementation roadmap. No code in this doc; the warning UX already shipped (PR #71 → `OrgTier1Warning` on company / agency / buyer pages).

## Five-phase plan

### P1 — Tier-1 warning + visible "details required later" status (shipped + lightly extended in PR B)

- ✅ Shipped in PR #71: `OrgTier1Warning` server component above the existing `pilotDisclaimer` on `/dashboard/company` / `/agency` / `/buyer`.
- 🔄 PR B (this sprint): no schema change; the warning copy already covers "organisation details will be required later".

### P2 — `organization_profiles` table + multi-org-per-personal-account

New migration `00XX_organization_profiles.sql`. Additive only.

```sql
create table if not exists public.organization_profiles (
  id                    uuid primary key default gen_random_uuid(),
  -- The personal account that represents this org. M:N via this table
  -- because one personal account can hold multiple org profiles.
  representative_id     uuid not null references public.profiles(id),
  -- The org-type lens the workspace currently surfaces.
  organization_type     text not null check (organization_type in ('company','agency','customer')),
  -- Tier-2 required fields (nullable at creation; mandatory at activation).
  country               text,
  legal_name            text,
  display_name          text,
  registration_code     text,
  correspondence_address jsonb,
  representative_role   text,
  -- Lifecycle status (P3-P5 statuses).
  verification_status   text not null default 'unverified'
                        check (verification_status in ('unverified','submitted','verified','rejected')),
  risk_status           text not null default 'normal'
                        check (risk_status in ('normal','needs_review','verification_required','temporarily_restricted','manually_confirmed_violation')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index ... -- representative_id, organization_type, verification_status
```

RLS:
- SELECT — representative OR admin.
- INSERT — representative_id = auth.uid().
- UPDATE — representative OR admin (for `updated_at` flips + verification submission).
- No DELETE policy — soft-archive via a future `archived_at` column if needed.

No service_role. Grants only to `authenticated`.

Multi-country: a sibling `organization_countries (organization_id, country_code, presence_kind)` table — keep separate so a single org can declare presence in LT + PL + LV without per-row duplication.

### P3 — Admin verification review surface

New admin page `/dashboard/admin/organizations` (read-only at first):
- Lists `organization_profiles` where `verification_status = 'submitted'`.
- Admin reviews rekvizitai inline (no external fetch in v1).
- Admin updates `verification_status` via a tiny RPC `admin_review_organization(id uuid, new_status text)` — security-definer, internal `is_admin()` check.

Reviewer never reads private profile / journal text — review is scoped to the org row itself.

### P4 — Role / workspace permissions gate

Once an org is in `verification_status='verified'`, the workspace surfaces unlock:
- Public-posting surface (when it ships; not in v1).
- Cross-tenant messaging beyond the support channel.
- Worker-engagement creation outside of "exploration" mode.

Until then, the workspace stays in Tier-1 (private drafts + support chat + own roster only). Gate is enforced both server-side (action-level check on `verification_status`) and visually (per-feature copy reading "Reikalinga organizacijos verifikacija").

### P5 — Billing / paid tier

Out of scope for this doc. Billing wiring lives in a separate workstream once verification flow is stable. **Doctrine: no billing without rekvizitai-verified org.**

## What this PR ships

- This planning doc.
- (Optional) a small static "Tier-2 required later" status card alongside the existing `OrgTier1Warning` to make the future expectation visible. The warning copy already covers this; the card would be additive. **Decision: defer — the warning is enough; an extra card is noise.**

## What this PR does NOT ship

- The `organization_profiles` migration (waits until owner reviews this plan + the policy doc together).
- Any verification UI.
- Any admin review surface.
- Any workspace permission gating beyond the existing role-switch.

## Refs

- `docs/policies/organization-profile-creation-policy-v1.md` (doctrine)
- `docs/audit/organization-profile-creation-gap-audit-v1.md` (technical gap audit)
- `apps/web/components/app/org-tier1-warning.tsx` (Tier-1 warning, shipped PR #71)
- `apps/web/app/[locale]/dashboard/{company,agency,buyer}/page.tsx` (workspace pages)
