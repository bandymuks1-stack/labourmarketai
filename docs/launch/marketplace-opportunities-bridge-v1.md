# Marketplace ↔ opportunities bridge v1 — decision + first bridge

Status: decision documented + lowest-risk bridge implemented
(quality-train PR D, 2026-07-06). Deeper bridges are enumerated as owner
decisions — NOT improvised here (audit §17.2 stop condition honoured).

## The canonical model (decided)

**Marketplace and opportunities are two entry points into ONE
supply/demand system — not two products.**

The code already treats them that way:

| Half | Entry surface | Data model | Publisher | Consumer |
|---|---|---|---|---|
| Supply (services) | `/dashboard/services` (publish), `/dashboard/service-requests` (discover/respond) | `service_offerings`, `service_offering_requests` | any provider, self-publish | any authenticated buyer |
| Demand (work) | `/dashboard#demand-intake` (post), `/dashboard/opportunities` (discover), `/dashboard/company/scouting` (review interest) | `customer_requests`, `demand_interest_signals` | company/agency, admin-gated (Model A) | workers |

Both halves converge on the SAME downstream spine:
conversation (§8.1 grants) → booking (`booking_requests`) → journal.

### Which labels remain

Per `docs/launch/concept-map-v1.md` (PR #642): **labels stay distinct.**
"Prekyvietė / Marketplace" = the services half; "Galimybės /
Opportunities" = the demand half. No route renames, no naming merge —
a merge is an owner decision (§17.2) and nothing forces it now.

## Connections that already existed (verified, not stale audit text)

- Accepted service request → conversation (`allowed_accepted_service_request`, PR #640).
- Demand interest → "contacted" → REAL conversation (`allowed_demand_interest`, `contactInterestedWorkerAction`, PR #640) — the audit's "contacted without contact" finding is FIXED; the worker is notified through the unread-thread spine signal once the company writes.
- Accepted booking → conversation (`allowed_accepted_booking`, PR #648).
- Opportunities page → next-step links to service-requests + bookings.
- Service-requests page → connections links to opportunities, bookings, map, journal.

## First bridge implemented in this PR (lowest risk)

The dashboard "Prekyvietė" hub showed ONLY the supply half — a worker
could reach the demand half only through the MyZone grid. The hub now
carries a third, worker-only card: **Darbo galimybės →
`/dashboard/opportunities`** (`dashboard-marketplace-opportunities`
testid, LT/EN/RU). Org roles keep their demand entry where it already
lives (the demand-intake section on their dashboard) — no duplicate.

Navigation only. No schema, no RLS, no new tables, no fake data.

## What must remain later (owner decisions — HARD STOP here)

1. **Accepted service request → booking bridge (§17.2).**
   `booking_requests` is anchored on `customer_requests` (demand) +
   `worker_id`; a service-request acceptance has neither. Bridging needs
   either a schema change (nullable anchor / second anchor type) or a
   product decision that service engagements never become bookings.
   Smallest owner decision: "should an accepted service request be
   bookable?" If yes → dedicated migration PR.
2. **Buyer pipeline merge (§17.3).** Should buyer `demand_requests` feed
   worker opportunities (merge into `customer_requests`) or stay an
   ops-only queue? Data-model decision, untouched here.
3. **Naming merge (§17.2).** Keep "Prekyvietė"+"Galimybės" as distinct
   labels (current, concept-map default) or adopt one umbrella name for
   the hub. Copy-only change once decided.
4. **Interest-signal seen-model** — an opportunities/contacted bell
   signal needs its own seen model (deferred in PR #647 for exactly this
   reason); design it with the notification-spine pattern if wanted.

## Guards

`lib/guards/marketplace-opportunities-bridge.test.ts` pins: the hub
carries all three entry cards (worker-gated third), the cross-links keep
pointing at real pages both ways, the new hub copy exists in LT/EN/RU,
and no phantom "order" vocabulary re-enters the new keys.
