import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "..", "planning", "planning.ts"), "utf8");
const FN = SRC.slice(SRC.indexOf("async function readProjectItems"), SRC.indexOf("async function readAbsenceItems"));

describe("the calendar's managed-project scope follows manages_organization(), not ownership alone", () => {
  it("adds the caller's own ACTIVE manager-class memberships and engagements", () => {
    expect(FN).toMatch(/from\("company_memberships"\)/);
    expect(FN).toMatch(/\.in\("role", \["owner", "admin", "manager", "external_manager"\]\)/);
    expect(FN).toMatch(/from\("engagement_contexts"\)/);
    expect(FN).toMatch(/\.in\("relationship_slug", \["manager", "owner", "external_manager"\]\)/);
    expect(FN).toMatch(/\.eq\("status", "active"\)/);
  });

  it("reads only the caller's own rows and widens no policy or key", () => {
    expect(FN).toMatch(/\.eq\("profile_id", user\.id\)/);
    expect(FN).not.toMatch(/service_role|createAdminClient/);
  });

  it("the projects read stays under the caller's RLS (fail-closed)", () => {
    expect(FN).toMatch(/from\("projects"\)/);
    expect(FN).toMatch(/\.or\(orFilter\)/);
  });
});
