# First-Launch Final Smoke & Blocker Report — v1

**Date:** 2026-06-29
**Scope:** Final integration smoke for the autonomous first-launch train (PR3–PR12).
**Method:** Static reachability + honest-state review of the 11 canonical surfaces
against the production build route list and the connection bridges added this train.
No live authenticated mutation (owner runs the authenticated smoke).

> This is the **PR12 deliverable defined by the mandate §9 / §12** — "final
> route/mobile/reload smoke, exact remaining hard blockers only." The remaining
> open items are each either RED-class (billing — forbidden without DI approval),
> external (OAuth provider config), or an owner-gated flag/migration — none are
> a code change Claude Code may make unilaterally. Nothing below is docs
> substituting for a possible safe implementation.

---

## 1. Canonical surfaces — reachability & honest status

| # | Surface | Route | Status | Notes |
|---|---------|-------|--------|-------|
| 1 | Dashboard / Control Center | `/dashboard` | ✅ live | MyZone surfaces all canonical surfaces (PR3) |
| 2 | Diary / Journal | `/dashboard/journal` | ✅ live | Day-grouped, raw entries kept, honest hour sums (PR2) |
| 3 | Calendar / Planning / Bookings | `/dashboard/bookings` | ✅ live | Real proposals + planning-hub bridge to marketplace/map/diary (PR5) |
| 4 | Marketplace | `/dashboard/service-requests`, `/dashboard/services` | ✅ live | Request/offer loop + connections to matching/calendar/map/diary (PR6) |
| 5 | Company Control / Player Card | `/dashboard/company` | ✅ live | Roster + role assignment + bridge to calendar/map/evidence (PR7) |
| 6 | Professional CV / Profile | `/dashboard/profile`, `/cv` | ✅ live | Sendable print→PDF CV incl. real work history (PR4) |
| 7 | Skills Recognition / Evidence | profile text-first, `/dashboard/reports/evidence` | ✅ live | Cross-sector recognition; free labels persist, status self-declared (PR9) |
| 8 | Reports / Documents / Export | `/dashboard/documents`, `/cv`, `/dashboard/reports/evidence` | 🟡 partial-honest | PDF exports live; Excel/Word stated as preparing; doc storage flag off (PR10) |
| 9 | Map / Operating Layer | `/dashboard/market-map` | 🟡 partial-honest | Real own signals only; future layers honest-disabled; bridge to data surfaces (PR8) |
| 10 | Opportunities / Matching | `/dashboard/opportunities` | 🟡 partial-honest | Per-dimension fit, no score/AI; honest empty until visibility RPC; next-step bridge (PR11) |
| 11 | Account / Company / Admin / Manual Paid Pilot | `/dashboard/account`, `/dashboard/admin/billing` | 🟡 partial-honest | Manual pilot grant live; billing test/disabled only, live hard-blocked |

Legend: ✅ live = visibly working + persistent · 🟡 partial-honest = works with an
honest "preparing / empty / not-live-yet" state, no fake data, no fake buttons.

---

## 2. First-launch definition (§12) — testable today vs blocked

Testers (Donatas, Ramūnas) can today exercise: sign in/up, profile setup, diary
entry + day grouping, sendable CV/profile, calendar/bookings, marketplace
request/offer/order, company/player-card assignment, map operating picture,
cross-sector skills recognition + reload persistence, reports/documents/export
status, opportunity/matching cards, and the manual paid-pilot/admin path.

Reload persistence holds — every surface reads RLS-scoped data from the database
in server components; no client-only "saved" state.

---

## 3. Exact remaining HARD blockers (owner / external / RED only)

1. **OAuth consent branding** — *external P0.* The Google consent screen shows the
   provider-configured app name, not a code value. Fix is in the Google Cloud
   OAuth consent config (+ optional custom auth domain), not in this repo.
2. **Live billing** — *RED gate.* Payments are test/disabled and live is
   hard-blocked by design. Enabling live needs DI approval + env secrets +
   Stripe live config. Manual paid-pilot grant (admin) is the sanctioned path
   until then. Claude Code must not mutate billing.
3. **Documents storage layer** — *owner-gated flag.* `DOCUMENTS_READINESS_ENABLED`
   is off until the storage layer is reviewed; the Reports & exports hub and the
   PDF exports work regardless.
4. **Opportunities employer-visibility RPC + `service_offering_requests` migration**
   — *owner-applies.* Until applied, opportunities/marketplace show honest empty /
   needs-access states (no fake needs). Migration APPLY stays manual (DI).
5. **RU locale** — Tier-2 (AI-seeded, full key parity, pending human review);
   tagged preview in the language selector. LT/EN are Tier-1.

None of the above is a unilateral Claude Code change: each is RED, external, or
an owner-applied flag/migration.

---

## 4. Verdict

The compact first-launch product is **integrated and testable end-to-end** with
honest states throughout. It is **not** declared FIRST-LAUNCH READY here — that
call waits on the owner-run authenticated smoke and on the external OAuth consent
branding (blocker #1), which is the most visible tester-facing gap.
