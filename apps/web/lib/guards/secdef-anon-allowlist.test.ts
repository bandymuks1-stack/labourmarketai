import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ANON_SECDEF_ALLOWLIST,
  ANON_SECDEF_ALLOWED_SIGNATURES,
  signatureOf,
} from "../security/anon-secdef-allowlist";

/**
 * RECURRENCE GUARD — anonymous reachability of SECURITY DEFINER functions.
 *
 * The 2026-07-22 P0 was not caused by bad function bodies. It was caused by a
 * grant that nobody had to write: `GRANT EXECUTE ... TO authenticated` issued
 * without `REVOKE ... FROM PUBLIC` leaves the default PUBLIC grant in place, and
 * `anon` inherits it. Nothing in a diff makes that visible.
 *
 * This file is the static half of the guard. It enforces the things that can be
 * known without a database:
 *   - the allowlist is a reviewed set of EXACT identity signatures;
 *   - every allowlisted function carries a written security contract, including
 *     an honest abuse/rate-limit statement;
 *   - no NEW migration may hand EXECUTE to anon or PUBLIC on a public function
 *     that is not on the allowlist;
 *   - the revoke migration cannot touch an intentionally-public RPC, and cannot
 *     revoke without re-granting the authenticated surface it depends on.
 *
 * The live half is `pnpm -C apps/web check:anon-secdef-allowlist`, which diffs
 * the allowlist against a real database in BOTH directions. Static assertions
 * alone cannot see production grants — that is precisely how the P0 survived
 * review — so the live checker is the authoritative gate, not this file.
 *
 * NEITHER HALF MAY EVER ASSERT A COUNT. "47 anon-reachable functions" is not a
 * security property: swap one function for another and the number is unchanged
 * while the risk is not. Identity is the contract.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

/** The migration that establishes the allowlist as the production contract. */
const REVOKE_MIGRATION = "20260722160000_secdef_anon_reach_revoke_v1.sql";
/** Its filename timestamp — migrations at or before this predate the contract. */
const CONTRACT_EPOCH = "20260722160000";

const revokeMigration = readFileSync(
  join(MIGRATIONS_DIR, REVOKE_MIGRATION),
  "utf-8",
);

/** SQL with `--` line comments stripped, so we assert on executable statements
 *  and not on prose that legitimately names the functions it must not touch. */
function statementsOnly(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

const revokeStatements = statementsOnly(revokeMigration);

describe("anon SECURITY DEFINER allowlist — shape and contract", () => {
  it("holds only exact identity signatures, with no duplicates", () => {
    const seen = new Set<string>();
    for (const fn of ANON_SECDEF_ALLOWLIST) {
      const sig = signatureOf(fn);
      expect(seen.has(sig), `duplicate allowlist entry: ${sig}`).toBe(false);
      seen.add(sig);

      // A bare name is not a signature. `foo` and `foo(uuid)` are different
      // grants, and the whole point of this guard is that they never conflate.
      expect(fn.name, `not a plain function name: ${fn.name}`).toMatch(
        /^[a-z_][a-z0-9_]*$/,
      );
      // Identity args are either empty (no-arg function) or `name type` pairs.
      if (fn.identityArgs !== "") {
        expect(
          fn.identityArgs,
          `identityArgs must be pg_get_function_identity_arguments output: ${sig}`,
        ).toMatch(/^[a-z_][a-z0-9_]*\s+[a-z]/i);
        expect(
          fn.identityArgs,
          `identityArgs must not carry DEFAULT clauses: ${sig}`,
        ).not.toMatch(/\bdefault\b/i);
      }
    }
  });

  it("documents a real security contract for every entry", () => {
    for (const fn of ANON_SECDEF_ALLOWLIST) {
      const sig = signatureOf(fn);
      const required = [
        ["publicCaller", fn.publicCaller],
        ["authorization", fn.authorization],
        ["inputValidation", fn.inputValidation],
        ["abuseControls", fn.abuseControls],
        ["definerJustification", fn.definerJustification],
        ["residualRisk", fn.residualRisk],
      ] as const;

      for (const [field, value] of required) {
        expect(value, `${sig}: ${field} is missing`).toBeTruthy();
        // A one-word placeholder is not a contract. Anything anon can reach has
        // to be explained well enough that a reviewer can disagree with it.
        expect(
          value.trim().length,
          `${sig}: ${field} is too short to be a real contract`,
        ).toBeGreaterThan(30);
        expect(
          value,
          `${sig}: ${field} is a placeholder`,
        ).not.toMatch(/^(tbd|todo|n\/a|none|unknown)\.?$/i);
      }
    }
  });

  it("states abuse controls honestly for every anonymous WRITE path", () => {
    // A public write with no throttle is allowed to exist, but it may not be
    // described as if it were protected. Silence here is how a gap becomes a
    // surprise during an incident.
    for (const fn of ANON_SECDEF_ALLOWLIST.filter((f) => f.mutates)) {
      const sig = signatureOf(fn);
      const declaresLimit = /rate.?limit|throttle|captcha|turnstile|quota/i.test(
        fn.abuseControls,
      );
      const declaresGap = /\bGAP\b|\bNO\b|absent|missing|not enforced/i.test(
        fn.abuseControls,
      );
      expect(
        declaresLimit || declaresGap,
        `${sig}: an anonymous write path must either name its abuse control or explicitly declare the gap`,
      ).toBe(true);
    }
  });
});

describe("revoke migration 20260722160000", () => {
  it("never revokes an intentionally-public RPC", () => {
    // The failure this catches is a blanket `revoke ... from public` sweep that
    // takes the public product down with it.
    for (const fn of ANON_SECDEF_ALLOWLIST) {
      const pattern = new RegExp(
        `revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn.name}\\s*\\(`,
        "i",
      );
      expect(
        pattern.test(revokeStatements),
        `${signatureOf(fn)} is intentionally public but the migration revokes it`,
      ).toBe(false);
    }
  });

  it("re-grants authenticated on everything it revokes", () => {
    // Load-bearing: RLS policy expressions are privilege-checked against the
    // querying role, so a revoke without a re-grant is an outage for logged-in
    // users, not a hardening step.
    const revoked = [
      ...revokeStatements.matchAll(
        /revoke\s+execute\s+on\s+function\s+public\.([a-z0-9_]+)\s*\(/gi,
      ),
    ].map((m) => m[1].toLowerCase());

    expect(revoked.length, "migration revokes nothing").toBeGreaterThan(0);

    const granted = new Set(
      [
        ...revokeStatements.matchAll(
          /grant\s+execute\s+on\s+function\s+public\.([a-z0-9_]+)\s*\([^)]*\)\s*to\s+([^;]+);/gi,
        ),
      ]
        .filter((m) => /authenticated/i.test(m[2]))
        .map((m) => m[1].toLowerCase()),
    );

    for (const name of new Set(revoked)) {
      expect(
        granted.has(name),
        `public.${name} is revoked from PUBLIC but never re-granted to authenticated — this would break RLS for logged-in users`,
      ).toBe(true);
    }
  });

  it("revokes from anon explicitly, not just from PUBLIC", () => {
    // Revoking PUBLIC alone is not enough if a direct `anon=X` grant also exists;
    // both paths have to be closed or the fix is cosmetic.
    const revokeTargets = [
      ...revokeStatements.matchAll(
        /revoke\s+execute\s+on\s+function\s+public\.[a-z0-9_]+\s*\([^)]*\)\s+from\s+([^;]+);/gi,
      ),
    ].map((m) => m[1]);

    expect(revokeTargets.length).toBeGreaterThan(0);
    for (const target of revokeTargets) {
      expect(
        /\bpublic\b/i.test(target) && /\banon\b/i.test(target),
        `revoke target "${target.trim()}" must name both public and anon`,
      ).toBe(true);
    }
  });

  it("fails closed inside the transaction on an identity check, not a count", () => {
    expect(revokeStatements).toMatch(/raise\s+exception/i);
    expect(revokeStatements).toMatch(/has_function_privilege\(\s*'anon'/i);
    expect(revokeStatements).toMatch(/pg_get_function_identity_arguments/i);
    // A guard written as `if count(*) <> 47` would pass while the set silently
    // changed underneath it.
    expect(
      /count\(\*\)\s*(<>|!=|=)\s*\d+/.test(revokeStatements),
      "the in-migration assertion must compare signatures, never a count",
    ).toBe(false);
  });

  it("ships with a rollback that admits what restoring PUBLIC means", () => {
    const rollback = readFileSync(
      join(
        REPO_ROOT,
        "supabase",
        "rollbacks",
        REVOKE_MIGRATION.replace(/\.sql$/, ".down.sql"),
      ),
      "utf-8",
    );
    expect(rollback).toMatch(/grant\s+execute\s+on\s+function/i);
    // The rollback re-opens the exact hole the migration closes. If that is not
    // written down, someone will run it during an incident believing it is inert.
    expect(rollback).toMatch(/re-open|reopen|exploitable|P0/i);
  });
});

describe("no new migration may re-open anonymous reachability", () => {
  it("grants EXECUTE to anon/PUBLIC only for allowlisted signatures", () => {
    const offences: string[] = [];

    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      // Only migrations authored after the contract exists are in scope.
      // Re-litigating history would make this guard permanently red and
      // therefore permanently ignored.
      .filter((f) => (f.match(/^(\d+)/)?.[1] ?? "") > CONTRACT_EPOCH);

    for (const file of migrations) {
      const sql = statementsOnly(
        readFileSync(join(MIGRATIONS_DIR, file), "utf-8"),
      );

      for (const match of sql.matchAll(
        /grant\s+execute\s+on\s+function\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)\s*to\s+([^;]+);/gi,
      )) {
        const [, name, , grantees] = match;
        const opensToAnon =
          /\banon\b/i.test(grantees) || /\bpublic\b/i.test(grantees);
        if (!opensToAnon) continue;

        const allowlisted = [...ANON_SECDEF_ALLOWED_SIGNATURES].some((sig) =>
          sig.startsWith(`${name.toLowerCase()}(`),
        );
        if (!allowlisted) {
          offences.push(
            `${file}: grants EXECUTE on public.${name} to "${grantees.trim()}" but it is not on the anon allowlist`,
          );
        }
      }

      // `grant execute on all functions in schema public to anon` is the blast
      // radius this whole exercise exists to prevent.
      if (
        /grant\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+to\s+[^;]*\b(anon|public)\b/i.test(
          sql,
        )
      ) {
        offences.push(
          `${file}: blanket GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public to anon/PUBLIC`,
        );
      }
    }

    expect(offences, offences.join("\n")).toEqual([]);
  });
});
