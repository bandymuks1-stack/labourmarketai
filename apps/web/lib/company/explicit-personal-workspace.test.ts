import { describe, expect, it } from "vitest";

import {
  PERSONAL_WORKSPACE_ID,
  resolveActiveOrganizationId,
  resolveActiveWorkspaceId,
  type SwitchableOrganization,
} from "@/lib/company/organization-switch";

/**
 * D-20 — AN EXPLICIT "PERSONAL" CHOICE MUST BE RESPECTED.
 *
 * THE DEFECT. "I chose personal" and "I have never chosen" were the same
 * stored state (`null`). The callers flattened an explicit personal pointer to
 * null immediately before resolution, and the single-organization default then
 * handed the person straight back to their organization. For a company identity
 * with exactly ONE organization — the ordinary employer account — selecting the
 * personal space was silently undone on the next page load, so an employer
 * could not stay in their own worker space to fill their own Work Journal.
 *
 * WHY NOTHING WENT RED. The single-org default is CORRECT and
 * `workspace-context.test.ts` asserts it. Nothing asserted that an explicit
 * choice outranks a default, because an explicit choice could not be expressed.
 *
 * The rule these cases pin: AN INFERENCE MAY FILL A GAP THE PERSON LEFT, BUT
 * MAY NEVER OVERRULE WHAT THEY ACTUALLY SAID.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const org = (id: string): SwitchableOrganization =>
  ({ id, name: `org-${id.slice(0, 4)}` }) as SwitchableOrganization;

describe("resolveActiveWorkspaceId — explicit personal outranks the single-org default", () => {
  it("THE REGRESSION: a company identity with exactly one org stays personal when it asked to", () => {
    // Before the fix this returned ORG_A: the explicit choice arrived as null
    // and the single-org rule below overruled it.
    expect(
      resolveActiveWorkspaceId("company", [ORG_A], PERSONAL_WORKSPACE_ID),
    ).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("still applies the single-org default when NOTHING was chosen", () => {
    // The default is not the bug and must survive — an absent pointer is a gap
    // the product may legitimately fill.
    expect(resolveActiveWorkspaceId("company", [ORG_A], null)).toBe(ORG_A);
  });

  it("holds for a multi-org company identity too", () => {
    expect(
      resolveActiveWorkspaceId("company", [ORG_A, ORG_B], PERSONAL_WORKSPACE_ID),
    ).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("holds for a person identity", () => {
    expect(
      resolveActiveWorkspaceId("person", [ORG_A], PERSONAL_WORKSPACE_ID),
    ).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("an explicit ORGANISATION choice is still honoured — the fix is symmetric", () => {
    // Guards against "fixing" personal by making it sticky in one direction.
    expect(resolveActiveWorkspaceId("company", [ORG_A, ORG_B], ORG_B)).toBe(
      ORG_B,
    );
  });

  it("a foreign / stale org pointer still falls back — no permission is widened", () => {
    const foreign = "33333333-3333-4333-8333-333333333333";
    expect(resolveActiveWorkspaceId("person", [ORG_A], foreign)).toBe(
      PERSONAL_WORKSPACE_ID,
    );
    // …and the sentinel is not treated as a membership id anywhere.
    expect([ORG_A]).not.toContain(PERSONAL_WORKSPACE_ID);
  });
});

describe("resolveActiveOrganizationId — the two resolvers must agree", () => {
  /**
   * Both resolvers feed the SAME screen: one decides the workspace the header
   * names, the other decides the active organization the surfaces below it use.
   * If only one honoured the explicit choice, the header would say "personal"
   * while the page beneath it still acted as the company — which is the
   * header/chat disagreement D-20 was reported as.
   */
  it("THE REGRESSION: no organization is active when personal was chosen", () => {
    // Before the fix this returned ORG_A via the single-membership default.
    expect(
      resolveActiveOrganizationId([org(ORG_A)], PERSONAL_WORKSPACE_ID),
    ).toBeNull();
  });

  it("still defaults to the single membership when nothing was chosen", () => {
    expect(resolveActiveOrganizationId([org(ORG_A)], null)).toBe(ORG_A);
  });

  it("holds with several memberships", () => {
    expect(
      resolveActiveOrganizationId(
        [org(ORG_A), org(ORG_B)],
        PERSONAL_WORKSPACE_ID,
      ),
    ).toBeNull();
  });

  it("an explicit organisation choice is still honoured", () => {
    expect(
      resolveActiveOrganizationId([org(ORG_A), org(ORG_B)], ORG_B),
    ).toBe(ORG_B);
  });

  it("the two resolvers never disagree about the same input", () => {
    // The property the screen actually depends on, asserted directly rather
    // than left to two separate expectations drifting apart.
    for (const identity of ["person", "company"] as const) {
      for (const orgs of [[ORG_A], [ORG_A, ORG_B]]) {
        const workspace = resolveActiveWorkspaceId(
          identity,
          orgs,
          PERSONAL_WORKSPACE_ID,
        );
        const activeOrg = resolveActiveOrganizationId(
          orgs.map(org),
          PERSONAL_WORKSPACE_ID,
        );
        expect(workspace).toBe(PERSONAL_WORKSPACE_ID);
        expect(activeOrg).toBeNull();
      }
    }
  });
});
