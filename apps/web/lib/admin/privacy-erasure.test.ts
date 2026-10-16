import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readErasureResult } from "./privacy-erasure";

/**
 * GDPR erasure v2 (#856): the app side only reads the executor's verdict and
 * never guesses. The SQL behaviour (dry run rolls back, refusals, receipt,
 * append-only ledgers) was proven on a local Postgres 16 cluster — see the PR.
 */
describe("readErasureResult", () => {
  it("the rehearsal of the real open request's shape is executable", () => {
    const out = readErasureResult({
      executable: true,
      erased: false,
      dry_run: true,
      refusals: [],
      plan: [
        { table: "pilot_events", column: "profile_id", rows: 58, treatment: "delete_rows" },
        { table: "privacy_consent_events", column: "user_id", rows: 2, treatment: "detach_ledger", guard: "privacy_consent_events_append_only" },
      ],
    });
    expect(out.kind).toBe("executable");
    if (out.kind === "executable") expect(out.plan.map((p) => p.rows)).toEqual([58, 2]);
  });

  it("a refusal keeps table, column, rows, reason and the storage object list", () => {
    const out = readErasureResult({
      executable: false,
      erased: false,
      refusals: [
        { table: "conversations", column: "created_by", rows: 1, reason: "REASSIGN on a NOT NULL column" },
        { table: "storage.objects", rows: 1, reason: "files first", objects: [{ bucket: "profile-avatars", name: "a/b.png" }] },
      ],
      plan: [],
    });
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.refusals[0]).toMatchObject({ table: "conversations", column: "created_by", rows: 1 });
    expect(out.refusals[1].objects).toEqual([{ bucket: "profile-avatars", name: "a/b.png" }]);
  });

  it("erased only when the executor says so; unknown shapes fail closed", () => {
    expect(readErasureResult({ erased: true, plan: [] }).kind).toBe("erased");
    expect(readErasureResult(null).kind).toBe("error");
    expect(readErasureResult({ executable: false, refusals: [] }).kind).toBe("error");
    expect(readErasureResult("yes").kind).toBe("error");
  });
});

describe("the erasure path is gated", () => {
  const src = readFileSync(join(__dirname, "privacy-erasure.ts"), "utf8");
  it("superadmin first, approved request + typed word before any real run", () => {
    expect(src).toMatch(/if \(!\(await isSuperadmin\(\)\)\) return \{ kind: "not-superadmin" \};/);
    expect(src).toMatch(/if \(confirmation\.trim\(\) !== ERASURE_CONFIRMATION_WORD\) return \{ kind: "bad-confirmation" \};/);
    expect(src).toMatch(/if \(target\.status !== "approved"\) return \{ kind: "not-approved" \};/);
  });
  it("every real run is preceded by a rehearsal; only storage refusals are resolved automatically", () => {
    const exec = src.slice(src.indexOf("export async function executeErasure"));
    expect(exec.indexOf("callExecutor(target, requestId, true)")).toBeLessThan(exec.indexOf("callExecutor(target, requestId, false)"));
    expect(exec).toMatch(/rehearsal\.refusals\.every\(\(r\) => r\.table === "storage\.objects"\)/);
  });
  it("only account-deletion privacy requests can be erased", () => {
    expect(src).toMatch(/if \(type !== "account_deletion" \|\| typeof data\.profile_id !== "string"\)/);
    expect(src).toMatch(/if \(!isPrivacyRequestPayload\(data\.payload\)\) return \{ kind: "not-deletion-request" \};/);
  });
});

describe("the executor migration keeps its promises", () => {
  const sql = readFileSync(
    join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20261015200000_privacy_erasure_executor_v2.sql"),
    "utf8",
  );
  it("defaults to a dry run, runs as service_role only, and calls the detached ledger pseudonymised", () => {
    expect(sql).toContain("p_dry_run boolean default true");
    expect(sql).toMatch(/grant execute on function public\.erase_user_account_v2\(uuid, uuid, uuid, boolean\) to service_role;/);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke all on function public.erase_user_account_v2(uuid, uuid, uuid, boolean) from ${role};`);
    }
    expect(sql).toContain("PSEUDONYMISED, not anonymous");
  });
  it("reads every FK onto profiles/workers live and refuses an unclassified one", () => {
    expect(sql).toMatch(/c\.confrelid in \('public\.profiles'::regclass, 'public\.workers'::regclass\)/);
    expect(sql).toContain("unclassified reference (no decided treatment)");
  });
  it("seeds all 66 non-cascading FKs from the 2026-10-15 inventory; undecided ones refuse", () => {
    const seeds = sql.match(/^\s+\('[a-z_]+', '[a-z_]+', 'profiles', '[a-z_]+', (true|false),/gm) ?? [];
    expect(seeds.length).toBeGreaterThanOrEqual(66);
    expect(sql).not.toMatch(/'refuse', true/);
  });
});
