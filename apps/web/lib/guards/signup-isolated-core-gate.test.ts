import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signupIsolatedRunsFor } from "./signup-isolated-trigger";

/**
 * CORE-JOURNEY GATE (owner order 2026-11-23, regression protection inside the
 * existing CI). `signup-isolated.yml` used to run only for a list of paths, so
 * a PR that changed shared components, navigation, auth, data or an API could
 * merge without one journey being walked. Now:
 *   - it runs on EVERY pull request, and a `changes` job decides whether the
 *     journeys are needed (web app, database, shared packages, lockfile);
 *   - the walk is split into two fixed shards that stay inside the 60-minute
 *     job budget;
 *   - `core-journeys` always reports, so it can be the one required check.
 */

const repo = join(__dirname, "..", "..", "..", "..");
const wf = readFileSync(join(repo, ".github/workflows/signup-isolated.yml"), "utf8");

function list(name: string): string[] {
  const m = wf.match(new RegExp(`\\n {6}${name}: (.+)\\n`));
  if (!m) throw new Error(`${name} missing`);
  return m[1].trim().split(/\s+/);
}

/** One spec per role journey (coordinator's core subset, 2026-11-23). */
const CORE = [
  "signup-isolated", // worker sign-up
  "role-journeys-isolated",
  "hiring-chain-isolated",
  "journal-reach-isolated",
  "employer-journey-isolated", // employer
  "agency-roles-isolated", // agency
  "recognition-chain-isolated", // student and institution
  "training-groups-isolated",
  "phone-journeys-isolated", // navigation
  "phone-header-fit-isolated",
  "header-desktop-fit-isolated",
];

describe("signup-isolated runs the core journeys on every relevant pull request", () => {
  it("the pull_request trigger has no path list", () => {
    const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
    expect(on).toMatch(/\n {2}pull_request:\n/);
    expect(on).not.toMatch(/paths:/);
  });

  it("the change filter covers the web app, the database and the shared packages, not markdown", () => {
    for (const p of [
      "apps/web/components/layouts/site-nav.tsx",
      "apps/web/lib/auth/actions.ts",
      "apps/web/app/api/mcp/route.ts",
      "apps/web/messages/lt.json",
      "supabase/migrations/20990101000000_example.sql",
      "packages/client-core/src/index.ts",
      "pnpm-lock.yaml",
      ".github/workflows/signup-isolated.yml",
    ]) {
      expect(signupIsolatedRunsFor(wf, p), p).toBe(true);
    }
    for (const p of ["docs/architecture/TECHNICAL_ARCHITECTURE_MAP.md", "apps/web/README.md", "apps/mobile/app.json"]) {
      expect(signupIsolatedRunsFor(wf, p), p).toBe(false);
    }
  });

  it("the filter never pipes into grep -q (SIGPIPE under pipefail would skip a large change)", () => {
    const step = wf.slice(wf.indexOf("id: filter"), wf.indexOf("\n  signup-isolated:"));
    expect(step).toMatch(/set -euo pipefail/);
    expect(step).not.toMatch(/\|\s*grep -q/);
    expect(step).not.toMatch(/\\\n\s*\|\s*grep/);
  });

  it("the walk needs the filter, runs in two shards and fails one shard without cancelling the other", () => {
    expect(wf).toMatch(/signup-isolated:\n {4}needs: changes\n {4}if: needs\.changes\.outputs\.run == 'true'/);
    expect(wf).toMatch(/fail-fast: false\n\s+matrix:\n\s+shard: \[1, 2\]/);
    expect(wf).toMatch(/timeout-minutes: 60/);
  });

  it("the two shard lists are disjoint and every core journey is in one of them", () => {
    const one = list("SPEC_1");
    const two = list("SPEC_2");
    const p0 = list("SPEC_P0");
    const all = [...one, ...two, ...p0];
    expect(new Set(all).size).toBe(all.length);
    for (const c of CORE) {
      expect(all, c).toContain(`tests/e2e/${c}.spec.ts`);
    }
    // Every listed spec exists.
    for (const s of all) expect(() => readFileSync(join(repo, "apps/web", s)), s).not.toThrow();
    // The run step walks shard 1 alone and shard 2 with the P0 walks.
    expect(wf).toMatch(/then set -- \$SPEC_1; else set -- \$SPEC_2 \$SPEC_P0; fi/);
  });

  it("the compatibility walk runs in the shard whose stack job-fit-evidence migrated", () => {
    expect(list("SPEC_2")).toContain("tests/e2e/job-fit-evidence-isolated.spec.ts");
    expect(wf).toMatch(/App-rollback compatibility[^\n]*\n {8}if: matrix\.shard == 2/);
    expect(wf).toMatch(/Run the compatibility walk[^\n]*\n {8}if: matrix\.shard == 2/);
  });

  it("artifacts carry the shard, so two shards never write one name", () => {
    for (const n of ["experience-integration", "cv-shown-twice", "journal-day-choice"]) {
      expect(wf).toContain(`name: ${n}-shard-\${{ matrix.shard }}`);
    }
  });

  it("core-journeys always reports and fails unless the needed walk passed", () => {
    const gate = wf.slice(wf.indexOf("\n  core-journeys:"));
    expect(gate).toMatch(/if: always\(\)/);
    expect(gate).toMatch(/needs: \[changes, signup-isolated\]/);
    expect(gate).toMatch(/if \[ "\$CHANGES" != "success" \]; then [^\n]*exit 1; fi/);
    expect(gate).toMatch(/if \[ "\$RUN" != "true" \]; then [^\n]*exit 0; fi/);
    expect(gate).toMatch(/if \[ "\$WALK" != "success" \]; then [^\n]*exit 1; fi/);
  });

  it("still reads no secret", () => {
    expect(wf).not.toMatch(/\$\{\{\s*secrets\./);
  });
});
