# Closed Beta GO Checkpoint v1

> **Type:** Docs-only go/no-go checkpoint for a limited, manually guided closed
> beta. Not a feature sprint. No app code, DB, migrations, RLS/RPC, billing,
> deploy, DNS, env, or PR #18 touched. No secrets recorded.
> **Date:** 2026-05-22. Author: Claude Code.

---

## 1. Executive summary

The full functional + interim-WOW sequence (PR #20–#28) is **merged on `main`
and code-verified**: connected work-identity path, deduped dashboard,
multi-direction profile (editable/removable, non-destructive saves), free-text-
first journal with optional work direction, contextual-fit-signals doctrine,
scouting-language cleanup, beta hardening, and the premium work-passport +
compact language selector.

**Decision: CONDITIONAL GO** — the product is code-ready for a tiny, founder-
guided closed beta, **conditional on two owner-side production verifications that
cannot be performed from this environment**: (a) confirm the production
deployment is Ready and built from the current `main` SHA, and (b) the
lead-capture P0.1 check — confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
Production and a real pilot request creates a row in Supabase `leads`. Until
those two are confirmed by the owner, do not invite external users.

> **Verification boundary (honesty):** production for `labourmarketai` is not
> publicly reachable from this environment (Vercel deploys are SSO-gated), and
> the production DB/env must not be touched. So **production smoke and the live
> lead row were NOT executed here** — they are owner actions. Everything below
> marked "code-verified" was confirmed against `main`; everything marked
> "owner action" is unverified from here and must be checked on production.

---

## 2. Production baseline

| Item | Value |
| --- | --- |
| **main SHA** | `e8e0fb1d40bace73832c2b3f86aa9936acac1d6d` (code-verified) |
| **Production SHA** | **Owner action** — not verifiable here; Vercel auto-deploys `main`, so the expected production SHA is `e8e0fb1` once the latest deploy is Ready. Owner to confirm in Vercel. |
| **Deployment status** | **Owner action** — confirm the latest Production deployment is **Ready** (per-PR Vercel preview checks were green through PR #28). |

---

## 3. PR sequence included (all merged into `main`, verified)

| PR | What | On main |
| --- | --- | --- |
| #20 | Premium post-onboarding hub, non-locking start, honest pilot path | ✓ `b0cf3f5` |
| #21 | Landing↔app visual continuity (journey rail) | ✓ `1376562` |
| #22 | Contextual Fit Signals / Score Doctrine (Constitution §10) | ✓ `abd4fd9` |
| #23 | Scouting / opportunity language cleanup | ✓ `ecbf8b6` |
| #25 | Public beta hardening (counters, locales, nav) | ✓ `89f853f` |
| #26 | Connected work-identity path (dedup dashboard, multi-direction, free-text journal) | ✓ `e4461cd` |
| #28 | Premium work-identity passport, capability groups, compact language selector | ✓ `e8e0fb1` |

(PR #24 = historical readiness audit, kept open as reference, superseded by #25/#26. PR #27 = WOW handoff spec, closed as superseded by #28.)

---

## 4. PR #18 status

**Open / draft / untouched.** Branch `feat/cc/pr10b-0014-hardening-implementation`,
not checked out or modified by any sprint. Journal security-hardening migration
(`0014`) remains a separate, frozen DB-hardening track — **out of scope** here.

---

## 5. Production smoke results

Live production smoke is an **owner action** (production not reachable here). The
following are **code-verified on `main` @ e8e0fb1** — they are the behaviours the
owner should confirm render correctly on the live deployment:

### Dashboard (`/lt/dashboard`)
- ✓ (code) Duplicate profile/skills/journal CTAs **consolidated** to two canonical
  cards — **Work identity** (→ profile) and **Work proof / Journal** (→ journal) —
  plus a single guided "Next move" and a Roles card. No separate profession/skills
  cards.

### Profile (`/lt/dashboard/profile`)
- ✓ (code) **Additional work directions** supported (`addWorkerDirection`), shown
  as capability-group cards; **removable** (`removeWorkerDirection`, non-primary
  only, with confirm).
- ✓ (code) **Skills from multiple directions persist** — the picker is fed all
  saved skills and the API validation allows the **union** of the worker's
  directions plus already-saved skills (saving one direction never drops another's;
  removing a direction never blocks a save). *Owner to confirm persistence across
  reload on production.*
- ✓ (code) Active editing direction is visually clear (ring + pulse + header).

### Journal (`/lt/dashboard/journal`)
- ✓ (code) **Free-text first** — "What did you do today?" is the first and only
  required field; lead copy says to write all quantities/units/time/location freely.
- ✓ (code) **Saves without a work direction** — `profession_id` nullable, notes is
  the only required field; entry stored freeform/hybrid.
- ✓ (code) **Optional work direction still works** — selecting a direction resolves
  to a profession; quantity/unit are an optional quick summary.

### Language selector
- ✓ (code) **Not the old long code row** — replaced by a compact globe + current-
  language button opening a popover of native names (current ✓, non-Tier-1 tagged
  preview). Verified live on the public landing header during PR #28.

---

## 6. Lead capture result

**Owner action — not executed here** (must not touch production DB/env; never
record secrets). Status per `docs/audits/PUBLIC-BETA-P0.1-LEAD-CAPTURE-CHECKLIST.md`:

- ✓ (code) `/api/leads` is **honest and fail-loud**: missing service key → HTTP
  503; insert error → 502; `ok:true` only after a real insert; UI shows an honest
  error, never a fake "submitted".
- ☐ (owner) `SUPABASE_SERVICE_ROLE_KEY` present in **Vercel Production** env.
- ☐ (owner) A real pilot request submitted on production.
- ☐ (owner) UI showed success (not error).
- ☐ (owner) Supabase `leads` table contains the new row (expected `source =
  "dashboard_pilot"`, `intent`, `status = "new"`; do not record the email/secrets).

**This is the single hard gate** between CONDITIONAL GO and GO.

---

## 7. Go / No-Go decision

**CONDITIONAL GO — limited, manually guided closed beta, only after the listed
owner actions.**

Becomes **GO** when the owner confirms: (1) Production deployment is Ready at
`main` SHA `e8e0fb1`; (2) a real pilot request creates a `leads` row (P0.1); and
(3) the dashboard/profile/journal/language smoke renders as code-verified above.
All other GO conditions already hold: no fake AI/matching/scoring/verification is
presented as real (governed concept only); PR #18 untouched; no DB/migration/
billing/deploy risk was introduced by this sequence.

**NO-GO** only if a smoke route is broken on production or the pilot request fails
to persist a lead.

---

## 8. Remaining limitations

- **Not an open public launch** — tiny, founder-guided closed beta only.
- **WOW visual standard is not final** — PR #28 is an accepted *interim* visual
  improvement layer; a stronger WOW/motion/identity experience is still required.
- **Full locale polish remains** — 8 non-primary locales use governed `[EN]`
  fallbacks for newer keys; only EN + LT are human-verified (Tier 1).
- **PR #18 DB hardening remains a separate, frozen track** (journal `0014`).
- **Future journal extraction is not implemented** — natural-language → reviewable
  structured work lines is documented only (`docs/JOURNAL_EXTRACTION_FUTURE.md`).
- **Scoring / matching / verification remain doctrine-only** (no engine);
  contextual fit signals per `docs/CONTEXTUAL_FIT_SIGNALS.md`, never a universal
  score.
- Authenticated dashboards could not be live-rendered in the build environment
  (no local Supabase); behaviours are code-verified, owner confirms on production.

---

## 9. Next recommended sprint

1. **Owner:** complete the two production verifications (deploy Ready @ `e8e0fb1`
   + P0.1 lead row), then flip this checkpoint to **GO** and invite the first
   guided cohort.
2. **Future WOW v2 sprint** (the real premium standard): stronger motion/identity
   experience beyond the PR #28 interim layer.
3. **Locale polish** for the 8 Tier-2 markets when entering them.
4. **PR #18** review/merge on its own DB-hardening track (separate, careful).
