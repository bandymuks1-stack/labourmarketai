import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NO PRODUCTION WALK LEAVES A SYNTHETIC NEED OPEN (owner order 2026-11-22).
 *
 * 15 synthetic needs, left open by walks that stopped before their own close,
 * stood on the open agency board where real agencies saw them. A walk's
 * inline close runs only when every step before it passes, so:
 *
 * 1. every `prod-*.spec.ts` that can post a need — the demand intake's
 *    `demand-create`, the buyer request's `buyer-requests-submit`, the MCP
 *    `demand_create_confirm` tool — sweeps in a `test.afterAll` (Playwright
 *    runs it when a test failed) through the shared
 *    `closeOpenSyntheticNeedsOrFail`;
 * 2. the shared sweep closes through the product's own close RPC with each
 *    synthetic person's OWN token: no delete, no service role;
 * 3. the workflow sweeps again in an `if: always()` step before the sessions
 *    are revoked (a cancel or a timeout runs no hook).
 */
const WEB = resolve(__dirname, "..", "..");
const E2E = resolve(WEB, "tests", "e2e");
const read = (rel: string) => readFileSync(resolve(WEB, rel), "utf8");

const NEED_CREATING = [
  /getByTestId\("demand-create"\)/,
  /getByTestId\("buyer-requests-submit"\)/,
  /"demand_create_confirm"/,
];

describe("production walks never leave a synthetic need open", () => {
  const walks = readdirSync(E2E).filter((f) => /^prod-.*\.spec\.ts$/.test(f));

  it("finds the need-creating walks (the guard is not vacuous)", () => {
    const creating = walks.filter((f) => NEED_CREATING.some((re) => re.test(readFileSync(resolve(E2E, f), "utf8"))));
    expect(creating.length).toBeGreaterThanOrEqual(10);
  });

  it("every walk that can post a need sweeps in an afterAll", () => {
    const missing: string[] = [];
    for (const f of walks) {
      const src = readFileSync(resolve(E2E, f), "utf8");
      if (!NEED_CREATING.some((re) => re.test(src))) continue;
      const imports = /import \{[^}]*\bcloseOpenSyntheticNeedsOrFail\b[^}]*\} from "\.\/prod-synthetic-needs";/.test(src);
      const hook = /test\.afterAll\(async \(\) => \{\s*test\.setTimeout\(\d+_000\);\s*await closeOpenSyntheticNeedsOrFail\("[a-z0-9-]+"\);\s*\}\);/.test(src);
      if (!imports || !hook) missing.push(f);
    }
    expect(missing).toEqual([]);
  });

  it("the sweep closes through the product's close RPC with the person's own token — no delete, no service role", () => {
    const sweep = read("tests/e2e/prod-synthetic-needs.ts");
    expect(sweep).toContain('qaApi("/rest/v1/rpc/close_demand_v1", token, { method: "POST", body: { p_request_id: id } })');
    expect(sweep).toMatch(/status=eq\.submitted/);
    expect(sweep).toMatch(/profile_id=eq\./);
    expect(sweep).not.toMatch(/method: "DELETE"|SERVICE_ROLE|service_role/);
    expect(sweep).toMatch(/bearerOf\(slot\)/);
  });

  it("the workflow sweeps in an always() step before the sessions are revoked", () => {
    const wf = readFileSync(resolve(WEB, "..", "..", ".github", "workflows", "prod-qa-walk.yml"), "utf8");
    const sweep = wf.indexOf("- name: Close every open synthetic need (always)");
    const revoke = wf.indexOf("- name: Revoke and delete the synthetic sessions");
    expect(sweep).toBeGreaterThan(0);
    expect(sweep).toBeLessThan(revoke);
    const step = wf.slice(sweep, revoke);
    expect(step).toMatch(/if: always\(\) && steps\.mint\.outcome == 'success'/);
    expect(step).toContain("pnpm exec tsx scripts/prod-qa-close-synthetic-needs.ts");
    expect(step).not.toMatch(/SERVICE_ROLE/);
  });
});
