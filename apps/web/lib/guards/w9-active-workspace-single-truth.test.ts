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
    // RE-ANCHORED (owner program 2026-09-23): the layout asks the ONE session
    // resolution with NO identity argument. The argument keyed React's request
    // cache, so the layout ("active_role" identity), the journal ("person")
    // and the dispatcher ("company") could each resolve a different active
    // workspace in the same request. The identity that decides the single-org
    // default is now read from the session profile INSIDE the resolver.
    expect(LAYOUT).toMatch(/getWorkspaceContext\(\)/);
    // NEGATIVE CONTROL: the per-caller identity argument is gone.
    expect(LAYOUT).not.toMatch(/getWorkspaceContext\(identity\)/);
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

  it("no caller anywhere can hand the resolver an identity of its own", () => {
    // The resolver takes no parameter, so a forced "company"/"person" read —
    // the dispatcher's, the journal's, the work-log's — cannot come back.
    const resolver = code("lib/company/active-organization.ts");
    expect(resolver).toMatch(
      /export const getWorkspaceContext = cache\(async function getWorkspaceContext\(\): Promise<WorkspaceContext>/,
    );
    for (const rel of [
      "app/[locale]/dashboard/page.tsx",
      "app/[locale]/dashboard/journal/page.tsx",
      "app/[locale]/dashboard/start/page.tsx",
      // The Work door decides its branch from the one resolution (#1859 P2).
      "app/[locale]/dashboard/projects/page.tsx",
      "lib/conversation/dispatch.ts",
      "lib/conversation/worklog-engagements.ts",
      "lib/company/employer-company-context.ts",
      "lib/company/membership-actions.ts",
      "lib/ai-workspace/ai-context.ts",
      "lib/workspace/personal-workspace-intro-server.ts",
    ]) {
      const src = code(rel);
      expect(src, rel).toMatch(/getWorkspaceContext\(\)/);
      expect(src, rel).not.toMatch(/getWorkspaceContext\([^)]/);
    }
  });

  it("the owned-only reader is a PROJECTION of the one resolution now", () => {
    // `getActiveOrganizationContext` still feeds pins, starters, company
    // pages and company setup; it now reads its active id off
    // `getWorkspaceContext()` instead of resolving owned orgs on its own.
    const resolver = code("lib/company/active-organization.ts");
    const fn = resolver.slice(
      resolver.indexOf("export const getActiveOrganizationContext"),
      resolver.indexOf("const RELATIONSHIP_MAP"),
    );
    expect(fn).toMatch(/getWorkspaceContext\(\)/);
    expect(fn).not.toMatch(/resolveActiveOrganizationId\(/);
    expect(fn).not.toMatch(/from\("profiles"\)/);
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
