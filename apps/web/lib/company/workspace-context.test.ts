import { describe, expect, it } from "vitest";

import {
  PERSONAL_WORKSPACE_ID,
  WORKSPACE_ACCENT_COUNT,
  resolveActiveWorkspaceId,
  workspaceAccentIndex,
} from "@/lib/company/organization-switch";

/**
 * Workspace-context pure logic (real-user workflow rebuild W1).
 *
 * The workspace is ONLY the active work context — resolution must be
 * membership-validated, identity-aware and deterministic:
 *   - person identity defaults to the PERSONAL workspace;
 *   - company identity keeps the historical first-org fallback;
 *   - a stored pointer wins only when it matches a real membership;
 *   - the accent hue for an org is a pure function of its id (same org →
 *     same hue, everywhere, forever).
 */

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

describe("resolveActiveWorkspaceId", () => {
  it("person identity with no pointer → personal workspace", () => {
    expect(resolveActiveWorkspaceId("person", [ORG_A, ORG_B], null)).toBe(
      PERSONAL_WORKSPACE_ID,
    );
  });

  it("company identity + SEVERAL orgs + no pointer → Personal, FAIL CLOSED (M-P0-5)", () => {
    // The old `organizationIds[0]` fallback was the forbidden first/oldest
    // inference — a revoked workspace silently snapped to another org.
    expect(resolveActiveWorkspaceId("company", [ORG_A, ORG_B], null)).toBe(
      PERSONAL_WORKSPACE_ID,
    );
    expect(resolveActiveWorkspaceId("company", [ORG_A, ORG_B], "stale-id")).toBe(
      PERSONAL_WORKSPACE_ID,
    );
  });

  it("company identity + EXACTLY ONE org → that org (unambiguous default)", () => {
    expect(resolveActiveWorkspaceId("company", [ORG_A], null)).toBe(ORG_A);
  });

  it("a membership-matching pointer wins for every identity", () => {
    expect(resolveActiveWorkspaceId("person", [ORG_A, ORG_B], ORG_B)).toBe(ORG_B);
    expect(resolveActiveWorkspaceId("company", [ORG_A, ORG_B], ORG_B)).toBe(ORG_B);
    expect(resolveActiveWorkspaceId(null, [ORG_A], ORG_A)).toBe(ORG_A);
  });

  it("a stale/foreign pointer NEVER wins — falls back per identity", () => {
    const foreign = "99999999-9999-9999-9999-999999999999";
    expect(resolveActiveWorkspaceId("person", [ORG_A], foreign)).toBe(
      PERSONAL_WORKSPACE_ID,
    );
    expect(resolveActiveWorkspaceId("company", [ORG_A], foreign)).toBe(ORG_A);
  });

  it("no memberships → personal workspace for every identity (never fabricated)", () => {
    expect(resolveActiveWorkspaceId("company", [], null)).toBe(
      PERSONAL_WORKSPACE_ID,
    );
    expect(resolveActiveWorkspaceId("person", [], ORG_A)).toBe(
      PERSONAL_WORKSPACE_ID,
    );
  });
});

describe("workspaceAccentIndex", () => {
  it("is deterministic and stays within the brand-token hue range", () => {
    for (const id of [ORG_A, ORG_B, "x", "labourmarket", ""]) {
      const idx = workspaceAccentIndex(id);
      expect(idx).toBe(workspaceAccentIndex(id));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(WORKSPACE_ACCENT_COUNT);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  it("distinguishes at least some organizations (not a constant)", () => {
    const ids = Array.from(
      { length: 40 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );
    const distinct = new Set(ids.map(workspaceAccentIndex));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
