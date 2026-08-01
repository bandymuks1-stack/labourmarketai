/**
 * Source-level guards for fix/pilot-ready-stability-trust-sprint Phase 3
 * (small perf fixes only).
 *
 * The dashboard layout and dashboard/profile pages each previously
 * issued the bulk of their independent SSR reads sequentially. The fix
 * groups them under `Promise.all` so the round trips overlap —
 * measurable win on the slowest authenticated paths, zero behaviour
 * change. (The dashboard-overview guard died with its page: W3 Package 4
 * deleted the /dashboard/advanced second dashboard.)
 *
 * Lock the parallelization shape so a future edit can't accidentally
 * de-parallelize back to a serial chain (the historic "feels slow"
 * regression mode).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: dashboard layout parallelizes profile + profile_roles reads", () => {
  const layout = read("app/[locale]/dashboard/layout.tsx");

  it("uses Promise.all for the two independent reads", () => {
    // Wagon 2: the profiles row now comes from the request-cached
    // getSessionProfile() reader (shared with the page and the hub) — it must
    // still run INSIDE the same Promise.all as profile_roles, and the reader
    // itself must be the one doing the profiles SELECT.
    // P0 perf v1: the roles read is now a promise chained off the memoized
    // getUser (so it can join the SAME batch without a serial user await);
    // the batch must still contain the session-profile reader AND that
    // roles promise — one parallel stage, no waterfall.
    expect(layout).toMatch(
      /const rolesPromise[\s\S]{0,400}from\(["']profile_roles["']\)/,
    );
    expect(layout).toMatch(
      /Promise\.all\(\s*\[[\s\S]{0,200}getSessionProfile\(\)[\s\S]{0,200}rolesPromise/,
    );
    const reader = read("lib/auth/session-profile.ts");
    expect(reader).toMatch(/cache\(/);
    expect(reader).toMatch(/from\(["']profiles["']\)/);
  });

  it("does NOT await profiles before awaiting profile_roles", () => {
    // Old serial shape: `const { data: profile } = await supabase.from('profiles')...; const { data: rolesRows } = await supabase.from('profile_roles')...`
    expect(layout).not.toMatch(
      /const\s*\{\s*data:\s*profile\s*\}\s*=\s*await\s+supabase[\s\S]{0,500}const\s*\{\s*data:\s*rolesRows\s*\}\s*=\s*await\s+supabase/,
    );
  });
});

describe("Guard: dashboard/profile parallelizes top-level reads", () => {
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("uses Promise.all for profile + claims + profile_roles + workers + professions", () => {
    expect(page).toMatch(
      /Promise\.all\(\s*\[[\s\S]{0,2500}from\(["']profiles["']\)[\s\S]{0,2500}listProfileSkillClaims\(\)[\s\S]{0,2500}from\(["']profile_roles["']\)[\s\S]{0,2500}from\(["']workers["']\)[\s\S]{0,2500}from\(["']professions["']\)/,
    );
  });

  it("does NOT await profiles before awaiting profile_roles serially", () => {
    // Catch the historic serial chain. The new code reads profileRes/rolesRowsRes.data after Promise.all resolves.
    expect(page).not.toMatch(
      /const\s*\{\s*data:\s*profile\s*\}\s*=\s*await\s+supabase\.from\(["']profiles["']\)[\s\S]{0,800}const\s*\{\s*data:\s*roleRows\s*\}\s*=\s*await\s+supabase\.from\(["']profile_roles["']\)/,
    );
  });
});
