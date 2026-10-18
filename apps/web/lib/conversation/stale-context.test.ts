import { describe, expect, it } from "vitest";

import {
  isStaleWorkspaceContext,
  workspaceBoundFingerprint,
} from "@/lib/conversation/dispatch-core";
import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import { withoutWorkspaceScopedDepth } from "@/lib/conversation/result-registry";

/**
 * A WRITE LANDS IN THE WORKSPACE THE PERSON SAW (owner program 2026-09-23).
 *
 * The dispatcher re-resolved the organization at execution time and the client
 * never said which one it displayed, so a form or a confirmation opened in
 * organization A executed in B after a switch in another tab, on another
 * device, or through the MCP door. These pin the two bindings that close it:
 * the displayed workspace compared at dispatch (`stale_context`), and the
 * confirmation token bound to the workspace it was minted in.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "test-secret-material";
const USER = "33333333-3333-4333-8333-333333333333";

describe("isStaleWorkspaceContext — the displayed workspace vs the resolved one", () => {
  it("the same workspace is not stale", () => {
    expect(isStaleWorkspaceContext(ORG_A, ORG_A)).toBe(false);
    expect(isStaleWorkspaceContext("personal", "personal")).toBe(false);
  });

  it("a different workspace IS stale — in both directions", () => {
    expect(isStaleWorkspaceContext(ORG_A, ORG_B)).toBe(true);
    expect(isStaleWorkspaceContext("personal", ORG_A)).toBe(true);
    expect(isStaleWorkspaceContext(ORG_A, "personal")).toBe(true);
  });

  it("a caller that does not bind is not refused (the token binding still applies)", () => {
    expect(isStaleWorkspaceContext(undefined, ORG_A)).toBe(false);
    expect(isStaleWorkspaceContext(null, ORG_A)).toBe(false);
    expect(isStaleWorkspaceContext("", ORG_A)).toBe(false);
  });
});

describe("a confirmation minted in workspace A can never execute in workspace B", () => {
  const input = { projectId: ORG_A, workerProfileId: USER };
  const mint = (workspaceId: string) =>
    issueConfirmationToken(SECRET, {
      actionId: "company.assign-worker",
      inputHash: canonicalInputHash(input),
      userId: USER,
      stateFingerprint: workspaceBoundFingerprint(workspaceId, "n/a"),
      issuedAtMs: Date.now(),
    });
  const verifyIn = (token: string, workspaceId: string) =>
    verifyConfirmationToken(SECRET, token, {
      actionId: "company.assign-worker",
      input,
      userId: USER,
      currentStateFingerprint: workspaceBoundFingerprint(workspaceId, "n/a"),
      nowMs: Date.now(),
    });

  it("verifies in the workspace it was minted in", () => {
    expect(verifyIn(mint(ORG_A), ORG_A).ok).toBe(true);
  });

  it("is refused as stale state in any other workspace", () => {
    const verdict = verifyIn(mint(ORG_A), ORG_B);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe("stale_state");
    expect(verifyIn(mint(ORG_A), "personal").ok).toBe(false);
  });

  it("NEGATIVE CONTROL: without the workspace term the same token verified anywhere", () => {
    // The pre-fix fingerprint was the action's own ("n/a" for most actions),
    // identical in every workspace — which is exactly the defect.
    const token = issueConfirmationToken(SECRET, {
      actionId: "company.assign-worker",
      inputHash: canonicalInputHash(input),
      userId: USER,
      stateFingerprint: "n/a",
      issuedAtMs: Date.now(),
    });
    const verdict = verifyConfirmationToken(SECRET, token, {
      actionId: "company.assign-worker",
      input,
      userId: USER,
      currentStateFingerprint: "n/a",
      nowMs: Date.now(),
    });
    expect(verdict.ok).toBe(true);
  });

  it("the action's own fingerprint still counts inside the workspace term", () => {
    expect(workspaceBoundFingerprint(ORG_A, "booking:proposed")).not.toBe(
      workspaceBoundFingerprint(ORG_A, "booking:accepted"),
    );
    expect(workspaceBoundFingerprint(ORG_A, "booking:proposed")).toContain("booking:proposed");
  });
});

describe("a switch drops the depth that belongs to the previous workspace", () => {
  it("drops a demand, an interaction and the project result's project", () => {
    expect(withoutWorkspaceScopedDepth(`?result=candidates&demand=${ORG_A}`)).toBe("?result=candidates");
    expect(withoutWorkspaceScopedDepth(`?result=project&project=${ORG_A}&pr=abc`)).toBe("?result=project");
    expect(withoutWorkspaceScopedDepth("?result=experiences&interaction=booking:x")).toBe("?result=experiences");
  });

  it("keeps the result (it re-reads for the new workspace) and public market geography", () => {
    expect(withoutWorkspaceScopedDepth("?result=market&geo=NL:city:Rotterdam&project=p1")).toBeNull();
    expect(withoutWorkspaceScopedDepth("?result=candidates")).toBeNull();
    expect(withoutWorkspaceScopedDepth("")).toBeNull();
  });

  it("an address that was only depth becomes empty, not '?'", () => {
    expect(withoutWorkspaceScopedDepth(`demand=${ORG_A}`)).toBe("");
  });
});
