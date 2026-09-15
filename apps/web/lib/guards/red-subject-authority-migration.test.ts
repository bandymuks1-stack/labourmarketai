import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for
 * `supabase/migrations/20260915180000_subject_contest_and_clash_receipt.sql`
 * — RED #4 + RED #5, owner PREPARE approval 2026-09-15.
 *
 * WHAT THESE TESTS ARE AND ARE NOT.
 *
 * They are a STATIC reading of the prepared SQL. The migration has not been
 * applied to any database, so nothing here is runtime evidence that the
 * policy admits the right caller — only that the text says what the owner
 * approved. Runtime evidence needs a Supabase branch, which costs money and
 * is therefore owner-gated; the packet says so plainly rather than dressing
 * these assertions up as a dry run.
 *
 * What they DO protect is the boundary. Every clause below is one the owner
 * named as a condition of the approval, and each is the kind of clause a
 * later "small cleanup" deletes without noticing:
 *
 *   subject-only authority · no employer impersonation · no widening of
 *   unrelated INSERT/UPDATE/SELECT · immutable, auditable events ·
 *   provenance and actor identity retained · no way to alter the underlying
 *   employer evidence through the contest path · the clash override records
 *   the decision, it does not erase the clash.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const NAME = "20260915180000_subject_contest_and_clash_receipt";
const MIGRATION = `supabase/migrations/${NAME}.sql`;
const ROLLBACK = `supabase/rollbacks/${NAME}.down.sql`;

const sql = readFileSync(join(REPO_ROOT, MIGRATION), "utf-8");
/** Statements only — the commented rollback block must never satisfy a test. */
const statements = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("the migration is RED-class and reversible on its face", () => {
  it("carries the human-gate annotation", () => {
    expect(sql).toMatch(/^-- @human-gate-approved/m);
  });

  it("ships a rollback file", () => {
    expect(existsSync(join(REPO_ROOT, ROLLBACK))).toBe(true);
  });

  it("the rollback undoes both halves", () => {
    const down = readFileSync(join(REPO_ROOT, ROLLBACK), "utf-8");
    expect(down).toMatch(/drop function if exists public\.respond_booking_request_v4/);
    expect(down).toMatch(/drop policy if exists "organization_evidence_events_subject_dispute"/);
    expect(down).toMatch(/drop column if exists related_booking_request_id/);
  });

  it("the rollback deletes ONLY rows this migration made possible", () => {
    const down = readFileSync(join(REPO_ROOT, ROLLBACK), "utf-8");
    const deletes = [...down.matchAll(/^\s*delete from ([\s\S]*?);/gim)].map((m) => m[1]);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatch(/booking_request_events where event_type = 'clash_acknowledged'/);
  });
});

describe("RED #4 — the subject contest grants exactly one thing", () => {
  it("one new policy, INSERT only", () => {
    const created = [...statements.matchAll(/create policy\s+"([^"]+)"/gi)].map((m) => m[1]);
    expect(created).toEqual(["organization_evidence_events_subject_dispute"]);
    expect(statements).toMatch(/for insert/i);
  });

  it("creates no UPDATE or DELETE authority anywhere", () => {
    // Read the POLICY statements, not the whole file: `select ... for update`
    // is the row lock inside the RPC and has nothing to do with authority.
    const policies = [...statements.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    expect(policies).toHaveLength(1);
    for (const policy of policies) {
      expect(policy).toMatch(/for insert/i);
      expect(policy).not.toMatch(/for\s+update/i);
      expect(policy).not.toMatch(/for\s+delete/i);
      expect(policy).not.toMatch(/for\s+all/i);
    }
  });

  it("touches no other table's policies", () => {
    // The only policy statements in the file name the events table.
    const policyTargets = [...statements.matchAll(/on\s+public\.(\w+)\s*\n?\s*for insert/gi)].map(
      (m) => m[1],
    );
    expect(policyTargets).toEqual(["organization_evidence_events"]);
    // And nothing alters or drops an EXISTING policy.
    expect(statements).not.toMatch(/alter policy/i);
    expect(statements).not.toMatch(/drop policy/i);
  });

  it("is scoped to the one event type", () => {
    expect(statements).toMatch(/event_type = 'disputed'/);
  });

  it("pins the actor to the caller — provenance is retained", () => {
    expect(statements).toMatch(/actor_profile_id = auth\.uid\(\)/);
  });

  it("forbids employer impersonation", () => {
    // A contest is a PERSON's statement: no supplier role, no organisation.
    expect(statements).toMatch(/actor_role is null/);
    expect(statements).toMatch(/actor_organization_id is null/);
    // And the organisation's own manager cannot write through this door.
    expect(statements).toMatch(/not public\.manages_organization\(organization_id\)/);
  });

  it("cannot alter the underlying employer evidence", () => {
    // No replacement record may be proposed through the contest path …
    expect(statements).toMatch(/replacement_record_id is null/);
    // … and the records table is not written, altered or re-policied at all.
    expect(statements).not.toMatch(/insert into public\.organization_evidence_records/i);
    expect(statements).not.toMatch(/update public\.organization_evidence_records/i);
    expect(statements).not.toMatch(/alter table public\.organization_evidence_records/i);
  });

  it("requires a proven, LINKED subject relationship", () => {
    expect(statements).toMatch(/op\.linked_profile_id = auth\.uid\(\)/);
    expect(statements).toMatch(/op\.link_state = 'linked'/);
    // Same organisation on all three sides — no cross-tenant reach.
    expect(statements).toMatch(/r\.organization_id = organization_evidence_events\.organization_id/);
    expect(statements).toMatch(/op\.organization_id = organization_evidence_events\.organization_id/);
  });

  it("bounds the path to one dispute per record per actor", () => {
    expect(statements).toMatch(
      /create unique index[\s\S]*organization_evidence_events_one_dispute_per_actor/,
    );
  });
});

describe("RED #5 — the clash receipt records, it does not erase", () => {
  it("v3 is left in place and unchanged", () => {
    expect(statements).not.toMatch(/respond_booking_request_v3/);
    expect(statements).not.toMatch(/drop function[^\n]*respond_booking_request/i);
  });

  it("the refusal stays the default", () => {
    // Same message and same SQLSTATE as today when nothing was acknowledged.
    expect(statements).toMatch(/Conflicting accepted booking for these dates/);
    expect(statements).toMatch(/errcode = '23P01'/);
    expect(statements).toMatch(/coalesce\(p_acknowledge_clash, false\) is not true/);
  });

  it("only the addressed worker may respond — unchanged", () => {
    expect(statements).toMatch(/Only the addressed worker may respond/);
    expect(statements).toMatch(/errcode = '42501'/);
  });

  it("the receipt names its counterpart and is written per clash", () => {
    expect(statements).toMatch(/'clash_acknowledged'/);
    expect(statements).toMatch(/foreach v_clash in array v_clashes loop/);
    expect(statements).toMatch(/related_booking_request_id/);
  });

  it("the counterpart column cannot be borrowed by another event type", () => {
    expect(statements).toMatch(
      /check \(\(event_type = 'clash_acknowledged'\) = \(related_booking_request_id is not null\)\)/,
    );
  });

  it("NOTHING marks the clash resolved, hidden or deleted", () => {
    // The overlap is derived from booking_requests, which this function only
    // ever sets to the caller's own decision — there is no resolved flag, no
    // suppression column and no delete of the other booking.
    expect(statements).not.toMatch(/clash_resolved|conflict_resolved|suppress|ignore_conflict/i);
    expect(statements).not.toMatch(/delete from public\.booking_requests/i);
    const updates = [...statements.matchAll(/update public\.(\w+)/gi)].map((m) => m[1]);
    expect(updates).toEqual(["booking_requests"]);
    expect(statements).toMatch(/set status = p_decision, updated_at = now\(\)/);
  });

  it("the caller is told what they overrode", () => {
    expect(statements).toMatch(/'acknowledged_clashes'/);
  });

  it("execute is granted to authenticated only", () => {
    expect(statements).toMatch(
      /grant execute on function public\.respond_booking_request_v4\([^)]*\) to authenticated/,
    );
    // Word-bounded: `into public.…` is a table reference, not a grantee.
    expect(statements).not.toMatch(/\bto\s+anon\b/i);
    expect(statements).not.toMatch(/\bto\s+public\b/i);
  });
});

describe("the migration widens nothing else", () => {
  it("adds no permissive predicate", () => {
    expect(statements).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(statements).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it("touches no auth-schema object", () => {
    expect(statements).not.toMatch(/\bauth\.(users|identities|sessions|refresh_tokens)\b/i);
  });

  it("drops nothing but the CHECK it immediately re-adds, widened", () => {
    const drops = [...statements.matchAll(/drop constraint if exists (\w+)/gi)].map((m) => m[1]);
    expect(drops).toEqual(["booking_request_events_event_type_check"]);
    expect(statements).toMatch(/add constraint booking_request_events_event_type_check/);
  });
});
