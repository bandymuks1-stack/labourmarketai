# Launch-Blocker Register v1 (Pre-Advertising)

**Date:** 2026-07-15 · **Baseline:** `origin/main` @ `603cae4a` · **Branch:** `feat/pre-advertising-launch-readiness-v1`

Single current register that supersedes contradictory older launch plans. Severity: **P0** = blocks the relevant advertising decision; **P1** = fix before scaling; **P2** = polish.

---

## A. Open-PR triage (do not merge as part of this sprint)

| PR | Title | Classification for advertising | Action |
|---|---|---|---|
| **#754** | pricing & payments architecture v2 (RED) | **owner decision — after ads** | Do NOT merge. Payments must stay off pre-launch. |
| **#740** | voice_journal_jobs draft migration | **useful after ads** | Do NOT apply; unrelated to launch. |
| **#687** | company-demand outreach pipeline (draft-only) | **useful after ads** | Draft-only outreach; not a launch blocker. Keep. |
| **#516** | Core Product Sprint Train v2 status doc | **superseded** by this register | Close or mark superseded (record why). |
| **#511** | Approval Authority Model readiness v1 | **superseded / owner decision** | Fold relevant items here; close with reason. |
| **#510** | Product Reality Train v1 plan | **superseded** by this register | Close with reason. |
| **#507** | visible product structure audit v1 | **superseded** — route audit re-run here (§D) | Close with reason; findings carried forward. |
| **#486** | full project reality audit v1 | **superseded** | Close with reason. |
| **#379** | AI run audit log + suggestion store (RED migration) | **useful after ads / owner** | Not a launch blocker. |

No PR was merged or closed by this session — closing/superseding is an owner action; reasons recorded above so nothing is closed silently.

---

## B. P0 — company-side blockers (block ANY company/employer ad)

### B1. Owner intake queue cannot read submitted needs (production outage)
- **What:** `company_need_public_intakes` was created (migration `20260707120000`) with RLS + no policies ("read via service role only") but **without a service-role grant**. The owner queue reads via service-role → `permission denied` → no intake is reviewable.
- **Trace:** persist `apps/web/lib/staffing/company-need-public-intake.ts:55,67,72` → RPC `submit_company_need_public_v1`; queue `apps/web/lib/admin/company-need-intakes.ts:155-167` (service-role read) → page `apps/web/app/[locale]/dashboard/admin/company-need-intakes/page.tsx`.
- **Fix (owner-gated):** apply `supabase/migrations/20260713190000_company_need_intake_service_grants.sql` to production (already drafted + human-gate-approved for merge; application is a separate owner gate). Rollback paired in `supabase/rollbacks/`.
- **Code fix landed this PR:** the outage is no longer masked (see B2).

### B2. Permission-denied masked as "being prepared" (FIXED in code this PR)
- **Was:** a 42501 permission-denied fell into the generic `error` kind and rendered the same "temporarily unavailable while its data is being prepared" copy as a missing table — hiding the outage.
- **Fix:** `apps/web/lib/admin/company-need-intakes.ts` now returns a distinct `grant-required` kind for 42501; the admin page renders an actionable operator banner naming migration `20260713190000`, and the generic `error` kind now shows the real Postgres error (superadmin-only). `apps/web/lib/admin/company-need-intake-actions.ts` handles `grant-required` explicitly.

### B3. Silent loss if the owner alert is unconfigured
- **What:** while B1 stands, the owner alert is the only signal; it is best-effort/env-gated/fire-and-forget with **no delivery indicator**. If unconfigured, a persisted request reaches no human.
- **Trace:** `apps/web/lib/notifications/telegram-owner-alerts.ts:196-209`; swallow points `:140-146` and `apps/web/lib/staffing/company-need-form-actions.ts:136-138`.
- **Fix:** apply B1 (queue becomes the durable source of truth) + add a delivery-status indicator (owner-gated DDL, §F1).

### B4. Un-contactable intakes (FIXED in code this PR)
- **Was:** contact fields optional → a stored need with no way to reach the company.
- **Fix:** `contact_email` now `required` on the public form (`apps/web/components/app/company-need-form.tsx`). Server-side enforcement (RPC CHECK) is queued as owner-gated DDL (§F1).

---

## C. P0 — measurement, supply, trust

### C1. No ad-funnel conversion measurement (FIXED in code this PR)
- **Was:** first-party `pilot_events` pipe existed but only on authenticated surfaces; public/ad surface had zero instrumentation and no UTM (query string was actively stripped).
- **Fix:** public funnel + first-touch UTM attribution + owner Acquisition-Funnel panel — see readiness report §5/§6. No schema change.

### C2. Insufficient worker supply for an employer promise (owner action)
- 23 workers, ~10 test/demo, 0 CVs, 0 completeness ≥60, 2 with skills, 2 with availability, 2 countries. **Employer ads would hit an empty marketplace.**
- **Action:** worker-acquisition campaign first; do not advertise employer demand until supply is real. Do not manufacture profiles.

### C3. Google consent-screen shows backend host (owner-only, external)
- Consent screen reads "to continue to `gorgitwvdzxbnaxhrsrw.supabase.co`". Not fixable in code. **Owner actions (§E).**

### C4. Legal binding wording owner/lawyer-gated
- Privacy/terms/data-protection pages honestly flag pending items: retention periods, named legal bases, TOMs, processor/DPA list, binding Terms/marketplace wording. **Owner/lawyer decision list (§E).**

---

## D. P1 / P2 — route, copy, mobile, a11y

- **P1 copy (FIXED this PR):** `/for-companies` showed "System ranks best matches / scored against your demand" — contradicts the product's "no ranking" doctrine. Softened in all 5 active locales (`messages/{lt,en,ru,nl,de}.json`, `companies.journey.steps[1]`).
- **P1 mobile (FIXED this PR):** language switcher hidden below 640px → now visible on every viewport (`components/layouts/site-nav.tsx`).
- **P1 mobile (remaining):** no hamburger/menu for secondary marketing nav below 1024px. Does not block the signup funnel. Fix before scaled spend.
- **P1 route (decision):** `/match-preview` is public + in the sitemap while its AI explanation is disabled in production. Decide: keep as a real lead tool (drop "preview"/AI framing) or remove from sitemap + demote (`apps/web/app/sitemap.ts:28`, `apps/web/lib/staffing/match-preview-actions.ts:104`).
- **P2 route:** demo/lab surfaces (`/dashboard/talent`, `/dashboard/visual-os`, `/dashboard/visual-os/agency`, `/design`) are superadmin/dev-gated and **not** ad-visitor reachable — no public hazard, but remove/flag-gate to prevent drift. Duplicate agency surface (`/dashboard/visual-os/agency`) should be folded in.
- **P2 copy:** two raw enums in worker-facing copy (onboarding country ISO codes `components/app/onboarding-wizard.tsx:232-236`; privacy context-type `app/[locale]/dashboard/privacy/page.tsx:140`); `placeholder="en, nl"` should move into a message key.
- **P2 a11y:** locale-menu focus trap (`components/marketing/locale-switcher.tsx`); onboarding "Back" touch target; per-field error summaries on the intake form.
- **Confirm:** Rexora credit link → `https://aiprocessautomation.eu` (owner-approved in-repo, guard-pinned). Confirm this is the intended destination.

---

## E. Owner action lists (external — not fixable in code)

### E1. Google OAuth / login branding
1. Google Cloud Console → OAuth consent screen: App name = `LabourMarket.ai`; logo; support + developer contact; App home `https://labourmarket.ai`; Privacy `…/legal/privacy`; Terms `…/legal/terms`; Authorized domains `labourmarket.ai`. Publish to Production.
2. Supabase → Auth → URL Configuration: Site URL `https://app.labourmarket.ai`; Redirect URLs `https://app.labourmarket.ai/**`, `https://labourmarket.ai/**` (+ Vercel prod alias if used).
3. (Recommended) Supabase custom auth domain `auth.labourmarket.ai` + DNS CNAME — the only way to remove the `supabase.co` host from the consent screen.
4. Google → Credentials → Authorized redirect URIs: `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback` (+ custom domain callback once live). Authorized JS origins: app + apex host.

### E2. Legal / lawyer decisions
Retention periods per data category · named legal bases + binding privacy text · processor list + DPAs (Supabase + any AI/transcription subprocessors) · binding Terms of Service · marketplace-rules final wording · optional first-party-telemetry disclosure line · decision on standalone data-deletion/account-closure/CV-processing pages.

---

## F. Owner-gated schema follow-ups (DDL SKETCH ONLY — NOT APPLIED, NOT A MIGRATION FILE)

These are described, not committed as migrations, to keep the migration-guard suite stable. Apply only via Supabase MCP `apply_migration` after explicit owner approval, additive + reversible, with a paired rollback.

### F1. Intake hardening
```sql
-- Transition audit (actor + timestamp + optional note) — no silent status loss.
alter table public.company_need_public_intakes
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid,        -- operator profile id
  add column if not exists operator_note text;
-- Alert delivery status indicator (owner can see whether an alert was sent).
alter table public.company_need_public_intakes
  add column if not exists alert_status text
    check (alert_status in ('pending','sent','failed'));
-- Actionability: require at least one contact channel (mirrors the form fix).
alter table public.company_need_public_intakes
  add constraint company_need_contactable
    check (coalesce(nullif(trim(contact_email),''), nullif(trim(contact_phone),'')) is not null)
    not valid;   -- validate after backfilling existing rows
-- Idempotency: dedup accidental double-submits within a short window
-- (app supplies a client-minted key; unique partial index over it).
```

### F2. Worker discovery column-restricted projection (privacy P1)
```sql
-- Move display_name / bio / headline / precise salary off the broadly-readable
-- workers row into a projection gated on an ACTIVE relationship (not mere
-- discovery consent), so employer discovery reads only:
--   id, region, availability, evidence_count, salary_band
-- mirroring what lib/scouting/scout-safe-view.ts already emits in the UI.
-- Implement as a security-barrier VIEW or column-level GRANTs; additive.
```

---

## G. Files changed this PR (code)

- `apps/web/lib/telemetry/attribution.ts` (new) · `funnel-events.ts` · `actions.ts`
- `apps/web/components/app/marketing-funnel-beacon.tsx` (new) · `tracked-cta.tsx` (new) · `company-need-form.tsx` · `signup-form.tsx` · `onboarding-wizard.tsx`
- `apps/web/components/marketing/page-hero.tsx`
- `apps/web/app/[locale]/(marketing)/layout.tsx`
- `apps/web/lib/admin/conversion-funnel.ts` (new) · `company-need-intakes.ts` · `company-need-intake-actions.ts`
- `apps/web/app/[locale]/dashboard/admin/telemetry/page.tsx` · `.../company-need-intakes/page.tsx`
- `apps/web/components/layouts/site-nav.tsx`
- `apps/web/messages/{lt,en,ru,nl,de}.json`
- `apps/web/lib/guards/activation-funnel-telemetry.test.ts`
- `docs/launch/*` (this register + readiness report + operating playbook)
