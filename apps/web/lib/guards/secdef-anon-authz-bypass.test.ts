import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 SECURITY HOTFIX pinning tests —
 * `supabase/migrations/20260722120000_secdef_anon_authz_bypass_fix_v1.sql`
 *
 * Defect (verified in production 2026-07-22):
 * seven SECURITY DEFINER RPCs guarded ownership with `v_owner <> auth.uid()`.
 * For an unauthenticated caller `auth.uid()` is NULL, `v_owner <> NULL` is NULL,
 * PL/pgSQL treats NULL as false, the raise never fires, and the write proceeds
 * with DEFINER privileges. They were reachable by `anon` because their ACL kept
 * the default PUBLIC grant (`=X/postgres`) — `GRANT ... TO authenticated` was
 * issued without `REVOKE ... FROM PUBLIC`.
 *
 * The contract encoded here so a future edit cannot silently regress it:
 *   - all seven functions reject an unauthenticated caller EXPLICITLY, and do so
 *     BEFORE the row lookup (a non-existent id must never read as authorized);
 *   - no NULL-unsafe identity comparison survives anywhere in the migration;
 *   - each of the seven exact signatures is revoked from PUBLIC and from anon,
 *     and granted to authenticated;
 *   - SECURITY DEFINER and the pinned search_path are preserved;
 *   - the blast radius stays at exactly these seven functions (no blanket
 *     revoke that would break the intentionally-public RPCs);
 *   - a paired rollback exists and it never re-opens the hole.
 *
 * NOTE ON SCOPE: these are static contract assertions, which is this repo's
 * convention for migration guards (see admin-grant-guard-migration.test.ts).
 * Behavioural proof against a live database is a separate artifact —
 * `supabase/tests/20260722120000_secdef_anon_authz_bypass_verification.sql` —
 * and is executed at the production owner gate. This file cannot and does not
 * claim runtime proof.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION_NAME = "20260722120000_secdef_anon_authz_bypass_fix_v1.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_NAME}`;
const ROLLBACK = `supabase/rollbacks/${MIGRATION_NAME.replace(/\.sql$/, ".down.sql")}`;
const VERIFICATION =
  "supabase/tests/20260722120000_secdef_anon_authz_bypass_verification.sql";

const migration = readFileSync(join(REPO_ROOT, MIGRATION), "utf-8");
const rollback = readFileSync(join(REPO_ROOT, ROLLBACK), "utf-8");

/** The seven functions, with the exact identity signature production reports
 *  via `pg_get_function_identity_arguments`. Order matters only for readability. */
const FUNCTIONS: ReadonlyArray<{ name: string; args: string }> = [
  { name: "delete_contract_v1", args: "p_contract_id uuid" },
  { name: "set_contract_status_v1", args: "p_contract_id uuid, p_status text" },
  { name: "delete_proposal_v1", args: "p_proposal_id uuid" },
  {
    name: "set_proposal_status_v1",
    args: "p_proposal_id uuid, p_status text, p_rejection_reason text",
  },
  { name: "delete_marketplace_listing_v1", args: "p_id uuid" },
  { name: "set_marketplace_listing_status_v1", args: "p_id uuid, p_status text" },
  {
    name: "update_marketplace_listing_v1",
    args: "p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text, p_location_country text, p_location_label text, p_price_text text",
  },
];

/** The SQL with `--` line comments removed, so assertions test executable
 *  statements rather than the explanatory header (which legitimately names the
 *  intentionally-public RPCs it must not touch). */
function statementsOnly(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

/** Extract exactly one PROOF block, delimited by its unique marker pair.
 *
 *  NEVER slice on `indexOf("PROOF n")` — proof bodies legitimately mention each
 *  other in prose, so the first match can land in a different block and the
 *  assertions then pass vacuously across everything after it. That bug was real
 *  in an earlier revision of this guard. Both markers must appear exactly once.
 */
function proofBlock(verification: string, n: number): string {
  const open = `>>>PROOF_${n}_BEGIN`;
  const close = `<<<PROOF_${n}_END`;
  const opens = verification.split(open).length - 1;
  const closes = verification.split(close).length - 1;
  expect(opens, `${open} appears exactly once`).toBe(1);
  expect(closes, `${close} appears exactly once`).toBe(1);
  const start = verification.indexOf(open);
  const end = verification.indexOf(close);
  expect(end, `${close} follows ${open}`).toBeGreaterThan(start);
  return verification.slice(start + open.length, end);
}

/** Body of one `create or replace function public.<name>(...) ... $function$;` block. */
function bodyOf(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `function ${name} present`).toBeGreaterThan(-1);
  const end = sql.indexOf("$function$;", start);
  expect(end, `function ${name} terminated`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("20260722120000 — P0 anon SECURITY DEFINER authorization bypass", () => {
  it("covers exactly the seven affected functions and no others", () => {
    const defined = [
      ...migration.matchAll(/create or replace function public\.(\w+)\(/g),
    ].map((m) => m[1]);
    expect(defined.sort()).toEqual(FUNCTIONS.map((f) => f.name).sort());
  });

  describe.each(FUNCTIONS)("$name", ({ name, args }) => {
    const body = () => bodyOf(migration, name);

    it("rejects an unauthenticated caller explicitly", () => {
      expect(body()).toMatch(
        /if auth\.uid\(\) is null then raise exception 'not authorized'; end if;/i,
      );
    });

    it("rejects the unauthenticated caller BEFORE the row lookup", () => {
      const b = body();
      const guard = b.indexOf("auth.uid() is null");
      const lookup = b.indexOf("select owner_id into v_owner");
      expect(guard).toBeGreaterThan(-1);
      expect(lookup).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(lookup);
    });

    it("uses a NULL-safe ownership comparison", () => {
      expect(body()).toMatch(
        /if v_owner is distinct from auth\.uid\(\) then raise exception 'not authorized'; end if;/i,
      );
    });

    it("contains no NULL-unsafe identity comparison", () => {
      expect(body()).not.toMatch(/(<>|!=)\s*auth\.uid\(\)/);
    });

    it("preserves SECURITY DEFINER and the pinned search_path", () => {
      const b = body();
      expect(b).toMatch(/security definer/i);
      expect(b).toMatch(/set search_path to 'public'/i);
    });

    it("revokes EXECUTE from PUBLIC on the exact signature", () => {
      expect(migration).toContain(
        `revoke execute on function public.${name}(${args}) from public;`,
      );
    });

    it("revokes EXECUTE from anon on the exact signature", () => {
      expect(migration).toContain(
        `revoke execute on function public.${name}(${args}) from anon;`,
      );
    });

    it("grants EXECUTE to authenticated on the exact signature", () => {
      expect(migration).toContain(
        `grant  execute on function public.${name}(${args}) to authenticated;`,
      );
    });
  });

  it("does not blanket-revoke across the schema (the public RPCs must keep working)", () => {
    // A schema-wide revoke would also strip submit_company_need_public_v1 and the
    // three get_public_business_* readers, which are intentionally anon-callable.
    const sql = statementsOnly(migration);
    expect(sql).not.toMatch(/revoke\s+execute\s+on\s+all\s+functions/i);
    for (const intentionallyPublic of [
      "submit_company_need_public_v1",
      "get_public_business_profile_v1",
      "get_public_business_listings_v1",
      "get_public_business_services_v1",
    ]) {
      // They may be named in the header prose; no STATEMENT may reference them.
      expect(sql).not.toContain(intentionallyPublic);
    }
  });

  it("never grants anything to anon or PUBLIC", () => {
    expect(migration).not.toMatch(/grant\s+execute[^;]*\bto\s+(anon|public)\b/i);
  });

  it("touches no table, row, policy or trigger", () => {
    for (const forbidden of [
      /\bcreate\s+table\b/i,
      /\balter\s+table\b/i,
      /\bdrop\s+table\b/i,
      /\bcreate\s+policy\b/i,
      /\balter\s+policy\b/i,
      /\bdrop\s+policy\b/i,
      /\bcreate\s+trigger\b/i,
      /\btruncate\b/i,
      /\binsert\s+into\b/i,
    ]) {
      expect(migration).not.toMatch(forbidden);
    }
  });

  it("carries the human-gate annotation (RED class: SECURITY DEFINER + GRANT/REVOKE)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });

  it("ships a paired rollback file", () => {
    expect(existsSync(join(REPO_ROOT, ROLLBACK))).toBe(true);
  });

  it("uses the 14-digit timestamp naming convention (doctrine §16)", () => {
    expect(MIGRATION_NAME).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it("does not reuse an existing migration version", () => {
    const versions = readdirSync(join(REPO_ROOT, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 14));
    const mine = MIGRATION_NAME.slice(0, 14);
    expect(versions.filter((v) => v === mine)).toHaveLength(1);
  });
});

describe("20260722120000 — rollback never re-opens the hole", () => {
  it("never grants EXECUTE to anon or PUBLIC", () => {
    expect(rollback).not.toMatch(/grant\s+execute[^;]*\bto\s+(anon|public)\b/i);
  });

  it("keeps PUBLIC and anon revoked for every one of the seven signatures", () => {
    for (const { name, args } of FUNCTIONS) {
      expect(rollback).toContain(
        `revoke execute on function public.${name}(${args}) from public;`,
      );
      expect(rollback).toContain(
        `revoke execute on function public.${name}(${args}) from anon;`,
      );
    }
  });

  it("never restores a NULL-unsafe identity comparison", () => {
    expect(rollback).not.toMatch(/(<>|!=)\s*auth\.uid\(\)/);
  });

  it("keeps the explicit unauthenticated rejection in every function", () => {
    for (const { name } of FUNCTIONS) {
      expect(bodyOf(rollback, name)).toMatch(
        /if auth\.uid\(\) is null then raise exception 'not authorized'; end if;/i,
      );
    }
  });

  it("destroys nothing (a security rollback must not drop the write paths)", () => {
    const sql = statementsOnly(rollback);
    expect(sql).not.toMatch(/\bdrop\s+function\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
  });

  it("deletes only a single owner-checked row, never a set", () => {
    // `delete from` is legitimate — it is what delete_*_v1 exists to do. What
    // must never appear is an unqualified or multi-row delete.
    const deletes = [...statementsOnly(rollback).matchAll(/delete\s+from\s+[^;]+;/gi)].map(
      (m) => m[0].replace(/\s+/g, " ").trim(),
    );
    expect(deletes).toEqual([
      "delete from public.contracts where id = p_contract_id;",
      "delete from public.proposals where id = p_proposal_id;",
      "delete from public.marketplace_listings where id = p_id;",
    ]);
  });
});

describe("20260722120000 — behavioural verification script is shipped", () => {
  it("exists (executed at the production owner gate, not in CI)", () => {
    expect(existsSync(join(REPO_ROOT, VERIFICATION))).toBe(true);
  });

  it("proves all ten required properties and leaves no rows behind", () => {
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    for (let n = 1; n <= 10; n += 1) {
      expect(verification).toContain(`PROOF ${n}`);
    }
    expect(verification).toMatch(/\brollback\b/i);
    expect(verification).not.toMatch(/^\s*commit\s*;/im);
  });

  it("exercises the in-body NULL guard through an executable role, not only the ACL", () => {
    // Codex review of PR #845: after the migration `anon` has no EXECUTE, so an
    // anon call is refused by the privilege check and never reaches the guard.
    // Proof 10 must therefore use a role that CAN execute while leaving the JWT
    // identity unset, so auth.uid() is NULL and the guard is the only barrier.
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    const proof10 = proofBlock(verification, 10);
    expect(proof10).toMatch(/set local role authenticated/i);
    expect(proof10).toMatch(/set_config\('request\.jwt\.claims',\s*''/);
  });

  it("PROOF 10 isolates the guard by asserting WHICH error, on a missing id", () => {
    // Codex round 2: asserting only "an exception + unchanged state" would still
    // pass if the explicit `auth.uid() is null` guard were deleted, because
    // `v_owner is distinct from NULL` is TRUE and raises 'not authorized' anyway.
    // Discriminating on a MISSING id separates the two:
    //   guard present -> 'not authorized'    (fires before the owner lookup)
    //   guard absent  -> 'listing not found' (the lookup ran first)
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    const proof10 = proofBlock(verification, 10);
    expect(proof10).toMatch(/gen_random_uuid\(\)/);
    expect(proof10).toMatch(/sqlerrm/);
    expect(proof10).toMatch(/v_err\s*=\s*'not authorized'/);
    // and it must NOT rely on sqlstate alone — both paths raise P0001
    expect(proof10).not.toMatch(/v_err\s*:=\s*sqlstate/);
  });

  it("PROOF 10 uses its own fixture, so PROOF 7 cannot destroy it pre-apply", () => {
    // Codex round 2: in the vulnerable pre-apply run PROOF 7 successfully deletes
    // v_listing as anon, so a PROOF 10 that reused it would report FAIL for the
    // wrong reason ('listing not found') without reproducing the guard defect.
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    const proof10 = proofBlock(verification, 10);
    expect(proof10).toMatch(/insert into public\.marketplace_listings/);
    expect(proof10).toMatch(/v_listing10/);
  });

  it("the apply runbook states the corrected matrix and requires all TEN proofs", () => {
    // Codex round 2: the authoritative operator procedure in §6 still carried the
    // old "1-8 fail / nine pass" wording, contradicting the corrected matrix.
    const runbook = readFileSync(
      join(REPO_ROOT, "docs/security/secdef-anon-authz-bypass-validation-v1.md"),
      "utf-8",
    );
    expect(runbook).not.toMatch(/Expect proofs 1[–-]8 to FAIL/i);
    expect(runbook).not.toMatch(/All nine proofs must PASS/i);
    expect(runbook).toMatch(/All TEN proofs must PASS/i);
  });

  it("PROOF 2 is catalog-only — it issues no RPC call at all", () => {
    // Resolution of the repeatedly-raised review point: rather than keep
    // explaining that an anon RPC call can only prove reachability, the call was
    // REMOVED from PROOF 2. PROOF 2 is now a pure catalog privilege check keyed
    // on the exact identity signature, and PROOF 10 is the sole behavioural
    // proof of the in-body NULL guard. No ambiguity is left to argue about.
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    const proof2 = proofBlock(verification, 2);
    expect(proof2).not.toMatch(/set local role/i);
    expect(proof2).not.toMatch(/\bperform\s+public\./i);
    // and it must be signature-exact, which is what it adds over PROOF 1
    expect(proof2).toMatch(/pg_get_function_identity_arguments/);
    expect(proof2).toMatch(/k_sigs/);
  });

  it("PROOF 10 is the only proof that calls with a NULL identity", () => {
    // Exactly one block may set an executable role with the JWT identity unset.
    // If a second one appears, the "one discriminating guard proof" contract has
    // been broken and the reviewer ambiguity would return.
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    // The distinguishing property is not "claims were set to ''" — PROOFS 3 and
    // 4 legitimately do that to RESET after using a real identity. It is
    // "assumes the authenticated role and never supplies a `sub` claim".
    const nullIdentityBlocks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => {
      const b = proofBlock(verification, n);
      return (
        /set local role authenticated/i.test(b) &&
        !/json_build_object\('sub'/.test(b)
      );
    });
    expect(nullIdentityBlocks).toEqual([10]);
  });

  it("every proof block is delimited exactly once, in order", () => {
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    let previousEnd = -1;
    for (let n = 1; n <= 10; n += 1) {
      proofBlock(verification, n); // asserts the marker pair is unique
      const start = verification.indexOf(`>>>PROOF_${n}_BEGIN`);
      expect(start, `PROOF ${n} starts after PROOF ${n - 1} ends`).toBeGreaterThan(
        previousEnd,
      );
      previousEnd = verification.indexOf(`<<<PROOF_${n}_END`);
    }
  });

  it("states the corrected pre-apply expectation (not the wrong '1-8 all fail')", () => {
    const verification = readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8");
    expect(verification).toMatch(/EXPECTED FAIL\s*:\s*1,\s*2,\s*6,\s*7,\s*8,\s*10/);
    expect(verification).toMatch(/EXPECTED PASS\s*:\s*3,\s*4,\s*5,\s*9/);
  });

  it("performs no DDL and no irreversible operation", () => {
    const verification = statementsOnly(
      readFileSync(join(REPO_ROOT, VERIFICATION), "utf-8"),
    );
    for (const forbidden of [
      /\bcreate\s+(table|function|index|policy|trigger|sequence)\b/i,
      /\balter\s+(table|function|sequence)\b/i,
      /\bdrop\s+/i,
      /\btruncate\b/i,
      /\bgrant\b/i,
      /\brevoke\b/i,
      /\bnextval\b/i,
      /\bsetval\b/i,
      /\bcopy\b/i,
      /\bpg_notify\b/i,
      /\bdblink\b/i,
      /\bhttp[_s]?\s*\(/i,
    ]) {
      expect(verification).not.toMatch(forbidden);
    }
  });
});
