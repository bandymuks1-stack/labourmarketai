/**
 * DAILY FRESHNESS CONTRACT (owner decision 2026-10-09): one complete update cycle
 * per 24 h for each of NAV and Sweden, measured separately, alerting once per
 * incident, recovering through each source's OWN existing workflow.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WF = join(__dirname, "..", "..", "..", "..", ".github", "workflows");
const read = (f: string) => readFileSync(join(WF, f), "utf8");

describe("ingestion-freshness workflow", () => {
  const yml = read("ingestion-freshness.yml");

  it("measures NAV and Sweden separately and independently (own leg, label, workflow)", () => {
    expect(yml).toMatch(/fail-fast: false/);
    expect(yml).toMatch(/provider_key: nav[\s\S]*workflow: nav-supply-cadence\.yml/);
    expect(yml).toMatch(/provider_key: arbetsformedlingen[\s\S]*workflow: sweden-supply-cadence\.yml/);
    expect(yml).toMatch(/LABEL="freshness-\$SOURCE"/);
  });

  it("uses the 24 h target with the 2 h cron-throttle margin", () => {
    expect(yml).toMatch(/STALE_AFTER_S=\$\(\( 26 \* 3600 \)\)/);
  });

  it("alerts once per incident, recovers via the source's own workflow, with bounded re-dispatch", () => {
    expect(yml).toMatch(/gh issue list --label "\$LABEL" --state open/);
    expect(yml).toMatch(/gh issue close/);
    expect(yml).toMatch(/status=="queued" or \.status=="in_progress"/);
    expect(yml).toMatch(/REDISPATCH_AFTER_S=\$\(\( 2 \* 3600 \)\)/);
    expect(yml).toMatch(/gh workflow run "\$WORKFLOW" \$DISPATCH_ARGS/);
  });

  it("honours the kill switches and holds only the default token's actions/issues write", () => {
    expect(yml).toMatch(/VACANCY_SCHEDULE_ENABLED/);
    expect(yml).toMatch(/VACANCY_SOURCE_NAV_ENABLED/);
    expect(yml).toMatch(/VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED/);
    expect(yml).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*actions: write\s*\n\s*issues: write/);
    expect(yml).not.toMatch(/contents: write|pull-requests: write/);
  });

  it("is read-only against production data (one GET on the cursor table)", () => {
    expect(yml).toMatch(/rest\/v1\/vacancy_import_cursors\?provider_key=eq\.\$PROVIDER_KEY/);
    expect(yml).not.toMatch(/-X (POST|PATCH|DELETE)/);
  });
});

describe("daily schedules", () => {
  it("NAV and Sweden run a few scheduled sessions a day, never a sub-hour poll", () => {
    for (const f of ["nav-supply-cadence.yml", "sweden-supply-cadence.yml"]) {
      const crons = [...read(f).matchAll(/^\s*- cron: "([^"]+)"/gm)].map((m) => m[1]);
      expect(crons.length).toBe(1);
      expect(crons[0]).toMatch(/^\d+ [\d,]+ \* \* \*$/);
      expect(crons[0]!.split(" ")[1]!.split(",").length).toBeLessThanOrEqual(6);
    }
  });
});
