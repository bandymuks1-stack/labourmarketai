# Timeline Cleanup — Owner Decision Register v1

**Status:** OPEN — every decision below blocks a specific later wave; none
blocks the audit PR or Timeline Source Expansion v1 (except OD-1 pre-checks,
answered inside that PR's evidence).

Format: each decision lists the options evaluated separately (owner correction
§5 — "Galimi sprendimai turi būti vertinami atskirai"), the evidence source in
`surface-reality-audit-v1.md`, and the default the agent will take **only
after owner signal**.

---

## OD-1 — Finance & invitations in the calendar (wave 2 pre-checks)

**Question:** may `finance_records` (due/paid dates, amounts) and
`invitations` (expiry/decision times) join `/dashboard/planning` as read-only
projected items?

Pre-checks the expansion PR must prove before merge (owner correction §4):
- every projected finance row has a meaningful date (`due_date` or `paid_at`);
- visibility identical to the finance surface's own RLS (creator / admin / company owner) — the calendar must never widen it;
- amounts: propose showing **title + status only** on calendar rows (no sums) — amount stays on `/dashboard/finance`; owner may allow amounts later;
- invitation rows: declined/expired/accepted render as past facts; a future `expires_at` renders as a deadline, never as a taken action.

**Blocked wave:** 2. **Default after signal:** implement with amounts hidden.

## OD-2 — PremiumHub per-card evaluation (wave 4)

Per owner correction §5, the hub must NOT be collapsed just for being big.
Facts per card (from audit §3, hub file `premium-hub-screen.tsx`):

| Card | Real action? | Duplicates another surface? | Status-only? | Needed for new-user activation? |
|---|---|---|---|---|
| Person card | YES — the ONE canonical availability/location/pay editor + `#work-card` anchor target | partially (profile page shows profile, but the editor lives HERE) | no | YES (first-use next action) |
| Company card | links only | duplicates `/dashboard/company` doors | mostly | no (org users land on company page) |
| Market map preview | link only | duplicates `/dashboard/market-map` | yes | no |
| Project card | links (projects, operations, gallery, handover) | duplicates `/dashboard/projects` doors | mostly | no |

Options to decide **separately**: (a) remove a specific card; (b) merge two
cards; (c) contextual display; (d) collapse secondary cards; (e) keep one
main card; (f) collapse whole section — last resort only.

**Agent recommendation:** keep the person card as-is (sole editor +
activation); evaluate (d) collapse-or-(a) remove for map preview; (c)
contextual for company/project cards (render only when the caller has a
company / manages projects — partially true already via `hasCompany`).
**Blocked wave:** 4.

## OD-3 — Pending-card dedup proof conditions (wave 3)

Removal of any pending-state duplicate is allowed only with proof that:
1. both places show the same object (chip vs card: same spine count source — TRUE by construction, `control-room-view-model` pins badge=spine);
2. neither place serves a different role/state (top slot promotes ONE; repeat block shows the others — different selection, same objects);
3. a clear action path remains after removal (chips link the same clearing surfaces);
4. no notification/action count silently drops (spine untouched).

**Agent recommendation:** collapse the repeat block into the status strip
(chips become the single non-promoted representation); keep the top slot.
**Blocked wave:** 3.

## OD-4 — DemandRequestsReadback split (wave 3/4)

Open requests (draft/submitted/in_review) are a live action loop; closed ones
(fulfilled/closed) are history. Decide: keep readback as-is; or keep open-loop
rows and move closed rows behind a link (calendar/history once
`customer_requests` becomes a projected source).
**Agent recommendation:** keep as-is until `customer_requests` is a calendar
source; then link closed history. **Blocked wave:** 3/4.

## OD-5 — "Išsami apžvalga" fold contents (wave 4)

Correction §5 requires answering: does the fold duplicate Planning? (NO — no
dated projection inside); duplicate PremiumHub? (org branch: hub itself is IN
the fold; worker branch: no); unique data? (YES — job recommendations, trust
cards, privacy status, readback); replaceable by one link? (partially);
needed for admin/org role? (org fold carries org-only tools).
**Agent recommendation:** keep the fold; no removal.

## OD-6 — MicroActivityFeed deletion (wave 6)

Evidence complete (audit §4): zero imports, no dynamic imports, no
stories/fixtures/flags; fabricated pool contained (guard-pinned). Deletion
scope: component file + `activity.feed.*` pool entries in
`content/placeholders.ts` + `live.activity` i18n keys (verify sole consumer at
deletion time).
**Decision needed:** approve deletion in Dead Surface Code Removal v1.

## OD-7 — Investor surface (separate track) — `REQUIRES_OWNER_DECISION`

No investor role/page exists. Correction §8: do NOT create a role in this
cleanup. Options: (a) separate investor presentation pack (docs, off-product);
(b) data-room export from owner analytics; (c) owner-only analytics page in
admin; (d) nothing now.
**Agent recommendation:** (a) first — a truthful deck grounded in the honesty
doctrine (BASIS labels, guard suite, real pilot metrics), produced as a draft
for owner wording. No product change.

## OD-8 — Role value copy binding (wave 5)

§6 gaps: worker promise line, individual-provider visibility, company
differentiator line. All three are copy-binding changes near EXISTING actions;
none may promise more than the function does (correction §7).
**Decision needed:** approve wave 5 scope; owner may want to word the lines.

## OD-9 — Timezone bucketing of journal facts (documentation only)

Journal facts bucket by UTC day; late-evening local entries can appear on the
neighbouring day. Options: keep UTC (deterministic); or bucket by a stored
local day at write time (needs migration — NOT proposed now).
**Agent recommendation:** keep UTC; revisit only if workers report confusion.
