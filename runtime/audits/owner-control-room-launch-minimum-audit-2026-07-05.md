# Owner Control Room — Launch Minimum Audit (2026-07-05, PR12)

**Owner question:** does the owner have one real place to see product state
and launch progress — with zero fake analytics?

**Headline:** a real superadmin control room already existed (KPI band with
real aggregate counts rendering "—" for unknowns, action queues, grouped
control areas — guarded by `admin-control-room.test.ts`). PR12 adds the
LAUNCH band: seven real launch signals and the 15-item launch board with
proof-cited statuses. No rebuild, no duplicate admin surface.

## Findings (pre-PR12)

| # | Item | Finding | Status |
|---|---|---|---|
| 1 | Owner/admin-only route | `/dashboard/admin` — `requireSuperadmin` on layout AND page (defense-in-depth) | GREEN |
| 2 | Real data | KPI band: profiles, incomplete profiles, companies, demand drafts, review queue, skill claims — all head-count reads via the admin-RLS client; unavailable → "—" | GREEN |
| 3 | Workers / companies / open demands counts | present partially (profiles ≠ workers; no submitted-demand count) | **ADDED — PR12** |
| 4 | Interest / acknowledgement signals | not visible anywhere for the owner | **ADDED — PR12** (interested / reviewed / contacted counts) |
| 5 | Recognition gaps | `recognition:unknown-report` script + admin matching workbench exist (operational, on-demand) | GREEN (existing tooling) |
| 6 | Location gaps | market-map admin surfaces + demand-location capture exist | GREEN (existing tooling) |
| 7 | Stuck first-use flows | pilot_events funnel + activation report script exist (owner-run) | GREEN (existing tooling; live dashboard deferred) |
| 8 | Launch board | did not exist | **ADDED — PR12** |
| 9 | Fake analytics risk | none found — every number is a real count or "—" | GREEN |

## The launch board contract (structural honesty)
`lib/admin/launch-board.ts` declares the 15 tree items. A status is a CLAIM:
- `green_scoped` REQUIRES a `proof` artifact (audit in `runtime/audits/` or
  guard in `lib/guards/`), and `owner-control-room.test.ts` FAILS CI if the
  cited file does not exist — fake launch readiness is structurally
  impossible;
- `yellow` must say what is pending (PR or owner decision);
- unscoped `green` is forbidden until the PR16 final audit;
- the board renders only inside the superadmin subtree (guard-pinned against
  marketing import).

## Launch signals (real reads, unknown honest)
workers · companies · verified companies · open (submitted) demands ·
interest new/reviewed/contacted — head-count queries via the caller's
admin-RLS client; any unavailable read → null → "—". No service role, no
fabricated numbers.

## Status
Internal AI / Control Room (launch minimum): **GREEN scoped**. Deferred (not
launch blockers): live first-use funnel dashboard (script-based today),
recognition-gap live tile (script/workbench today).
