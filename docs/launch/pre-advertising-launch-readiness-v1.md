# Pre-Advertising Launch Readiness v1

**Date:** 2026-07-15
**Branch:** `feat/pre-advertising-launch-readiness-v1`
**Baseline:** `origin/main` @ `603cae4a` (#763, Eurostat bounded import)
**Production Supabase:** `gorgitwvdzxbnaxhrsrw` (labourmarket.ai, eu-west-1, ACTIVE_HEALTHY)
**Mode:** autonomous audit + safe code fixes; no advertising launched, no payments activated, no external source activated, no migration applied, no PR merged.

---

## 1. Executive decision

### `NOT_READY` for the full employer+worker paid-ads promise today.
### Conditional `READY_FOR_LIMITED_ADS` — **worker-acquisition-only** — once four owner actions land (see §12).

Paid advertising must not start merely because pages load. The complete chain
`ad → landing → identity path → action → stored conversion → owner receives it → follow-up possible → measurable`
does **not** yet hold end-to-end for the **company** side, and there is **not enough real worker supply** to honour an employer promise. This PR closes the biggest *code-level* gap (conversion measurement), unmasks a hidden production outage, and documents the exact owner-gated steps to reach a controlled limited launch.

**Why not `NOT_READY` outright:** the worker journey itself is sound (registration → onboarding → profile → opportunities works on mobile with no dead ends), privacy is fail-closed, and the remaining blockers are bounded and documented. A **worker-acquisition-only** campaign becomes safe after the four owner actions in §12 — the platform can honestly ask workers to build a profile even before employer demand is advertised.

**Why not `READY_FOR_LIMITED_ADS` now:** a live company request currently does **not** reach the owner queue (unapplied grant migration), employer supply is far below a credible pilot, and the Google consent screen shows a backend host. All three must be resolved by the owner before *any* company-side spend.

**Why not `READY_FOR_SCALED_ADS`:** conversion tracking is newly added and not yet production-proven; owner response operations have not been exercised on real ad traffic; supply is thin. This state is not awardable from code tests.

---

## 2. Audit methodology

- **Phase 1 live truth:** git (local/remote `main`, worktree), open-PR inventory (9 PRs), production Supabase identity + read-only table/row counts, migrations, feature/source state.
- **Seven parallel read-only source audits:** route inventory & product cleanup; analytics/UTM/conversion; company-intake end-to-end; privacy/RLS/contact-CV exposure; legal/trust/cookie/OAuth; i18n parity (LT/EN/RU/NL/DE); worker journey + mobile + a11y.
- **Production read-only supply audit:** PII-safe aggregate SQL over `workers`/`profiles`/`worker_skills`/`worker_documents`/`preferred_locations`/`customer_requests`/`company_need_public_intakes`/`pilot_events` — counts only, no names/emails surfaced.
- **Safe code fixes** for confirmed code-level blockers, then full validation (typecheck, lint, 10 010 tests, i18n/route/SEO checks, production build).
- **No** merge, no migration apply, no advertising, no payments, no new external source.

---

## 3. Tested journeys

| Journey | Result | Notes |
|---|---|---|
| Worker: land → role → signup → Google/email login → onboarding → CV → profile → dashboard → opportunities → logout → delete | **Works, no dead end** (mobile + desktop) | Every CTA resolves; honest empty states; requirements signalled up front; incomplete profiles degrade honestly. |
| Company: `/company-need` anon form → validation → DB persist → **admin queue** → owner alert → status transitions → contact | **Broken at "admin queue"** | Persist works; owner queue can't read rows in prod (P0 — grant migration unapplied); alert is best-effort; transitions lack actor/timestamp audit. |
| Agency | Reachable via company/agency identity; no over-promised functionality found. | Agency is a company type; no fake capability. |
| i18n (LT/EN/RU/NL/DE) | **Clean** — full parity, no raw keys, no Lithuanian leakage, natural copy. | Secondary locales (pl/lv/et/da/no/sv) are `[EN]` shells and not routed. |

Journey testing was source/markup-based and production-read-only; live authenticated browser walkthroughs were **not** run (no test accounts / to avoid writing test telemetry to production) — see §14 evidence gaps. An independent adversarial review of the diff was run and its two RISK findings were fixed (server-side email enforcement; preview-host funnel exclusion) — see §13.

---

## 4. Desktop / mobile evidence

- **Worker conversion spine is mobile-safe:** auth/onboarding forms collapse to one column; signup/login CTAs visible on every viewport; honest loading/disabled states.
- **P1 fixed in this PR:** the language switcher was hidden below 640px on all marketing pages — a real dead spot for LT/PL/RU worker ads landing on the wrong locale. Now visible on every viewport (`components/layouts/site-nav.tsx`).
- **P1 remaining (documented):** marketing secondary nav is hidden below 1024px with no hamburger menu. Does **not** block the signup funnel (CTA is always visible) but limits access to secondary marketing pages on phones. Recommended before scaled spend.
- **P2 remaining:** two raw enums in worker-facing copy (onboarding country ISO codes; privacy context-type), a few non-collapsing `grid-cols-2` form rows, dense 10–11px muted text (outdoor readability).

Live pixel screenshots were not captured (no dev-server browser run this session); the mobile switcher fix is a CSS visibility change validated by build + should be visually confirmed at launch.

---

## 5. Analytics event map (implemented this PR)

The product already had a **first-party, PII-safe** event pipe (`pilot_events`, migration 0020) but it **stopped at the login wall** — the public/ad surface had zero instrumentation and no UTM. This PR extends the SAME pipe outward. No third-party tracker, **no schema change**.

New public-funnel events (registry `lib/telemetry/funnel-events.ts`, emitted through the RLS-safe `recordTelemetryEvent`):

| Event | Where emitted |
|---|---|
| `landing_viewed` | `components/app/marketing-funnel-beacon.tsx` (mounted in marketing layout) |
| `cta_clicked` | `components/app/tracked-cta.tsx` via `components/marketing/page-hero.tsx` |
| `role_selected` | `components/app/onboarding-wizard.tsx` |
| `registration_started` | `components/app/signup-form.tsx` |
| `company_need_started` | `components/app/company-need-form.tsx` |
| `company_need_submitted` | `components/app/company-need-form.tsx` (only on real persist) |

PII safety: every event carries only bounded, allowlisted scalars (`lib/telemetry/actions.ts`). No CV, job-requirement text, phone, email, name, token, or personal identifier can reach an event — the server-side allowlist drops anything else and caps sizes.

Owner-visible measurement: an **Acquisition Funnel** panel was added to the existing superadmin telemetry page (`/dashboard/admin/telemetry`) — counts per stage, conversion rates (landing→CTA, landing→registration, onboarding completion, company-need submit), and a first-touch `utm_source` breakdown of conversions. Computed by `lib/admin/conversion-funnel.ts`. No new dashboard; extends the existing admin area. **Non-production (localhost/Vercel-preview) funnel events are stamped `preview_host` by `trackFunnel` and excluded from the owner funnel**, so dev/preview traffic can't inflate the numbers used to judge ad spend.

---

## 6. UTM attribution design (implemented this PR)

`lib/telemetry/attribution.ts` — first-touch capture:
- On first landing, reads `utm_source/medium/campaign/content/term`, referrer **host** (never full URL), and landing **path** (never query string) from `window.location`.
- Persists **once** in `localStorage` (`lm.attr.first`); the original source is **never overwritten** by a later visit.
- Every value is sanitized (control chars + `<`/`>` stripped, length-capped) and only ever stored/echoed as plain data — never evaluated, never placed into a URL.
- Attached to **conversion** events (`registration_started`, `company_need_submitted`) via the allowlisted metadata keys `utm_*`, `referrer_host`, `landing_path`. Also captured idempotently on a direct ad landing on `/auth/signup`.

The allowlist was widened by exactly these bounded keys plus `audience`/`cta_id`; a guard test forbids widening it to a raw query string or full referrer URL.

---

## 7. Company-intake delivery evidence

Traced chain (file:line in the register). Current production reality:
- **Persist:** anon `/company-need` form → SECURITY DEFINER RPC `submit_company_need_public_v1` → `company_need_public_intakes` (1 real row today, status `new`). Works.
- **Owner queue: BROKEN.** `listCompanyNeedIntakes` reads via service-role, but the table was created without a service-role grant; the fix migration `20260713190000` is a **DRAFT, not applied to production**. Every submitted need is invisible in the queue until it is applied. **P0.**
- **Masking fixed in this PR:** a permission-denied (42501) was rendered as the benign "being prepared" state, hiding the outage. Now surfaced as a distinct, actionable operator banner naming the exact migration (`lib/admin/company-need-intakes.ts`, admin page).
- **Alert:** best-effort owner notification; if unconfigured, a persisted request reaches no human while the queue is broken. Alert content is appropriately minimal (no sensitive excess).
- **Hardening in this PR:** contact email is now required on the public form **and enforced server-side** in `submitCompanyNeedAction` (a markup-only `required` is bypassable by no-JS clients/bots/direct calls), so a stored intake is always actionable.
- **Gaps documented as owner-gated:** status-transition audit (actor/timestamp/note), alert delivery-status indicator, submit idempotency — DDL sketch in the register (not applied).

---

## 8. Legal / trust matrix

| Page | Locales (LT/EN/RU/NL/DE) | Classification |
|---|---|---|
| legal-notice | all 5 | production-ready (entity structure correct: UAB „Nonstop Group" = controller/operator; Sp. z o.o. KRS 0001218752 = IP owner) |
| privacy | all 5 | owner-legal-review-required (content production-grade; pending: retention periods, named legal bases) |
| terms | all 5 | owner-legal-review-required (core truth present; binding text pending) |
| cookies | all 5 | production-ready (accurate: no third-party trackers; no consent banner needed as only strictly-necessary cookies exist) |
| data-protection | all 5 | owner-legal-review-required (pending: TOMs, processor/DPA list, retention) |
| data-access | all 5 | production-ready |
| marketplace-rules | all 5 | production-ready (binding wording owner-gated) |

No false endorsement, certification, or "trusted by" claims. Eurostat attribution correctly disclaims EU endorsement. Owner/lawyer decision list in the register.

---

## 9. Google-login branding result

- Sign-in is Supabase `signInWithOAuth({provider:"google"})`; redirect origin is the runtime host; the Supabase project URL is `gorgitwvdzxbnaxhrsrw.supabase.co` and there is **no custom auth domain**.
- **Consequence:** a cold ad visitor clicking "Continue with Google" sees "to continue to `gorgitwvdzxbnaxhrsrw.supabase.co`" — a trust/bounce risk on paid traffic. **P0 (owner-only, external — not fixable in code.)**
- In-app auth copy is already de-branded (guard-pinned); the only host leak is Google's own consent screen.
- Exact owner dashboard action list in the register (Google OAuth consent screen app name + authorized domains + privacy/terms links; Supabase Site/Redirect URLs; recommended custom auth domain `auth.labourmarket.ai`).

---

## 10. Contact / CV privacy result

**No confirmed P0 unauthorized personal-data exposure.** The boundary is fail-closed:
- Contact PII (email/phone/full_name) lives on `profiles` = self + admin only.
- Worker discovery is gated by `can_view_worker()` (self OR admin OR explicit GDPR discoverability consent OR active relationship); ships with zero consent rows → hidden by default.
- All storage reads are short-TTL signed URLs (no `getPublicUrl`); service-role clients are `server-only` and gated.
- **P1 (owner-gated follow-up):** for a discovery-consented worker, the broad `workers` row (incl. `display_name`/`bio`/`headline`/salary) is readable via the REST endpoint, bypassing the UI's anonymized preview. Not a live exposure today (≈0 discoverability consents). Fix = a column-restricted projection via a gated additive migration — DDL sketch in the register; not applied.

---

## 11. Worker-supply counts and launch-threshold result

Production read-only, PII-safe aggregates (no names/emails surfaced):

| Metric | Count (of 23 worker accounts) |
|---|---|
| Total worker accounts / profiles | 23 / 23 |
| Suspected test/demo accounts | ~10 |
| Usable name identity | 16 |
| Has role | 22 · onboarded 17 |
| Has location | 16 |
| Has availability set | **2** |
| Has skills | **2** |
| Has profession | 3 |
| Has CV document | **0** |
| Has avatar | 4 |
| Profile completeness ≥ 60 | **0** |
| Country spread | LT ×1, LV ×1 explicit; rest null |

Demand side: 17 `customer_requests` (13 company, 3 agency; 11 submitted) + 1 public intake (`new`). Billing tables all 0 (payments correctly inactive).

**Threshold verdict: INSUFFICIENT for employer advertising.** Benchmark (≈20–30 credible profiles with skills/availability/CV across several sectors, real target-market coverage) is not met — no completed profiles, no CVs, only 2 with skills/availability, ~half test/demo. **Recommendation: run a worker-acquisition campaign FIRST; do not advertise to employers until supply is real.** Do not manufacture profiles.

---

## 12. Advertising rollout recommendation (owner actions to reach limited ads)

**Recommended first audience:** workers (not employers). **Recommended markets:** LT (+ optionally PL) where any supply/interest exists. **Recommended bounds:** small daily cap, one campaign, one locale-prefixed landing per ad, worker-acquisition creative only, no employer promise.

To flip to `READY_FOR_LIMITED_ADS (worker-acquisition-only)`:
1. **Merge this PR** (conversion tracking + UTM + intake unmask + copy/mobile fixes).
2. **Apply migration `20260713190000_company_need_intake_service_grants.sql`** to production (restores the owner intake queue). Owner-gated.
3. **Configure Google OAuth branding** (owner dashboard steps in the register) so the consent screen reads LabourMarket.ai.
4. **Ensure every ad URL is locale-prefixed** and points at the app host (not a Vercel preview), so OAuth stays same-origin and locale is correct.

Do **not** run company/employer ads until worker supply reaches the benchmark AND the intake queue + alert are proven on real traffic.

---

## 13. Fixes made in this PR

- **Conversion measurement:** public acquisition funnel (`landing_viewed`, `cta_clicked`, `role_selected`, `registration_started`, `company_need_started`, `company_need_submitted`) on the existing first-party pipe; owner Acquisition-Funnel panel on the superadmin telemetry page. No schema change.
- **UTM first-touch attribution:** `lib/telemetry/attribution.ts` (sanitized, first-touch-wins, PII-safe), attached to conversion events; allowlist widened by bounded keys only.
- **Company-intake P0-3 unmask:** distinct `grant-required` (42501) result kind + actionable operator banner; real error surfaced instead of the masking "being prepared" copy.
- **Intake actionability:** contact email now required on the public form.
- **Copy honesty (5 locales):** removed the misleading "System ranks best matches / scored against your demand" claim on `/for-companies`, replaced with the product's honest "you choose, nothing is ranked or scored automatically."
- **Mobile P1:** language switcher visible on every viewport.
- Guard test extended in lockstep (`activation-funnel-telemetry.test.ts`): funnel contract, emitting surfaces, UTM allowlist bounds, first-touch-wins.
- **Adversarial-review fixes:** (1) server-side contact-email enforcement (markup `required` was bypassable); (2) `preview_host` stamping + exclusion so non-production traffic can't pollute the owner funnel.

---

## 14. Remaining blockers, owner-only decisions, evidence gaps

**P0 owner-gated (block company-side spend):**
- Apply grant migration `20260713190000` (intake owner queue).
- Insufficient worker supply for employer promise.
- Google consent-screen branding (owner dashboard/DNS).

**Owner/lawyer decisions:** retention periods, named legal bases, TOMs, processor/DPA list, binding Terms/marketplace wording; optional first-party-telemetry disclosure line in cookies/privacy copy; whether standalone data-deletion/CV-processing pages are needed.

**Owner-gated schema follow-ups (DDL sketch in register, NOT applied):** intake transition audit + delivery status + idempotency; worker discovery column-restricted projection (privacy P1).

**Evidence gaps (honestly reported):** live authenticated browser walkthroughs and pixel screenshots were not captured this session (no test accounts; avoided writing test telemetry to production). Static/type/test/build and production-read-only verification are complete and green. The new funnel events are validated by build + guard assertions but their end-to-end delivery to `pilot_events` should be confirmed once on a real (or seeded) session before relying on the numbers.

---

## 15. Validation results

- `pnpm typecheck` — **pass** (0 errors)
- `pnpm lint` — **pass** (0 errors, 0 warnings)
- `pnpm test` — **pass** (640 files, 10 010 tests)
- `check:i18n-debt` — **pass** (within baseline da=839, de/nl/ru=0)
- `check:primary-route-smoke` — **pass** (46 routes, 0 blocking)
- `check:public-seo-indexing` — **pass**
- `pnpm build` — **pass**

## 16. Confirmations

- No advertising launched. No Meta/Google/LinkedIn/TikTok campaign created or budget changed.
- No payment system / Stripe activated; billing PR #754 not merged.
- No additional external data source activated (Eurostat remains the only active source).
- No migration applied; no PR merged; no destructive DB action. Production accessed read-only only.
