import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { respondToRosterLink } from "@/lib/organization-evidence/import-core";

/**
 * THE SUBJECT'S REFUSAL / WITHDRAWAL OF A ROSTER LINK (20261005100000).
 *
 * Defect (integrated local QA, 2026-10-05): `UPDATE organization_people SET
 * linked_profile_id = NULL ... WHERE linked_profile_id = auth.uid()` fails with
 * 42501 for the SUBJECT, because PostgreSQL applies the SELECT policy
 * (`linked_profile_id = auth.uid() OR ...`) to the NEW row of an UPDATE and the
 * refusal makes the row stop naming the caller. Refuse and withdraw therefore go
 * through `respond_to_roster_link_v1`; accept stays the policy UPDATE.
 */
const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const NAME = "20261005100000_roster_link_subject_answer_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const body = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

type Call = { fn?: string; table?: string; args?: unknown; patch?: unknown };
function fakeClient(rpcData: unknown, calls: Call[]) {
  const chain = (table: string, patch: unknown) => {
    const q: Record<string, unknown> = {
      eq: () => q,
      select: async () => {
        calls.push({ table, patch });
        return { data: [{ id: "p1" }], error: null };
      },
    };
    return q;
  };
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: rpcData, error: null };
    },
    from: (table: string) => ({ update: (patch: unknown) => chain(table, patch) }),
  };
}

describe("migration: one narrow definer door, reversible", () => {
  it("carries the marker and the honest not-an-approval statement", () => {
    expect(sql).toMatch(/^-- @human-gate-approved$/m);
    expect(sql).toMatch(/NO OWNER APPROVAL EXISTS FOR THIS FILE YET/);
    expect(existsSync(join(ROOT, `supabase/rollbacks/${NAME}.down.sql`))).toBe(true);
  });

  it("re-derives the caller, acts on exactly the right state, never links anyone", () => {
    expect(body).toMatch(/v_uid\s+uuid := auth\.uid\(\)/);
    expect(body).toMatch(/op\.linked_profile_id = v_uid/);
    expect(body).toMatch(/p_decision = 'refuse'\s+and v_state <> 'link_proposed'/);
    expect(body).toMatch(/p_decision = 'withdraw' and v_state <> 'linked'/);
    expect(body).toMatch(/link_state\s+= 'unlinked'/);
    expect(body).not.toMatch(/link_state\s+= 'linked'/);
    expect(body).not.toMatch(/worker_confirmed/);
  });

  it("is not callable by anon or public; authenticated only", () => {
    expect(body).toMatch(/revoke all on function public\.respond_to_roster_link_v1\(uuid, text\) from public, anon;/);
    expect(body).toMatch(/grant execute on function public\.respond_to_roster_link_v1\(uuid, text\) to authenticated;/);
  });
});

describe("respondToRosterLink: refuse / withdraw use the door, accept stays the policy UPDATE", () => {
  const caller = (client: unknown) => ({ supabase: client, userId: "u1", locale: undefined }) as never;

  for (const decision of ["refuse", "withdraw"] as const) {
    it(`${decision}: calls respond_to_roster_link_v1, issues no UPDATE`, async () => {
      const calls: Call[] = [];
      const r = await respondToRosterLink(caller(fakeClient("unlinked", calls)), { personId: "p1", decision });
      expect(r).toEqual({ kind: "ok", linkState: "unlinked" });
      expect(calls).toEqual([{ fn: "respond_to_roster_link_v1", args: { p_person_id: "p1", p_decision: decision } }]);
    });

    it(`${decision}: 'not_found' from the door is not-found, never ok`, async () => {
      const calls: Call[] = [];
      const r = await respondToRosterLink(caller(fakeClient("not_found", calls)), { personId: "p1", decision });
      expect(r).toEqual({ kind: "not-found" });
    });
  }

  it("accept: a plain UPDATE to linked / worker_confirmed, no RPC", async () => {
    const calls: Call[] = [];
    const r = await respondToRosterLink(caller(fakeClient(null, calls)), { personId: "p1", decision: "accept" });
    expect(r).toEqual({ kind: "ok", linkState: "linked" });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("organization_people");
    expect(calls[0].patch).toMatchObject({ link_state: "linked", link_method: "worker_confirmed" });
  });

  it("a missing door (migration not applied) reports needs-migration", async () => {
    const client = { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) };
    const r = await respondToRosterLink(caller(client), { personId: "p1", decision: "refuse" });
    expect(r).toEqual({ kind: "needs-migration" });
  });
});
