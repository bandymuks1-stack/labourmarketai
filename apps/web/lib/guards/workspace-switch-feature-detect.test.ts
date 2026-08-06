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

const SRC = readFileSync(
  join(__dirname, "..", "company", "organization-actions.ts"),
  "utf8",
);

describe("workspace switch tolerates the absent durable-pointer column", () => {
  it("names BOTH absence codes: Postgres 42703 and PostgREST PGRST204", () => {
    expect(SRC).toContain('const UNDEFINED_COLUMN_CODE = "42703"');
    expect(SRC).toContain('const SCHEMA_CACHE_MISS_CODE = "PGRST204"');
    expect(SRC).toMatch(/isAbsentColumn/);
  });

  it("both actions use the shared absence predicate, never the single code", () => {
    const uses = SRC.match(/isAbsentColumn\(error\.code\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    // The single-code comparison must not survive anywhere in error handling.
    expect(SRC).not.toMatch(/error\.code !== UNDEFINED_COLUMN_CODE/);
  });

  it("the not-member DB veto (42501) still rolls the pointer back", () => {
    expect(SRC).toContain('const NOT_MEMBER_CODE = "42501"');
    expect(SRC).toMatch(/NOT_MEMBER_CODE[\s\S]{0,200}jar\.delete\(ACTIVE_WORKSPACE_COOKIE\)/);
  });
});
