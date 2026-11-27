import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE RE-WALK CHAIN SURVIVES A BRAKE REFUSAL (owner P0 2026-11-24).
 *
 * Tick 45419028892 dispatched company-governance at 14:54; the deploy brake
 * refused it (a deploy was running), and since #3770 a refusal is recorded as
 * BLOCKED / NOT RUN by prod-qa-walk's `not-run` job instead of a failed brake
 * step. The tick looked for the first failed step, found that job's step, did
 * not recognise a brake and left the retry to GitHub's cron — which did not
 * fire. Now the tick itself waits for a quiet production and walks the pair
 * again, then hands over, so the chain never depends on cron. Every brake of
 * prod-qa-walk.yml still applies to the new run.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const wf = readFileSync(join(REPO, ".github/workflows/launch-readiness-walks.yml"), "utf8");

describe("a refused walk is retried by the tick itself", () => {
  it("recognises the refusal by prod-qa-walk's not-run job and an unreached Provision, not by a step name", () => {
    expect(wf).toContain('select(.name == "not-run" and .conclusion != "skipped")');
    expect(wf).toMatch(/if \[ "\$walk" = refused \] && \[ "\$\{notrun:-0\}" -gt 0 \]; then/);
    expect(wf).not.toMatch(/case "\$brake" in/);
  });

  it("waits, bounded to 30 one-minute polls, on the same deploy brake prod-qa-walk uses", () => {
    expect(wf).toMatch(/for _ in \$\(seq 1 30\); do\n\s+if GITHUB_REPOSITORY="\$REPO" node \.github\/scripts\/walk-brakes\.mjs deploy [^\n]*; then quiet=1; break; fi\n\s+sleep 60\n\s+done/);
    expect(wf).toMatch(/sparse-checkout: \.github\/scripts/);
  });

  it("then dispatches the same pair once and hands over to a fresh tick", () => {
    const refusal = wf.slice(wf.indexOf('if [ "$walk" = refused ]'), wf.indexOf('case "$walk" in'));
    expect(refusal.match(/dispatch_and_wait/g)).toHaveLength(1);
    expect(refusal).toMatch(/handover\n\s+exit 0/);
  });

  it("is bounded per pair and day, and never retries a budget refusal", () => {
    expect(wf).toMatch(/if \[ "\$refused_today" -ge 12 \]; then/);
    expect(wf).toMatch(/the 24 h budget or a setup failure\); the schedule retries/);
  });

  it("still passes nothing but spec and device, never an override", () => {
    expect(wf).toMatch(/gh workflow run prod-qa-walk\.yml -R "\$REPO" --ref main -f spec="\$spec" -f device="\$device"\n/);
    expect(wf).not.toMatch(/-f budget_override/);
  });

  it("has room for a refused run, the wait and one more walk", () => {
    expect(wf).toMatch(/timeout-minutes: 150/);
  });
});
