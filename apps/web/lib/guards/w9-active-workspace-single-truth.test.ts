import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PERSONAL_WORKSPACE_ID,
  resolveActiveOrganizationId,
  resolveActiveWorkspaceId,
} from "@/lib/company/organization-switch";

/**
 * W9 — ONE acting context, ONE answer.
 *
 * The dashboard layout resolved "which organization is active" TWICE from
 * two different readers:
 *
 *   the workspace chip   ← `getWorkspaceContext()`  — owned orgs
 *                                                    + company_memberships
 *                                                    + engagement_contexts
 *   the role switcher /  ← `getActiveOrganizationContext()` — owned orgs ONLY,
 *   chat result context     falling back to `getOwnCompany()`
 *                           (`companies.profile_id = auth.uid()`), the
 *                           single-company-per-person assumption the
 *                           multi-org train removed.
 *
 * For a person who MANAGES an organization they do not own, the owned-only
 * reader does not merely come up empty — it names the WRONG organization,
 * because `resolveActiveOrganizationId` falls through a pointer it cannot
 * see to the caller's single owned org. The chip said one name and the role
 * switcher said another, for the same session.
 *
 * The layout now derives the name, the id and the switchable list from the
 * SAME workspace context the chip renders. This guard pins that, and pins
 * the resolver behaviour that made the old shape wrong so it cannot be
 * reintroduced as a "harmless fallback".
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const LAYOUT = code("app/[locale]/dashboard/layout.tsx");

describe("W9 — the layout has ONE source for the active organization", () => {
  it("neither owned-only reader is used there any more", () => {
    expect(LAYOUT).not.toMatch(/getOwnCompany/);
    expect(LAYOUT).not.toMatch(/getActiveOrganizationContext/);
  });

  it("the name, the id and the list all come from the workspace context", () => {
    expect(LAYOUT).toMatch(/getWorkspaceContext\(identity\)/);
    expect(LAYOUT).toMatch(
      /workspace\.workspaces\.filter\(\s*\(w\) => w\.kind === "organization"/,
    );
    expect(LAYOUT).toMatch(/w\.id === workspace\.activeWorkspaceId/);
    // One derivation feeds all three props — not three lookups that can drift.
    expect(LAYOUT).toMatch(/activeOrgName[^=]*=\s*activeWorkspace\?\.name/);
    expect(LAYOUT).toMatch(/activeOrganizationId[^=]*=\s*activeWorkspace\?\.id/);
  });

  it("the workspace context is read exactly once", () => {
    expect((LAYOUT.match(/getWorkspaceContext\(/g) ?? []).length).toBe(1);
  });
});

describe("W9 — why the owned-only reader could not be kept as a fallback", () => {
  // The fixture the browser proof uses: the caller OWNS one organization and
  // is an active manager of another, and has switched to the one they manage.
  const OWNED_ONLY = [{ id: "agency-org", name: "—" }];
  const MEMBER_ORG = "managed-org";

  it("it silently names the WRONG organization for a member pointer", () => {
    // The pointer is valid — the person really is a member of `managed-org` —
    // but this reader cannot see membership rows, so the pointer looks stale
    // and the single owned org wins. Not an empty state: a wrong one.
    const resolved = resolveActiveOrganizationId(OWNED_ONLY, MEMBER_ORG);
    expect(resolved).toBe("agency-org");
    expect(resolved).not.toBe(MEMBER_ORG);
  });

  it("the workspace resolver, given the same pointer and the FULL set, is right", () => {
    const all = ["agency-org", MEMBER_ORG];
    expect(resolveActiveWorkspaceId("company", all, MEMBER_ORG)).toBe(MEMBER_ORG);
  });

  it("and it still fails closed on a genuinely invalid pointer", () => {
    // The fix widens the SET of organizations, never the validation: a
    // pointer at an org the person has no relationship with is still refused.
    expect(
      resolveActiveWorkspaceId("company", ["a", "b"], "not-a-member-org"),
    ).toBe(PERSONAL_WORKSPACE_ID);
  });
});
