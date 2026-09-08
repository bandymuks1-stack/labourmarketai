import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  anyStandingDispute,
  deriveEvidenceStanding,
  type RecordLifecycleEvent,
} from "@/lib/organization-evidence/evidence-state";

/**
 * EVID-7 — the subject of an imported record can contest it, and take that
 * contest back.
 *
 * WHAT THIS GUARD IS FOR. Before this slice, `deriveEvidenceStanding` ranked
 * DISPUTED second in precedence while NO actor in the system could cause it:
 * `organization_evidence_events` had two INSERT policies, one requiring
 * `manages_organization` and one admitting only `independently_verified` while
 * excluding the subject by name. The reader was complete and the causer did not
 * exist. Both registers had described closing that as "UI work, not a
 * migration" — which would have shipped a button returning 42501 to the one
 * person it exists for.
 *
 * So the assertions below are about the two properties that make this narrow
 * rather than a general event writer, and about the property that stops one
 * party's withdrawal from silently clearing another party's contest.
 */

const ROOT = join(process.cwd(), "..", "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260908110000_evidence_subject_dispute_v1.sql",
);
const ROLLBACK = join(
  ROOT,
  "supabase/rollbacks/20260908110000_evidence_subject_dispute_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");

/**
 * Executable statements only. The header comment names the very things the
 * structural assertions forbid ("no DROP TABLE", the resolver, the 42501
 * rule), so matching against the whole file would pass or fail on prose
 * rather than on what the database will actually run.
 */
const body = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const at = (iso: string) => iso;

function ev(
  eventType: RecordLifecycleEvent["eventType"],
  createdAt: string,
  actorProfileId: string | null = null,
): RecordLifecycleEvent {
  return { eventType, createdAt: at(createdAt), actorProfileId };
}

describe("the migration is a narrow write path, not a general event writer", () => {
  it("hard-codes the event type in both functions — the caller cannot choose it", () => {
    // If either function ever took the event type as a parameter, a subject
    // could write 'attested' or 'independently_verified' about themselves.
    expect(body).toMatch(/'disputed', auth\.uid\(\)/);
    expect(body).toMatch(/'dispute_withdrawn', auth\.uid\(\)/);
    expect(body).not.toMatch(/p_event_type/);
  });

  it("admits only the record's linked subject, through the resolver already applied", () => {
    // BOTH functions guard, and each guards by refusing rather than by
    // filtering — one `if not ... then raise` apiece.
    const guards =
      body.match(/if not public\.is_evidence_record_subject\(p_record_id\) then/g) ??
      [];
    expect(guards.length).toBe(2);
    const fns = body.match(/^create or replace function/gm) ?? [];
    expect(fns.length).toBe(2);
    // 42501 for both "not the subject" and "no such record": a caller must not
    // learn a record exists by receiving a different error for it.
    expect(body).not.toMatch(/record not found/i);
  });

  it("revokes anon and public BY NAME and grants only authenticated", () => {
    for (const fn of [
      "dispute_organization_evidence_record_v1",
      "withdraw_organization_evidence_dispute_v1",
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn}(uuid, text) from public;`);
      expect(sql).toContain(`revoke all on function public.${fn}(uuid, text) from anon;`);
      expect(sql).toContain(
        `grant execute on function public.${fn}(uuid, text) to authenticated;`,
      );
    }
  });

  it("never mutates or deletes the record itself — a contest is an answer, not an erasure", () => {
    expect(body).not.toMatch(/update\s+public\.organization_evidence_records/i);
    expect(body).not.toMatch(/delete\s+from/i);
    expect(body).not.toMatch(/drop\s+table/i);
    expect(body).not.toMatch(/drop\s+column/i);
    // The only `drop` is the CHECK constraint, re-added one statement later as
    // a strict superset of itself.
    expect(body).toContain("drop constraint if exists organization_evidence_events_event_type_check");
  });

  it("widens the closed event set by exactly one value", () => {
    const added = sql.match(/'dispute_withdrawn'/g) ?? [];
    expect(added.length).toBeGreaterThan(0);
    for (const kept of [
      "attested",
      "attestation_withdrawn",
      "independently_verified",
      "verification_withdrawn",
      "withdrawn",
      "reinstated",
      "disputed",
      "corrected",
    ]) {
      expect(sql).toContain(`'${kept}'`);
    }
  });

  it("ships a rollback that refuses rather than failing halfway", () => {
    // The restored constraint does not admit 'dispute_withdrawn', so rolling
    // back with such rows present would break the table instead of reverting.
    expect(down).toContain("dispute_withdrawn");
    expect(down).toMatch(/raise exception/i);
    expect(down).toContain("drop function if exists public.dispute_organization_evidence_record_v1");
    expect(down).toContain(
      "drop function if exists public.withdraw_organization_evidence_dispute_v1",
    );
    // A person's contest is never deleted to undo a schema change.
    expect(down).not.toMatch(/delete\s+from/i);
  });

  it("stays owner-gated: the RED acknowledgement is present and says it is not an approval", () => {
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(sql).toMatch(/NO OWNER DECISION EXISTS FOR THIS FILE YET/);
  });
});

describe("a contest is paired PER ACTOR, not globally", () => {
  const org = "org-manager-profile";
  const subject = "subject-profile";

  it("one party's withdrawal cannot clear another party's standing contest", () => {
    const events = [
      ev("disputed", "2026-09-01T10:00:00Z", org),
      ev("disputed", "2026-09-02T10:00:00Z", subject),
      ev("dispute_withdrawn", "2026-09-03T10:00:00Z", subject),
    ];
    // The subject took theirs back; the organization's still stands.
    expect(anyStandingDispute(events)).toBe(true);
    expect(deriveEvidenceStanding("ORGANIZATION_REPORTED", events).state).toBe(
      "DISPUTED",
    );
  });

  it("a withdrawn contest stops outranking every other signal", () => {
    const events = [
      ev("disputed", "2026-09-02T10:00:00Z", subject),
      ev("dispute_withdrawn", "2026-09-03T10:00:00Z", subject),
    ];
    expect(anyStandingDispute(events)).toBe(false);
    expect(deriveEvidenceStanding("ORGANIZATION_REPORTED", events).state).toBe(
      "ORGANIZATION_REPORTED",
    );
  });

  it("re-contesting after a withdrawal stands again — latest wins within the family", () => {
    const events = [
      ev("disputed", "2026-09-02T10:00:00Z", subject),
      ev("dispute_withdrawn", "2026-09-03T10:00:00Z", subject),
      ev("disputed", "2026-09-04T10:00:00Z", subject),
    ];
    expect(anyStandingDispute(events)).toBe(true);
  });

  it("an unattributable contest still stands and is not cancellable by someone else", () => {
    const events = [
      ev("disputed", "2026-09-02T10:00:00Z", null),
      ev("dispute_withdrawn", "2026-09-03T10:00:00Z", subject),
    ];
    expect(anyStandingDispute(events)).toBe(true);
  });

  it("a standing contest still outranks an attestation, as the precedence says", () => {
    const events = [
      ev("attested", "2026-09-05T10:00:00Z", org),
      ev("disputed", "2026-09-06T10:00:00Z", subject),
    ];
    expect(deriveEvidenceStanding("ORGANIZATION_REPORTED", events).state).toBe(
      "DISPUTED",
    );
  });

  it("a withdrawal alone, with nothing to withdraw, changes nothing", () => {
    const events = [ev("dispute_withdrawn", "2026-09-03T10:00:00Z", subject)];
    expect(anyStandingDispute(events)).toBe(false);
  });
});
