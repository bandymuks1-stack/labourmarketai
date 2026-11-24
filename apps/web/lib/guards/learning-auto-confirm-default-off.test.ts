import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 learning — auto-confirmation DEFAULT-OFF guard.
 *
 * The optional company-manager auto-confirmation policy must be OFF unless a
 * manager explicitly enables it, and enabling must be attributed (enabled_by /
 * enabled_at). This pins those invariants in the migration + server action.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

describe("auto-confirmation policy is default OFF and attributable", () => {
  const mig = read(
    join(REPO, "supabase", "migrations", "20260627132759_human_in_loop_learning.sql"),
  ).toLowerCase();
  const server = read(join(ROOT, "lib", "learning", "learning.ts"));

  it("the policy column defaults to false", () => {
    expect(mig).toMatch(/enabled\s+boolean\s+not null\s+default false/);
  });

  it("the migration never inserts an enabled policy row (no seeded ON policy)", () => {
    expect(mig).not.toMatch(/insert into public\.learning_policy_settings/);
  });

  it("the migration records who enabled/disabled a policy", () => {
    expect(mig).toMatch(/enabled_by\s+uuid/);
    expect(mig).toMatch(/enabled_at\s+timestamptz/);
    expect(mig).toMatch(/disabled_by\s+uuid/);
    expect(mig).toMatch(/disabled_at\s+timestamptz/);
  });

  it("enabling the policy server-side attributes the enabling manager", () => {
    // setAutoConfirmPolicy stamps enabled_by/enabled_at only on the enable path.
    expect(server).toMatch(/enabled_by: user\.id/);
    expect(server).toMatch(/input\.enabled\s*\?/);
  });
});
