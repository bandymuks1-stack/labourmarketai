import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE COMPANY NEEDS LIST IS THE ACTIVE WORKSPACE'S (audit 2026-10-20).
 * listOwnCustomerRequests filtered by the caller only: a person running two
 * companies saw company A's needs while working in company B. The employer
 * read now applies the same organization filter scouting, the usage meter
 * and the employer capabilities use.
 */
const src = readFileSync(resolve(__dirname, "..", "buyer", "customer-requests.ts"), "utf8");

describe("company needs list is scoped to the active workspace", () => {
  const fn = src.slice(src.indexOf("export async function listOwnCustomerRequests"), src.indexOf("export async function saveCustomerRequest"));
  it("takes the workspace from the ONE employer resolver", () => {
    expect(fn).toMatch(/workspaceOrganizationId = employer\.organizationId;/);
  });
  it("filters by the shared demand workspace filter", () => {
    expect(src).toContain('import { demandsOfWorkspaceFilter } from "@/lib/demand/demand-org-scope";');
    expect(fn).toMatch(/if \(workspaceOrganizationId\) \{\s*query = query\.or\(demandsOfWorkspaceFilter\(user\.id, workspaceOrganizationId\)\);/);
  });
});
