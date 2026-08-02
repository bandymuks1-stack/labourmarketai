import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W12 SLICE 1 — ATOMIC DOUBLE-BOOKING PREVENTION GUARDS.
 *
 * The W12 read-only audit found a P0: all THREE public accept paths
 * (`respond_booking_request`, `_v2`, `_v3`) shared a race-prone
 * read → EXISTS-check → UPDATE body with no row lock, no worker-scoped
 * serialisation, no `status` guard on the UPDATE and no structural DB
 * invariant. Under READ COMMITTED two concurrent accepts of two DIFFERENT
 * overlapping bookings for the SAME worker both passed and both committed.
 *
 * These guards pin the fix so it cannot silently regress:
 *   1. ONE canonical atomic implementation (v3); v1 and v2 are thin
 *      delegators — no second race-prone body may reappear anywhere;
 *   2. the three locking/gating layers are present in the canonical body;
 *   3. the EXCLUDE constraint exists, is PARTIAL, and reproduces the product's
 *      EXISTING inclusive day-range semantics exactly;
 *   4. authorization is never delegated to the constraint;
 *   5. the scope stays booking-vs-booking (no leave/stage/travel creep);
 *   6. the app maps a conflict to the canonical terminal outcome and never
 *      leaves the accept CTA live after one.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const MIGRATION =
  "supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260802150000_booking_atomic_double_booking_v1.down.sql";

const migration = () => readRepo(MIGRATION);
const rollback = () => readRepo(ROLLBACK);

/** Migration SQL with `-- …` comment lines stripped, so header prose (which
 *  DISCUSSES the defect verbatim) can never satisfy a pin. */
const sql = () =>
  migration()
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

/** Body of one `create or replace function public.<name>(` … `$$;` block. */
function fnBody(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const end = source.indexOf("$$;", start);
  expect(end, `${name} must be terminated`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** The exact inclusive-range expression the product already uses. */
const RANGE_EXPR =
  /daterange\(\s*start_date\s*,\s*coalesce\(\s*expected_end_date\s*,\s*start_date\s*\)\s*,\s*'\[\]'\s*\)/i;

describe("W12 slice 1 — one canonical atomic accept path", () => {
  it("v1 and v2 are THIN DELEGATORS onto v3 (no second implementation)", () => {
    const v1 = fnBody(sql(), "respond_booking_request");
    const v2 = fnBody(sql(), "respond_booking_request_v2");
    for (const [name, body] of [
      ["v1", v1],
      ["v2", v2],
    ] as const) {
      expect(body, `${name} must delegate to v3`).toMatch(
        /public\.respond_booking_request_v3\(/,
      );
      // The delegator must not carry its own overlap check…
      expect(body, `${name} must not re-implement the overlap guard`).not.toMatch(
        /daterange\(/i,
      );
      // …nor its own status transition.
      expect(body, `${name} must not write booking_requests itself`).not.toMatch(
        /update\s+public\.booking_requests/i,
      );
      expect(body, `${name} must not write the event log itself`).not.toMatch(
        /insert\s+into\s+public\.booking_request_events/i,
      );
    }
  });

  it("NO race-prone unlocked read survives in any accept path", () => {
    // The defect signature: selecting the booking row WITHOUT `for update`.
    const bodies = [
      fnBody(sql(), "respond_booking_request"),
      fnBody(sql(), "respond_booking_request_v2"),
      fnBody(sql(), "respond_booking_request_v3"),
    ];
    for (const body of bodies) {
      const selectsBooking = /select\s+\*\s+into\s+br\s+from\s+public\.booking_requests/i.test(
        body,
      );
      if (selectsBooking) {
        expect(body, "a booking row read must be FOR UPDATE").toMatch(
          /select\s+\*\s+into\s+br[\s\S]{0,200}?for\s+update/i,
        );
      }
    }
  });

  it("only the three known public entry points exist", () => {
    const names = [...sql().matchAll(/create or replace function public\.(respond_booking_request\w*)\(/g)]
      .map((m) => m[1])
      .sort();
    expect(names).toEqual([
      "respond_booking_request",
      "respond_booking_request_v2",
      "respond_booking_request_v3",
    ]);
  });
});

describe("W12 slice 1 — the three atomicity layers", () => {
  const canonical = () => fnBody(sql(), "respond_booking_request_v3");

  it("L1: row lock, taken before the status gate", () => {
    const body = canonical();
    expect(body).toMatch(/from\s+public\.booking_requests\s+where\s+id\s*=\s*p_booking_id\s+for\s+update/i);
    const lockAt = body.search(/for\s+update/i);
    const gateAt = body.search(/br\.status\s+is\s+distinct\s+from\s+'proposed'/i);
    expect(lockAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(lockAt);
  });

  it("L1: the UPDATE itself is status-guarded and its row count is asserted", () => {
    const body = canonical();
    expect(body).toMatch(
      /update\s+public\.booking_requests[\s\S]*?where\s+id\s*=\s*br\.id\s*and\s+status\s*=\s*'proposed'/i,
    );
    expect(body).toMatch(/get\s+diagnostics\s+\w+\s*=\s*row_count/i);
  });

  it("L1: a repeated IDENTICAL decision is idempotent and writes no second event", () => {
    const body = canonical();
    // The idempotent branch must return BEFORE any event insert.
    const idemAt = body.search(/'idempotent'/);
    const insertAt = body.search(/insert\s+into\s+public\.booking_request_events/i);
    expect(idemAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(idemAt);
    expect(body).toMatch(/if\s+br\.status\s*=\s*p_decision\s+then/i);
  });

  it("L2: worker-scoped advisory lock, taken AFTER the row lock (one lock order)", () => {
    const body = canonical();
    expect(body).toMatch(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*br\.worker_id/i);
    const rowLockAt = body.search(/for\s+update/i);
    const advisoryAt = body.search(/pg_advisory_xact_lock/i);
    expect(advisoryAt).toBeGreaterThan(rowLockAt);
    // …and before the overlap probe it protects.
    const existsAt = body.search(/if\s+exists\s*\(/i);
    expect(existsAt).toBeGreaterThan(advisoryAt);
  });

  it("L3: a PARTIAL exclusion constraint makes the bad state unrepresentable", () => {
    const s = sql();
    expect(s).toMatch(/create extension if not exists btree_gist/i);
    expect(s).toMatch(/add constraint booking_requests_no_overlapping_accepted/i);
    expect(s).toMatch(/exclude using gist/i);
    expect(s).toMatch(/worker_id\s+with\s+=/i);
    expect(s).toMatch(/with\s+&&/i);
    // PARTIAL — only really-blocking rows participate, mirroring the RPC guard.
    expect(s).toMatch(
      /where\s*\(\s*status\s*=\s*'accepted'\s+and\s+start_date\s+is\s+not\s+null\s*\)/i,
    );
  });
});

describe("W12 slice 1 — interval semantics are UNCHANGED (day-level)", () => {
  it("the constraint reuses the product's exact inclusive range expression", () => {
    expect(sql()).toMatch(RANGE_EXPR);
    // '[]' — inclusive BOTH ends: touching bands conflict, adjacent do not.
    expect(sql()).toMatch(/'\[\]'/);
  });

  it("no time-of-day is introduced by this slice", () => {
    expect(sql()).not.toMatch(/tstzrange|timestamptz\s+range|start_time|end_time/i);
  });

  it("scope stays booking-vs-booking — no leave / stage / travel creep", () => {
    const s = sql();
    for (const out of ["worker_absences", "project_stages", "travel"]) {
      expect(s, `${out} is a LATER W12 slice`).not.toMatch(new RegExp(out, "i"));
    }
  });
});

describe("W12 slice 1 — authorization is never delegated to the constraint", () => {
  it("the canonical body still re-checks the addressed worker server-side", () => {
    const body = fnBody(sql(), "respond_booking_request_v3");
    expect(body).toMatch(/auth\.uid\(\)/);
    expect(body).toMatch(/from\s+public\.workers\s+w[\s\S]*?w\.profile_id\s*=\s*uid/i);
    expect(body).toMatch(/Only the addressed worker may respond/);
    expect(body).toMatch(/42501/);
    // The authz check must precede the write.
    const authzAt = body.search(/Only the addressed worker may respond/);
    const writeAt = body.search(/update\s+public\.booking_requests/i);
    expect(writeAt).toBeGreaterThan(authzAt);
  });

  it("every function stays SECURITY DEFINER with a pinned search_path", () => {
    const s = sql();
    const defs = s.match(/security definer\s+set search_path = public/gi) ?? [];
    expect(defs.length).toBe(3);
  });

  it("grants stay least-privilege: authenticated only, never public/anon", () => {
    const s = sql();
    expect((s.match(/grant execute on function public\.respond_booking_request\w*\([^)]*\) to authenticated;/gi) ?? []).length).toBe(3);
    expect(s).not.toMatch(/to\s+anon\s*;/i);
    expect(s).not.toMatch(/to\s+service_role\s*;/i);
    expect((s.match(/revoke all on function public\.respond_booking_request\w*\([^)]*\) from public;/gi) ?? []).length).toBe(3);
  });
});

describe("W12 slice 1 — migration governance", () => {
  it("ships a paired rollback that drops the constraint and restores all three bodies", () => {
    const r = rollback();
    expect(r).toMatch(/drop constraint if exists booking_requests_no_overlapping_accepted/i);
    for (const n of [
      "respond_booking_request_v3",
      "respond_booking_request_v2",
      "respond_booking_request",
    ]) {
      expect(r).toMatch(new RegExp(`create or replace function public\\.${n}\\(`));
    }
  });

  it("the rollback mutates NO booking data at statement level", () => {
    // Restoring the pre-slice FUNCTION BODIES legitimately contains
    // `update public.booking_requests` — that is the restored RPC's own code,
    // not a data migration. Strip every `$$ … $$` body, then assert the
    // rollback SCRIPT itself touches no booking row.
    const statements = rollback()
      .replace(/\$\$[\s\S]*?\$\$/g, " /* function body */ ")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/update\s+public\.booking_requests/i);
    expect(statements).not.toMatch(/delete\s+from\s+public\.booking_requests/i);
    expect(statements).not.toMatch(/truncate/i);
    // What it MAY do: drop the constraint and redefine functions.
    expect(statements).toMatch(/drop constraint if exists/i);
  });

  it("does NOT self-approve its own human gate", () => {
    // RED-class (SECURITY DEFINER + GRANT + constraint). The agent never adds
    // the marker to its own migration — the owner applies it.
    // Uses the EXACT anchored pattern from .github/scripts/migration-safety.mjs
    // (a comment line that *is* the annotation), so prose that merely mentions
    // the marker — as this migration's header deliberately does — is not a
    // false positive, and a real annotation cannot slip past.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(migration())).toBe(false);
  });

  it("declares a reversible rollback block (migration-safety rule b)", () => {
    expect(migration()).toMatch(/--[^\n]*\bROLLBACK\b/i);
  });
});

describe("W12 slice 1 — the app tells the truth about a conflict", () => {
  it("the server action still maps 23P01 to the canonical conflict result", () => {
    const actions = read("lib/booking/booking-actions.ts");
    expect(actions).toMatch(/const CONFLICT = "23P01"/);
    expect(actions).toMatch(/return \{ kind: "conflict" \}/);
  });

  it("the bookings surface makes a conflict terminal and re-reads server state", () => {
    const c = read("components/app/booking-respond-buttons.tsx");
    expect(c).toMatch(/res\.kind === "conflict"[\s\S]{0,400}?router\.refresh\(\)/);
    // Terminal render: an early return, so no accept CTA is left live.
    expect(c).toMatch(/if \(state\.kind === "conflict"\) \{[\s\S]{0,500}?return \(/);
    expect(c).toMatch(/data-testid="booking-conflict"/);
  });

  it("the chat offer card makes a conflict terminal and re-reads server state", () => {
    const c = read("components/app/conversation/worker-booking-action.tsx");
    expect(c).toMatch(/res\.code === "conflict"[\s\S]{0,400}?router\.refresh\(\)/);
    expect(c).toMatch(/if \(phase\.kind === "conflict"\) \{[\s\S]{0,500}?return \(/);
    expect(c).toMatch(/data-testid="conversation-booking-conflict"/);
    // A real conflict must never be dressed up as a generic error.
    expect(c).toMatch(/labels\.errorConflict/);
  });

  it("reuses EXISTING copy keys — this slice adds no message-catalogue debt", () => {
    const buttons = read("components/app/booking-respond-buttons.tsx");
    const card = read("components/app/conversation/worker-booking-action.tsx");
    expect(buttons).toMatch(/labels\.conflict/);
    expect(card).toMatch(/labels\.errorConflict/);
  });
});
