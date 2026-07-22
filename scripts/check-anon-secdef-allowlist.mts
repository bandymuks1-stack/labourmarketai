/**
 * LIVE RECURRENCE GUARD — anonymous reachability of SECURITY DEFINER functions.
 *
 *   pnpm check:anon-secdef-allowlist
 *   DB_URL=postgresql://... pnpm check:anon-secdef-allowlist
 *
 * Diffs the reviewed allowlist in
 * `apps/web/lib/security/anon-secdef-allowlist.ts` against what a real database
 * actually grants, in BOTH directions, by EXACT identity signature.
 *
 * WHY A LIVE CHECK IS REQUIRED
 * ----------------------------
 * The 2026-07-22 P0 was a production grant that no migration diff revealed: the
 * default PUBLIC EXECUTE grant, left behind whenever `GRANT ... TO authenticated`
 * is written without `REVOKE ... FROM PUBLIC`. Static analysis of migration files
 * cannot see it. Only the catalog can. A guard that reads only the repo would
 * have passed on the day the defect shipped.
 *
 * FAILS ON ALL SIX RECURRENCE CONDITIONS
 *   1. a SECURITY DEFINER function becomes anon-reachable and is not allowlisted;
 *   2. an allowlisted function's signature changes (drift is not a silent pass);
 *   3. an allowlisted function no longer exists (stale allowlist entry);
 *   4. PUBLIC (`=X`) is re-granted on a non-allowlisted function — the root cause
 *      itself, flagged even when `anon` has not yet been observed using it;
 *   5. an allowlisted function has lost its anon grant (the public product broke);
 *   6. an allowlisted function carries no documented security contract.
 *
 * It never asserts a count. A swap that preserved the number of anon-reachable
 * functions would change the risk completely and must still fail.
 *
 * STRICTLY READ-ONLY. It opens a read-only transaction and touches only system
 * catalogs, so it is safe to point at production — which is the intended use.
 */

import { Client } from "pg";
import {
  ANON_SECDEF_ALLOWLIST,
  signatureOf,
} from "../apps/web/lib/security/anon-secdef-allowlist.ts";

const DB_URL =
  process.env.DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Row = {
  sig: string;
  anon_exec: boolean;
  public_in_acl: boolean;
  explicit_anon_grant: boolean;
  acl: string;
};

const failures: string[] = [];
const notes: string[] = [];

function fail(condition: number, message: string): void {
  failures.push(`[C${condition}] ${message}`);
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // Belt and braces: even a bug in this file cannot write to the target.
    await client.query("begin read only");

    const { rows } = await client.query<Row>(`
      select
        p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
        has_function_privilege('anon', p.oid, 'EXECUTE')                     as anon_exec,
        (p.proacl is null
          or array_to_string(p.proacl::text[], ' ') ~ '(^|[{ ])=X')          as public_in_acl,
        (p.proacl is not null
          and array_to_string(p.proacl::text[], ' ') ~ 'anon=X')             as explicit_anon_grant,
        coalesce(p.proacl::text, '(null = default PUBLIC)')                  as acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
      order by 1
    `);

    const bySig = new Map(rows.map((r) => [r.sig, r]));
    const allowed = new Map(
      ANON_SECDEF_ALLOWLIST.map((fn) => [signatureOf(fn), fn]),
    );

    // --- Condition 6: the allowlist must document itself -------------------
    // Checked first: an entry with no contract cannot be trusted to justify the
    // exposure the other checks are about to permit.
    for (const [sig, fn] of allowed) {
      const missing = (
        [
          ["publicCaller", fn.publicCaller],
          ["authorization", fn.authorization],
          ["inputValidation", fn.inputValidation],
          ["abuseControls", fn.abuseControls],
          ["definerJustification", fn.definerJustification],
          ["residualRisk", fn.residualRisk],
        ] as const
      )
        .filter(([, v]) => !v || v.trim().length <= 30)
        .map(([k]) => k);

      if (missing.length > 0) {
        fail(6, `${sig} is allowlisted without a documented contract: ${missing.join(", ")}`);
      }
    }

    // --- Conditions 2 & 3: allowlist entries must exist, exactly -----------
    for (const sig of allowed.keys()) {
      const row = bySig.get(sig);
      if (!row) {
        const name = sig.slice(0, sig.indexOf("("));
        const nearby = [...bySig.keys()].filter((s) =>
          s.startsWith(`${name}(`),
        );
        if (nearby.length > 0) {
          fail(
            2,
            `signature drift — allowlist pins "${sig}" but production has ${nearby
              .map((s) => `"${s}"`)
              .join(", ")}. Re-review the function, then update the allowlist.`,
          );
        } else {
          fail(
            3,
            `stale allowlist entry — "${sig}" is not a SECURITY DEFINER function in this database. Remove it, or restore the function.`,
          );
        }
        continue;
      }

      // --- Condition 5: the public product must still work ----------------
      if (!row.anon_exec) {
        fail(
          5,
          `${sig} is allowlisted as intentionally public but anon has LOST EXECUTE (acl: ${row.acl}). The public surface is broken.`,
        );
      }
    }

    // --- Conditions 1 & 4: nothing unreviewed may be reachable -------------
    for (const row of rows) {
      const isAllowed = allowed.has(row.sig);

      if (row.anon_exec && !isAllowed) {
        fail(
          1,
          `${row.sig} is anon-EXECUTABLE but not allowlisted (acl: ${row.acl})` +
            (row.explicit_anon_grant
              ? " — via an EXPLICIT anon grant, so someone chose this deliberately without review."
              : " — via the leftover default PUBLIC grant, the exact root cause of the 2026-07-22 P0."),
        );
        continue;
      }

      if (row.public_in_acl && !isAllowed) {
        // Reachability and the PUBLIC grant are reported separately on purpose:
        // a function can carry PUBLIC while anon is blocked by another means,
        // and that is still a latent hole waiting for the other means to change.
        fail(
          4,
          `${row.sig} carries a PUBLIC (=X) EXECUTE grant while not allowlisted (acl: ${row.acl}).`,
        );
      }
    }

    // --- Reporting --------------------------------------------------------
    const anonReachable = rows.filter((r) => r.anon_exec);
    notes.push(
      `checked ${rows.length} SECURITY DEFINER function(s) in schema public`,
    );
    notes.push(
      `${anonReachable.length} currently anon-reachable; ${allowed.size} allowlisted`,
    );
    notes.push(
      "(these numbers are diagnostics only — the contract is the signature set, never a count)",
    );

    await client.query("rollback");
  } finally {
    await client.end();
  }

  for (const note of notes) console.log(`  ${note}`);

  if (failures.length > 0) {
    console.error(
      `\nFAIL — anon SECURITY DEFINER allowlist drift (${failures.length} finding(s)):\n`,
    );
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      "\nThis guard is a security contract, not a lint rule. Do not silence it by\n" +
        "adding an allowlist entry: adding one is an owner decision that requires a\n" +
        "written security contract and a review of the anonymous call path.\n" +
        "See docs/security/secdef-remaining-47-audit-v1.md\n",
    );
    process.exit(1);
  }

  console.log("\nPASS — anon-reachable SECURITY DEFINER set matches the reviewed allowlist exactly.");
}

main().catch((err) => {
  console.error("check-anon-secdef-allowlist failed to run:", err);
  process.exit(1);
});
