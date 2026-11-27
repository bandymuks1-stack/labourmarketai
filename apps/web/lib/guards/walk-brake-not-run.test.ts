import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A WALK BRAKE REFUSAL IS NOT RUN, NEVER A FAILED WALK (owner P0 2026-11-24).
 *
 * Run 45404386749 (company-governance, desktop) ended "failure": its budget job
 * stopped at "Brake (e): no production deploy running or just finished" and the
 * walk job was skipped. No journey ran, yet the status ledger read it as FAIL.
 *
 * Now every brake step records its outcome instead of failing its job, the walk
 * does not start, nothing touches production, and the `not-run` job cancels the
 * run with "BLOCKED / NOT RUN" in its summary. The brakes and their thresholds
 * are unchanged (walk-brakes.test.ts).
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const yml = readFileSync(join(REPO, ".github/workflows/prod-qa-walk.yml"), "utf8").replace(/\r/g, "");
const budget = yml.slice(yml.indexOf("\n  budget:"), yml.indexOf("\n  walk:"));
const walk = yml.slice(yml.indexOf("\n  walk:"), yml.indexOf("\n  not-run:"));
const notRun = yml.slice(yml.indexOf("\n  not-run:"));

function step(job: string, name: string): string {
  const at = job.indexOf(`- name: ${name}`);
  if (at < 0) throw new Error(`step ${name} missing`);
  const next = job.indexOf("\n      - ", at + 1);
  const nextComment = job.indexOf("\n      #", at + 1);
  const end = [next, nextComment].filter((n) => n > 0).sort((a, b) => a - b)[0];
  return job.slice(at, end);
}

const BUDGET_BRAKES: [string, string][] = [
  ['"Brake (a): production health (the override does not lift it)"', "brake_a"],
  ['"Brake (e): no production deploy running or just finished (the override does not lift it)"', "brake_e"],
  ['"Brake (b): the last walks did not fail for infrastructure"', "brake_b"],
  ['"Brake (c): Supabase edge 5xx / 429 (optional, needs SUPABASE_ACCESS_TOKEN)"', "brake_c"],
];
const WALK_BRAKES: [string, string][] = [
  ['"Brake (d): minimum gap after the previous walk (waits)"', "brake_d"],
  ['"Brake (e): no production deploy running or just finished"', "brake_we"],
  ['"Brake (a): production health, right before the walk"', "brake_wa"],
];
const allClear = (ids: string[]) => ids.map((id) => `steps.${id}.outcome == 'success'`).join(" && ");

describe("a brake refusal records NOT RUN instead of failing the job", () => {
  it.each([
    ...BUDGET_BRAKES.map(([n, id]) => ["budget", n, id] as const),
    ...WALK_BRAKES.map(([n, id]) => ["walk", n, id] as const),
  ])("%s job: %s records its outcome (id %s)", (job, name, id) => {
    const s = step(job === "budget" ? budget : walk, name);
    expect(s).toContain(`id: ${id}\n`);
    expect(s).toContain("continue-on-error: true");
  });

  it("each job publishes `brake`: clear only when every one of its brakes passed", () => {
    expect(budget).toContain(`brake: \${{ (${allClear(BUDGET_BRAKES.map((b) => b[1]))}) && 'clear' || 'refused' }}`);
    expect(walk).toContain(`brake: \${{ (${allClear(WALK_BRAKES.map((b) => b[1]))}) && 'clear' || 'refused' }}`);
  });
});

describe("after a refusal nothing touches production and no walk is counted", () => {
  it("the budget count runs only when every budget brake is clear", () => {
    expect(step(budget, "Count production walks in the last 24 h")).toContain(`if: ${allClear(BUDGET_BRAKES.map((b) => b[1]))}`);
  });

  it("the walk job starts only when the budget brakes are clear", () => {
    expect(walk).toMatch(/\n {4}needs: \[debounce, budget\]\n[^\n]*\n {4}if: needs\.budget\.outputs\.brake == 'clear'\n/);
  });

  it("the mint needs all three walk brakes clear; the precheck and the walk need the mint", () => {
    expect(step(walk, "Provision + mint the synthetic cast (allowlist only)")).toContain(
      `if: ${allClear(WALK_BRAKES.map((b) => b[1]))}`,
    );
    expect(step(walk, '"Sign-up walk: no account with the synthetic address exists (else stop)"')).toContain(
      "if: steps.mint.outcome == 'success' && needs.debounce.outputs.spec == 'signup-form'",
    );
    expect(step(walk, "Walk")).toContain("if: steps.mint.outcome == 'success'");
  });

  it("every other step after the brakes is an always() clean-up or depends on the mint", () => {
    const after = walk.slice(walk.indexOf("- name: Provision + mint"));
    const steps = after.split(/\n {6}- /).slice(1);
    for (const s of steps) {
      const name = /^(?:name: )?(.+)/.exec(s)?.[1] ?? s.slice(0, 40);
      const cond = /\n {8}if: (.+)/.exec(s)?.[1] ?? "";
      expect(cond, name).toMatch(/always\(\)|steps\.mint\.outcome == 'success'/);
    }
  });
});

describe("the not-run job ends the run as CANCELLED, never as a failed or passed walk", () => {
  it("runs after both jobs whenever either recorded a refusal", () => {
    expect(notRun).toMatch(/needs: \[debounce, budget, walk\]/);
    expect(notRun).toContain(
      "if: always() && (needs.budget.outputs.brake == 'refused' || needs.walk.outputs.brake == 'refused')",
    );
  });

  it("says BLOCKED / NOT RUN and cancels this run", () => {
    expect(notRun).toContain("BLOCKED / NOT RUN");
    expect(notRun).toMatch(/gh run cancel "\$GITHUB_RUN_ID"/);
    // If the cancel does not land, the run stays red with the reason, never green.
    expect(notRun).toMatch(/sleep 300\n[^\n]*::error::[^\n]*\n\s+exit 1/);
  });

  it("is the only job with actions: write, and it never sees a secret", () => {
    expect(yml.match(/^\s+actions: write/gm)).toHaveLength(1);
    expect(notRun).toMatch(/permissions:\n {6}actions: write/);
    expect(notRun).not.toMatch(/secrets\./);
  });
});

describe("the readers treat a refused run as not run", () => {
  it("the status ledger skips cancelled runs", () => {
    const lib = readFileSync(join(REPO, ".github/scripts/status-report-lib.mjs"), "utf8");
    expect(lib).toContain('w.conclusion === "cancelled"');
  });

  it("launch-readiness counts a walk job (passed or failed) only when it reached production", () => {
    const lr = readFileSync(join(REPO, ".github/workflows/launch-readiness-walks.yml"), "utf8");
    expect(lr).toMatch(/if \[ "\$c" = failure \] \|\| \[ "\$c" = success \]; then\n\s+reached=/);
  });
});
