import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { eligibleLearners, isMissingSchemaCode } from "./programs";

/**
 * WHAT THIS PROTECTS.
 *
 * `set_education_cohort_member_v1` refuses any profile without an ACTIVE
 * `student` engagement context on the institution's organisation
 * (`not_a_linked_learner`, 42501). The assignable list was built from
 * accepted INVITATIONS alone, and an invitation row never expires — so a
 * learner whose student relationship had ended stayed in the dropdown and
 * the institution got a permission error for a name the product had just
 * offered it.
 *
 * Eligibility must therefore be the same predicate the RPC enforces, while
 * the LABEL stays the institution's own invitation text (least-privilege
 * ruling 2026-08-27).
 */
describe("assignable learners — eligibility is the live relationship (pure)", () => {
  const labels = new Map([
    ["p-active", "Ona Onaitė"],
    ["p-ended", "Jonas Jonaitis"],
  ]);

  it("offers a learner whose student relationship is active", () => {
    expect(eligibleLearners(labels, new Set(["p-active", "p-ended"]))).toEqual([
      { profileId: "p-active", label: "Ona Onaitė" },
      { profileId: "p-ended", label: "Jonas Jonaitis" },
    ]);
  });

  it("DROPS a learner whose invitation is still accepted but whose relationship ended", () => {
    // The regression this exists for: `p-ended` has a permanent accepted
    // invitation and no active context. Offering it produced a 42501.
    expect(eligibleLearners(labels, new Set(["p-active"]))).toEqual([
      { profileId: "p-active", label: "Ona Onaitė" },
    ]);
  });

  it("offers nobody when no relationship is active, rather than everybody", () => {
    expect(eligibleLearners(labels, new Set())).toEqual([]);
  });

  it("never invents a label for an active learner the institution cannot name", () => {
    // A live student context with no invitation the institution can read is
    // deliberately NOT offered — naming that person would disclose more than
    // the least-privilege ruling allows.
    expect(eligibleLearners(labels, new Set(["p-active", "stranger"]))).toEqual([
      { profileId: "p-active", label: "Ona Onaitė" },
    ]);
  });

  it("holds no state between calls", () => {
    const ids = new Set(["p-active"]);
    expect(eligibleLearners(labels, ids)).toEqual(eligibleLearners(labels, ids));
  });
});

describe("institution programmes read — shape guarantees", () => {
  const src = readFileSync(resolve(__dirname, "programs.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("reads the eligibility set from the canonical relationship, scoped and active", () => {
    expect(code).toMatch(/\.from\("engagement_contexts"\)/);
    expect(code).toMatch(/\.eq\("relationship_slug", "student"\)/);
    expect(code).toMatch(/\.eq\("status", "active"\)/);
    expect(code).toMatch(/\.eq\("organization_id", organizationId\)/);
  });

  it("composes the offered list ONLY through the intersection", () => {
    expect(code).toMatch(/const assignable = eligibleLearners\(/);
    // Negative control: the old unconditional mapping must not come back.
    expect(code).not.toMatch(/\[\.\.\.labelByProfile\.entries\(\)\]\.map/);
  });

  it("degrades a failed eligibility read to unavailable, never to an empty list", () => {
    expect(code).toMatch(/ctxRes\.error/);
    expect(code).toMatch(/if \([^)]*ctxRes\.error\) return \{ status: "unavailable" \}/);
  });

  it("still reads labels only from the institution's own invitations", () => {
    expect(code).toMatch(/\.from\("invitations"\)/);
    expect(code).not.toMatch(/\.from\("workers"\)/);
    expect(code).not.toMatch(/\.from\("profiles"\)/);
    expect(code).not.toMatch(/\.from\("worker_skills"\)/);
  });

  it("keeps the missing-schema classifier", () => {
    expect(isMissingSchemaCode("42P01")).toBe(true);
    expect(isMissingSchemaCode("PGRST116")).toBe(false);
    expect(isMissingSchemaCode(undefined)).toBe(false);
  });
});
