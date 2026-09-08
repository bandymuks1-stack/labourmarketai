import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard for 20260901140000_labour_economics_metric_widening_v1.
 *
 * `market_intelligence_sources.import_policy->'metric_keys'` is a FAIL-CLOSED
 * allowlist. Widening it is the one thing that makes the labour-economics spec
 * live, so the two ways it could go wrong are worth pinning:
 *
 *   1. `productivity.value_to_cost_ratio` drifts onto the `eurostat` row.
 *      That ratio is DERIVED by this platform from two Eurostat figures —
 *      Eurostat does not publish it. Attributing it to Eurostat would be a
 *      false source claim on a page whose whole promise is "every figure links
 *      to its official source". It belongs to internal_platform_aggregates.
 *   2. The migration grows past a permission change into an actual import, or
 *      into schema/grant work. Widening an allowlist must import nothing.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260901140000_labour_economics_metric_widening_v1.sql",
);
const ROLLBACK = join(
  REPO_ROOT,
  "supabase",
  "rollbacks",
  "20260901140000_labour_economics_metric_widening_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");

/** Statement text with `--` comments stripped, so prose never satisfies a check. */
function statements(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const body = statements(sql);
const downBody = statements(down);

/** The slice of the statement text that updates one source row. */
function armFor(text: string, sourceKey: string): string {
  const arms = text.split(/update\s+public\.market_intelligence_sources/i).slice(1);
  const arm = arms.find((a) => a.includes(`'${sourceKey}'`));
  expect(arm, `no update arm found for ${sourceKey}`).toBeTruthy();
  return arm as string;
}

const EUROSTAT_KEYS = [
  "labour.cost_level_hour",
  "labour.wage_level_hour",
  "productivity.value_per_hour",
  "productivity.value_per_person",
  "labour.unit_labour_cost",
];
const DERIVED_KEY = "productivity.value_to_cost_ratio";

describe("the widening adds exactly the six approved keys", () => {
  it("adds the five published Eurostat metrics to the eurostat source", () => {
    const arm = armFor(body, "eurostat");
    for (const key of EUROSTAT_KEYS) expect(arm).toContain(key);
  });

  it("puts the DERIVED ratio on internal_platform_aggregates, never Eurostat", () => {
    expect(armFor(body, "internal_platform_aggregates")).toContain(DERIVED_KEY);
  });

  it("the eurostat arm does NOT claim the derived ratio", () => {
    // The false-attribution guard. Eurostat does not publish this ratio.
    expect(armFor(body, "eurostat")).not.toContain(DERIVED_KEY);
  });
});

describe("a permission change imports nothing and touches no structure", () => {
  it("writes no observation row", () => {
    expect(body).not.toMatch(/insert\s+into\s+public\.market_intelligence_observations/i);
    expect(body).not.toMatch(/\binsert\s+into\b/i);
  });

  it("creates, drops and grants nothing", () => {
    for (const forbidden of [
      /\bcreate\s+table\b/i,
      /\bcreate\s+or\s+replace\s+function\b/i,
      /\bcreate\s+policy\b/i,
      /\bdrop\b/i,
      /\bgrant\b/i,
      /\brevoke\b/i,
      /\balter\s+table\b/i,
      /\bdelete\s+from\b/i,
    ]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it("only ever touches market_intelligence_sources", () => {
    const updated = [...body.matchAll(/update\s+public\.(\w+)/gi)].map((m) => m[1]);
    expect(new Set(updated)).toEqual(new Set(["market_intelligence_sources"]));
  });

  it("is idempotent — keys are de-duplicated rather than appended blindly", () => {
    // `jsonb_agg(distinct …)` is what makes a re-run (or a clean db reset)
    // converge instead of growing duplicates in the array.
    expect(body).toMatch(/jsonb_agg\(distinct/i);
  });

  it("carries the human-gate marker, because policy DML is RED by route", () => {
    expect(sql).toContain("@human-gate-approved");
  });
});

describe("the rollback removes exactly those six keys and no data", () => {
  it("strips all five Eurostat keys", () => {
    const arm = armFor(downBody, "eurostat");
    for (const key of EUROSTAT_KEYS) expect(arm).toContain(key);
  });

  it("strips the derived ratio from internal_platform_aggregates", () => {
    expect(armFor(downBody, "internal_platform_aggregates")).toContain(DERIVED_KEY);
  });

  it("never deletes already-imported observations — that history stands", () => {
    expect(downBody).not.toMatch(/\bdelete\s+from\b/i);
    expect(down).toMatch(/does NOT delete observations/i);
  });
});
