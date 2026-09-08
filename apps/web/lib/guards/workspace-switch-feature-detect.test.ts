import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Workspace-switch feature detection — the PGRST204 regression pin.
 *
 * PRODUCTION FINDING (PROD_QA multi-org journey, 2026-08-06): switching to an
 * organization workspace was broken in production. The switch action set the
 * `lm_active_workspace` session pointer, then UPDATEd
 * `profiles.active_organization_id` — a column the owner-gated migration
 * 20260714210000 has never applied. PostgREST reports an unknown column in an
 * UPDATE payload as its schema-cache miss `PGRST204`, NOT Postgres `42703`;
 * the action tolerated only 42703, took the generic-error path, and DELETED
 * the pointer it had just set (`lm_active_workspace=; Expires=1970` observed
 * live). Every feature-detected consumer elsewhere already tolerates the
 * pair — this file pins that organization-actions.ts does too, on BOTH
 * arms (switch and clear).
 */

// G4: the pointer UPDATE and its feature detection moved into THE shared
// workspace-switch core; the actions delegate (guarded below), so the
// regression pin follows the code.
const SRC = readFileSync(
  join(__dirname, "..", "company", "workspace-switch-core.ts"),
  "utf8",
);
const ACTIONS = readFileSync(
  join(__dirname, "..", "company", "organization-actions.ts"),
  "utf8",
);

describe("workspace switch tolerates the absent durable-pointer column", () => {
  it("names BOTH absence codes: Postgres 42703 and PostgREST PGRST204", () => {
    expect(SRC).toContain('const UNDEFINED_COLUMN_CODE = "42703"');
    expect(SRC).toContain('const SCHEMA_CACHE_MISS_CODE = "PGRST204"');
    expect(SRC).toMatch(/isAbsentColumn/);
  });

  it("the ONE pointer write uses the shared absence predicate, never the single code", () => {
    expect(SRC).toMatch(/isAbsentColumn\(error\.code\)/);
    // The single-code comparison must not survive anywhere in error handling.
    expect(SRC).not.toMatch(/error\.code !== UNDEFINED_COLUMN_CODE/);
    // BOTH actions run through the core — no second copy of the UPDATE
    // (and no second place for the 2026-08-06 regression to come back).
    const delegations = ACTIONS.match(/switchActiveWorkspaceCore\(/g) ?? [];
    expect(delegations.length).toBeGreaterThanOrEqual(2);
    expect(ACTIONS).not.toMatch(/from\("profiles"\)/);
  });

  it("the not-member DB veto (42501) can never leave a stale pointer", () => {
    expect(SRC).toContain('const NOT_MEMBER_CODE = "42501"');
    // The core refuses BEFORE the action writes the cookie: in the org-switch
    // arm the cookie is set only after the core answered ok/needs-migration,
    // so there is nothing to roll back on a DB veto.
    const switchArm = ACTIONS.slice(
      ACTIONS.indexOf("export async function switchActiveOrganization"),
      ACTIONS.indexOf("export async function clearActiveOrganization"),
    );
    expect(switchArm.indexOf("switchActiveWorkspaceCore")).toBeGreaterThan(-1);
    expect(switchArm.indexOf("switchActiveWorkspaceCore")).toBeLessThan(
      switchArm.indexOf("jar.set(ACTIVE_WORKSPACE_COOKIE"),
    );
  });
});
