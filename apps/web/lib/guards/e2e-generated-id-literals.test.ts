import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const E2E_DIR = resolve(__dirname, "..", "..", "tests", "e2e");

/**
 * A SPEC MAY NOT PIN AN ID THE DATABASE REGENERATES.
 *
 * ## The defect
 *
 * `education-pilot-institution-learner` and `pilot-cross-actor-loop` — which
 * between them ARE `CAPABILITY_INVENTORY` §4 blockers 1 and 3 — pinned their
 * organization and worker ids as literals:
 *
 *     const ORG = "589620e6-4e36-4369-8cc7-0bb35b202ce3";
 *     const LEARNER_WORKER = "b43c82a1-153b-4c38-bbde-9840f3c61986";
 *
 * Those rows are created with generated uuids: `organizations` is backfilled
 * from `companies`/`agencies`, `workers` uses `gen_random_uuid()`. Every
 * `npx supabase db reset` mints new ones. Measured on a fresh stack
 * 2026-08-28, the real values were `c11236c6-…` and `4bb2ee60-…` — so neither
 * spec could pass on ANY reset database.
 *
 * And it did not fail honestly. A PostgREST filter on a nonexistent
 * organization returns an empty set, so the spec reported *"fixture drift: the
 * learner must already be an employee for this to prove anything"* — a true
 * sentence about entirely the wrong thing.
 *
 * This is the mirror of #1319. There a selector could never FAIL; here a chain
 * could never PASS. Both leave the same hole: a blocker everybody believes is
 * covered, with no run behind the belief.
 *
 * ## What is allowed
 *
 * The fixture's HAND-WRITTEN anchors, which `dev-fixtures.sql` sets literally
 * and a reset therefore reproduces exactly. Everything else must be looked up
 * (`tests/e2e/fixture-ids.ts`).
 */

/**
 * WHAT THIS DOES AND DOES NOT BAN.
 *
 * A spec that INSERTS its own row may choose that row's uuid freely — it
 * created it, so it knows it. `w11-project-lifecycle`, `w12-atomic-double-
 * booking` and the rest do exactly that, and they are correct.
 *
 * The defect is the opposite: a literal for a row the spec expects to ALREADY
 * EXIST, in one of the two tables whose fixture rows are generated —
 * `organizations` (backfilled from companies/agencies) and `workers`
 * (`gen_random_uuid()`).
 *
 * Distinguishing those statically is not possible in general, so this pins the
 * precise shape both defects took, which is also the shape the next one will:
 * a module-level constant NAMED for an organization or a worker, holding a
 * uuid literal. Narrow on purpose — a guard that fires on legitimate code gets
 * an allowlist, then an exception, then deleted.
 */
/**
 * TWO THINGS THIS REGEX GOT WRONG, BOTH FOUND BY THE NEGATIVE CONTROL.
 *
 * 1. It began with a word boundary written as a backslash-b. That escape did
 *    not survive the editing path that wrote this file and became a literal
 *    0x08 control character, so the pattern matched NOTHING and the guard was
 *    vacuous from its first green run. Written without escapes now.
 * 2. The name group required at least one character BEFORE the word, so
 *    `LEARNER_WORKER` matched and a bare `const ORG` did not - precisely one
 *    of the two constants this guard exists for. The leading segment is
 *    optional now.
 *
 * A guard is only worth its line count once it has been watched to FAIL.
 */
const ORG_OR_WORKER_CONST =
  /(?:const|let|var)\s+([\w$]*(?:ORG|Org|WORKER|Worker)[\w$]*)\s*(?::[^=]+)?=\s*["'`]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["'`]/g;

/**
 * Uuid prefixes `dev-fixtures.sql` writes LITERALLY — profiles, companies and
 * agencies. A reset reproduces these byte for byte, so pinning one is correct.
 * Everything else in `organizations` / `workers` is generated.
 */
const HAND_WRITTEN_PREFIXES = ["aaaaaaaa-", "cccccccc-", "dddddddd-"];

function specFiles(): string[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(E2E_DIR, f));
}

describe("E2E specs never pin a generated fixture id", () => {
  it("no spec pins an organization or worker id as a literal", () => {
    const offenders: string[] = [];
    for (const file of specFiles()) {
      // Strip comments: the account of the DEFECT quotes the very literals it
      // exists to ban, and a guard that cannot explain itself is one nobody
      // maintains.
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ 	]*\/\/.*$/gm, "");
      for (const m of source.matchAll(ORG_OR_WORKER_CONST)) {
        const [, name, value] = m;
        // A PROFILE id is not a worker-row id. `WORKER_PROFILE_ID` and
        // `WORKER_USER_ID` hold `profiles.id`, which dev-fixtures.sql writes by
        // hand and a reset reproduces exactly — eight specs use them correctly.
        if (/PROFILE|Profile|USER|User/.test(name)) continue;
        // And a value the fixtures write LITERALLY is stable whatever it is
        // called. This is the axis that actually matters: where the value comes
        // from, not what the constant is named.
        if (HAND_WRITTEN_PREFIXES.some((p) => value.toLowerCase().startsWith(p))) {
          continue;
        }
        // `basename`, not a hand-rolled split: this repo is edited on Windows
        // and a separator class written with escapes does not survive every
        // editing path.
        offenders.push(`${basename(file)}: ${name} = ${value}`);
      }
    }
    expect(
      offenders,
      "`organizations` and `workers` rows get generated uuids, so a `db reset` " +
        "regenerates these and the spec can never pass. Resolve them at run " +
        "time through tests/e2e/fixture-ids.ts instead.",
    ).toEqual([]);
  });

  /**
   * NEGATIVE CONTROL for the test above: it only means anything while the
   * lookup helper actually exists and actually LOOKS things up. A version that
   * returned a constant would satisfy every assertion above while restoring
   * exactly the defect.
   */
  it("the resolver resolves instead of returning constants", () => {
    const helper = readFileSync(join(E2E_DIR, "fixture-ids.ts"), "utf8");
    for (const fn of [
      "fixtureCompanyOrgId",
      "fixtureAgencyOrgId",
      "fixtureWorkerId",
    ]) {
      expect(helper, `${fn} must exist`).toContain(`export async function ${fn}`);
    }
    // It queries, and it refuses to return a missing id silently — an
    // undefined id in a filter is what produced the misleading empty set.
    expect(helper).toContain("legacy_company_id=eq.");
    expect(helper).toContain("legacy_agency_id=eq.");
    expect(helper).toContain("workers?profile_id=eq.");
    expect(helper).toContain("throw new Error");
  });

  /**
   * The two specs this was found in must actually USE the resolver. Without
   * this, a future edit could reintroduce a literal in a file the first test
   * happens to tolerate (e.g. one that looks hand-written) and the chain would
   * quietly stop running again.
   */
  it("the education and cross-actor specs resolve their ids", () => {
    for (const rel of [
      "education-pilot-institution-learner.spec.ts",
      "pilot-cross-actor-loop.spec.ts",
    ]) {
      const code = readFileSync(join(E2E_DIR, rel), "utf8");
      expect(code, `${rel} must import the resolver`).toContain(
        'from "./fixture-ids"',
      );
      expect(code, `${rel} must resolve before use`).toContain(
        "await fixtureCompanyOrgId()",
      );
    }
  });
});
