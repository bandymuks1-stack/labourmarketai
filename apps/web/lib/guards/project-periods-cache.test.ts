import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const map = readFileSync(join(__dirname, "..", "projects", "map.ts"), "utf8");

/**
 * The projects page remembers documented periods for 2 minutes (perf,
 * 2026-10-19). Evidence is RLS-protected by who manages an organization, so a
 * remembered answer must never outlive a change of the viewer's access.
 */
describe("documented-period cache never outlives a change of access", () => {
  it("the key carries the viewer, workspace, project set AND an access fingerprint", () => {
    expect(map).toMatch(/const viewerKey = `\$\{user\.id\}\|\$\{jar\.get\(ACTIVE_WORKSPACE_COOKIE\)\?\.value \?\? "-"\}\|\$\{setKey\}\|\$\{access\}`/);
  });

  it("the fingerprint covers memberships, management contexts and platform roles with their updated_at", () => {
    expect(map).toContain('.from("company_memberships").select("organization_id, role, status, updated_at")');
    expect(map).toContain('.select("organization_id, relationship_slug, status, updated_at")');
    expect(map).toContain('.from("profile_roles").select("role, is_active")');
  });

  it("no fingerprint → no cache; a failed read is never remembered", () => {
    expect(map).toMatch(/if \(!access\) return load\(\);/);
    expect(map).toMatch(/\(read\) => read\.kind === "ok"/);
  });
});
