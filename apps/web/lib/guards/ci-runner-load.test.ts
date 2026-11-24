import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RUNNER LOAD (2026-11-24). The account's concurrent-job limit was saturated
 * (98 queued, 15 running) and the production deploy waited 17+ minutes for a
 * runner. 88 % of the 167 open pull requests were drafts, and 20 of the 23
 * queued journey walks were on drafts. A draft cannot merge, so the heavy,
 * non-required checks wait until the PR is marked ready for review.
 *
 * The REQUIRED checks (`quality`, `migration-safety`) are untouched: they still
 * run on every pull request, draft or not. `core-journeys` is never green on a
 * draft — it says the walk did not run — because a skipped job would count as
 * passed for a required check.
 */
const WF = join(__dirname, "..", "..", "..", "..", ".github/workflows");
const read = (f: string) => readFileSync(join(WF, f), "utf8").replace(/\r/g, "");
const on = (s: string) => s.slice(s.indexOf("\non:"), s.indexOf("\npermissions:"));
const TYPES = "  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\n";
const GATE = "if: github.event_name != 'pull_request' || github.event.pull_request.draft == false";

describe("heavy non-required checks skip draft pull requests and run when one is marked ready", () => {
  it.each([
    ["e2e-smoke.yml", "e2e-smoke"],
    ["codeql.yml", "analyze"],
    ["mobile.yml", "mobile"],
  ])("%s: job %s", (file, job) => {
    const s = read(file);
    expect(on(s)).toContain(TYPES);
    // no path or branch filter on pull_request (the repository's earlier lessons)
    const pr = on(s).slice(on(s).indexOf("\n  pull_request:"));
    const prBlock = pr.slice(0, (pr.slice(1).search(/\n {2}\S/) + 1) || undefined);
    expect(prBlock).not.toMatch(/\n {4}(paths|branches):/);
    const j = s.slice(s.indexOf(`\n  ${job}:\n`));
    expect(j.slice(0, 400)).toContain(GATE);
  });

  it("signup-isolated: the filter does not walk a draft, and core-journeys is red on it, never green", () => {
    const s = read("signup-isolated.yml");
    expect(on(s)).toContain(TYPES);
    expect(s).toMatch(/if \[ "\$DRAFT" = "true" \]; then\n\s+echo "run=false" >> "\$GITHUB_OUTPUT"; echo "draft=true" >> "\$GITHUB_OUTPUT"/);
    const gate = s.slice(s.indexOf("\n  core-journeys:"));
    expect(gate).toMatch(/if \[ "\$DRAFT" = "true" \]; then echo "::error::DRAFT: [^"]*"; exit 1; fi/);
    // the draft check comes before the "not needed" pass
    expect(gate.indexOf('"$DRAFT" = "true"')).toBeLessThan(gate.indexOf('"$RUN" != "true"'));
  });

  it("the required checks still run on every pull request, drafts included", () => {
    for (const f of ["quality.yml", "migration-safety.yml"]) {
      const s = read(f);
      expect(on(s), f).not.toMatch(/types:/);
      expect(s, f).not.toMatch(/pull_request\.draft/);
    }
  });
});
