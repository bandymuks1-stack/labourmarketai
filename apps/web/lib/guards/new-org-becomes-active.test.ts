import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Context continuity: a person who creates an organization is working in it.
 * The resolver's single-organization default ends at the second organization
 * (an employer elsewhere, a brigade), so every creation path pins the new or
 * originating workspace through the switcher's validated core.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, "..", "..", rel), "utf8");

describe("creating an organization keeps the person in a working context", () => {
  it("company setup pins the new company's organization", () => {
    const s = read("lib/company/setup-actions.ts");
    expect(s).toMatch(/legacyCompanyId === r\.companyId[\s\S]{0,200}switchActiveWorkspaceCore\(\{ supabase, userId: user\.id \}, orgId\)/);
  });
  it("only the switcher's core writes the pointer (no direct profiles update here)", () => {
    expect(read("lib/company/setup-actions.ts")).not.toMatch(/active_organization_id/);
  });
});
