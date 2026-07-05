# Trust Connect — Minimum Launch Audit (2026-07-05, PR11)

**Scope rule:** this is the LAUNCH-MINIMUM trust layer, not the full future
Trust Connect. Larger scope is documented at the end and stays deferred.

**Headline:** the trust primitives are real and already honesty-guarded on
every surface: worker skill "verified" is backed exclusively by
manager-confirmation; company "verified" is admin-only and unreachable by
any self-service RPC; workers only ever see demand through the
admin-verified approved route; unknown states stay unknown; no global
scores exist (guard-banned). PR11 adds ONE missing visible piece — the
worker-facing "Verified company" badge keyed on the real route signal —
plus a consolidated guard suite.

## Findings

| # | Item | Backing signal | Status |
|---|---|---|---|
| 1 | Verified company / approved route | `companies.verification_status='verified'` — reachable ONLY via `admin_set_company_verification` (SECURITY DEFINER, admin-gated, audit-logged, 20260604130000); self-service `save_company_setup*` can NEVER set it (checked in the RPC); worker RPC joins on it (Model A) and emits `route_status='approved_direct_partner'` | GREEN |
| 2 | Worker evidence labels | `worker_skills.verified` + `source` → three tiers on the CV: "✓ verified" fires ONLY on `verified \|\| manager_confirmed`; journal-backed and declared are distinct, never conflated | GREEN |
| 3 | manager-confirmed vs journal vs self-declared | carried through matching (`EvidenceTier` weights, §19 confirmed split), interest snapshots, scouting evidence line, CV cards | GREEN |
| 4 | Unknown trust states | availability/location/language/pay unknowns are `missingData` codes, never assumptions; opportunity fit returns "check/unknown", never a fake fit; scout view labels limited information honestly | GREEN |
| 5 | Risk flags | `deriveJobDemandRiskFlags` (pure, demand intake): flags derive from MISSING critical fields — "never an accusation"; codes only, honest | GREEN (existing) |
| 6 | No fake verified claims | fit-not-rating guard bans global-score identifiers; self-view player card deliberately shows no verified glow (silent-trust rule); FIFA marketing cards are §18-marked (PR9) | GREEN |
| 7 | Worker sees the company's trust state | company name appeared on opportunity cards (only possible via the verified route) but WITHOUT an explicit verified indicator | **FIXED — PR11**: "Verified company" badge keyed on `route_status === 'approved_direct_partner'` (the real signal, never copy) |
| 8 | Accommodation/transport context | accommodation enum flows intake → worker RPC whitelist → board display; transport exists only in the staffing preview engine (honest preview) | GREEN (launch scope) |

## What deliberately remains LATER (not launch blockers)
- Cross-party trust profiles / references / endorsements.
- Worker document verification UX beyond the consent scaffold.
- Company-side risk surfacing on scouting (risk flags currently serve the
  intake/recognition surface).
- Any aggregated trust metric — **remains forbidden** by §19 regardless of
  future scope.

## PR11 changes
1. `OpportunityNeed.routeStatus` passthrough (RPC → loader → card).
2. "Verified company" badge on the worker board — rendered ONLY on the
   whitelisted route signal.
3. Guard suite `lib/guards/trust-connect-minimum.test.ts` consolidating the
   trust pins (see file).

## Status
Trust Connect (launch minimum): **GREEN scoped** — future scope documented
above, none of it faked in the meantime.
