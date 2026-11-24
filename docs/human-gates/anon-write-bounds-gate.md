# HUMAN GATE — anonymous write bounds v1

Migration: `supabase/migrations/20260829130000_anon_write_bounds_v1.sql`
Rollback:  `supabase/rollbacks/20260829130000_anon_write_bounds_v1.down.sql`
Proof:     `scripts/db-proof/anon-write-bounds.sh` (local stack, every probe as `anon`, rolled back)
Guard:     `apps/web/lib/guards/anon-write-bounds.test.ts`
PR:        #1339

## OWNER DECISION — GIVEN 2026-08-29

> "#1339 — APPROVED, with the invariant below.
>
> Approved as ANTI-ABUSE SAFETY CEILINGS, not product/business ceilings. The
> current numerical limits MUST NOT become architectural limits on
> LabourMarket.ai growth.
>
> Preserve: public acquisition; legitimate traffic spikes; advertising
> campaigns; employer demand campaigns; worker registrations; future
> partner/API traffic; horizontal scaling.
>
> If legitimate observed traffic approaches these ceilings, the architecture
> must support raising/configuring/scoping the limits rather than dropping
> legitimate product capability. Do not redesign the system now unless
> required for correctness.
>
> APPROVAL DOES NOT AUTHORIZE CAPABILITY REDUCTION. … UNDERSTAND → PROTECT →
> EXTEND → INTEGRATE → VERIFY. NEVER IMPROVE BY SHRINKING THE PRODUCT."

State: `APPROVED_APPLY_GRANTED`

## The ceilings, and why they are safety ceilings

| Surface | Bound | Observed production peak (2026-08-29) | Headroom |
|---|---|---|---|
| `pilot_events` anonymous rows | 300 / minute platform-wide | 15 / minute | 20× |
| `pilot_events` per profile | 120 / minute | 11 / minute | 10× |
| `pilot_events.metadata` | JSON object ≤ 4096 bytes | 212 bytes (app caps at 2048 text) | ~19× |
| `waitlist` signups | 60 / hour platform-wide | 3 / hour | 20× |
| public intakes | 30 / hour platform-wide | 1 / hour | 30× |
| public intakes per contact email | 3 / 24 h | 1 / day | 3× |
| exact resubmission | returns the earlier id within 24 h | — | idempotent, not a rejection |

What they do **not** touch: worker registrations (auth, not these tables),
authenticated employer intake (`customer_requests`, not the public RPC),
reads of any kind, partner/API paths (none exist yet), the anon INSERT grants
and policies (unchanged — the surfaces stay open), horizontal scaling (the
counters are database-side, so more instances do not multiply the budget the
way the in-memory windows did — they make it *consistent*).

## How the invariant is honoured (raise/configure/scope without shrinking)

- Every number is a plain literal in exactly one place — the migration's two
  trigger helpers and the RPC body. Raising one is a `CREATE OR REPLACE` of
  that function: no table, grant, policy or product code has to move.
- The app-side in-memory limiters remain the first, cheaper brake; the
  database ceilings sit behind them and only bite on a direct-API flood.
- Telemetry stays best-effort (a refused pilot event is logged and dropped,
  never shown); the intake form answers a refused submission with its
  existing honest *prepared, not persisted* state.
- Recorded follow-up (not done now, per "do not redesign"): when the first
  legitimate spike approaches a ceiling, move the numbers into a settings row
  read by the helpers, so raising them stops being a migration.

## The gap (Phase-1 audit C-2)

Three anonymous write paths exist by design; every bound on them lived in
the application layer — an in-memory, per-Vercel-instance sliding window —
and each is reachable directly with the public key, skipping every route.
`pilot_events.metadata` had no size bound at all. Proven on the local stack
as `anon`: 320/320 events, 70/70 waitlist rows, 40/40 intakes and a 6 KB
metadata blob all landed; with the migration the 300th / 60th / 30th is
refused with `P0004`, the blob and a junk email with `23514`, a resubmission
returns the same id, and the direct table INSERT is denied in both modes.

## What the marker covers, and nothing else

`create-trigger`, `security-definer-function`, `grant-or-revoke`,
`rls-to-anon` (the RPC's EXECUTE grant re-stated `to anon, authenticated`
exactly as 20260707120000 granted it). No drop, no policy change, no table
grant change, no auth-schema object.

## Apply procedure

Supabase MCP `apply_migration` only, executable SQL without the comment
header, after the PR is merged with `quality` + `migration-safety` green and
the baselines rebased to 247 behind #1338.

## Post-apply verification (required by the owner — safe, minimal)

Read-only: ledger row; the constraints, both triggers, both helpers and the
RPC exist with the expected definitions; grants by `has_function_privilege`
(anon EXECUTE on the RPC **true** — the surface stays open — and **false** on
the helpers). Inside ONE block that ends with RAISE (rolled back), as the
`anon` role: one normal legitimate intake submission succeeds; one oversized
`pilot_events.metadata` insert is refused with `23514`. No load, no mass
writes, no rollback experiment. Then an HTTP GET of the public acquisition
routes (`/lt`, `/lt/company-need`) returns 200.

## Rollback readiness

`supabase/rollbacks/20260829130000_anon_write_bounds_v1.down.sql` drops the
ceilings, CHECKs and index and restores the 20260707120000 function body
verbatim with its ACLs. It REOPENS the gap and says so. Emergency recovery only.
