import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { demandsOfWorkspaceFilter } from "@/lib/demand/demand-org-scope";

const ME = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

describe("a workspace sees its own organization's needs", () => {
  it("the active organization, plus only my own needs with no organization yet", () => {
    expect(demandsOfWorkspaceFilter(ME, ORG_B)).toBe(
      `organization_id.eq.${ORG_B},and(organization_id.is.null,profile_id.eq.${ME})`,
    );
  });
  it("never 'anything I posted, in any organization'", () => {
    // The caller's own rows are reachable ONLY inside the "no organization" branch.
    const [top, rest] = demandsOfWorkspaceFilter(ME, ORG_B).split(",and(");
    expect(top).toBe(`organization_id.eq.${ORG_B}`);
    expect(rest).toBe(`organization_id.is.null,profile_id.eq.${ME})`);
  });
  it("a malformed id matches nothing rather than widening", () => {
    expect(demandsOfWorkspaceFilter("x", ORG_B)).toBe("id.is.null");
    expect(demandsOfWorkspaceFilter(ME, "organization_id.neq.0")).toBe("id.is.null");
  });
  it("no employer read keeps the cross-organization OR", () => {
    const APP = join(__dirname, "..", "..");
    for (const f of [
      "lib/scouting/scouting.ts",
      "lib/capabilities/employer-operations-capabilities.ts",
      "lib/capabilities/marketplace-capabilities.ts",
      "lib/market/roster-person-fit-read.ts",
    ]) {
      expect(readFileSync(join(APP, f), "utf8"), f).not.toMatch(/\.or\(`profile_id\.eq\.\$\{[^}]+\},organization_id\.eq\./);
    }
  });
});
