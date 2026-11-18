import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE PRODUCTION AGENCY WALK LEAVES NO OPEN BOOKING PROPOSAL BEHIND.
 *
 * Its step A-6 accepts the agency's candidate, which proposes a booking to a
 * synthetic worker who never answers. The database caps a client's open
 * proposals at 10, so runs that left theirs open made A-6 fail with "Too many
 * open booking proposals" (run 43724558463). The walk withdraws the proposal it
 * created, through the client's own Withdraw control, and ONLY that one: it
 * records which proposals appeared after its own accept. Earlier runs'
 * leftovers are production data for the owner to decide, never this walk's.
 */
const spec = readFileSync(path.resolve(__dirname, "../../tests/e2e/prod-agency-chain.spec.ts"), "utf8");

describe("the production agency walk cleans up its own booking proposal", () => {
  const a6 = spec.slice(spec.indexOf('test("A-6.'), spec.indexOf('test("A-7.'));
  const teardown = spec.slice(spec.indexOf("test.afterAll("));

  it("A-6 notes the open proposals before its accept and keeps only the new ones", () => {
    expect(a6.indexOf("openOutgoingProposalIds(page)")).toBeGreaterThan(-1);
    expect(a6.indexOf("openOutgoingProposalIds(page)")).toBeLessThan(a6.indexOf("accept.click()"));
    expect(a6).toMatch(/if \(!before\.has\(id\)\) createdProposals\.push\(id\)/);
  });

  it("the teardown runs even when a step failed, and uses the client's own Withdraw", () => {
    expect(teardown.length, "an afterAll teardown exists").toBeGreaterThan(0);
    expect(teardown).toContain("for (const id of createdProposals)");
    expect(teardown).toContain('getByTestId("booking-withdraw")');
    expect(teardown).toContain('getByTestId("booking-withdraw-confirm")');
  });

  it("a withdrawal counts only when the stored status reads withdrawn", () => {
    expect(teardown).toContain('.toBe("withdrawn")');
    expect(teardown).not.toContain('.not.toBe("proposed")');
    // An unreadable page is its own answer, never a closed proposal.
    expect(teardown).toContain('status === "unreadable"');
    expect(spec).toMatch(/return "unreadable";/);
    expect(spec).toMatch(/return "absent";/);
  });

  it("A-6b accepts only this run's own proposal and never ends the shared engagement", () => {
    const a6b = spec.slice(spec.indexOf('test("A-6b.'), spec.indexOf('test("A-7.'));
    expect(a6b.length, "an A-6b step exists").toBeGreaterThan(0);
    expect(a6b).toContain("createdProposals.length");
    expect(a6b).toContain("const id = createdProposals[0]");
    expect(a6b).toContain("getByTestId(`booking-${id}`)");
    // The read-back is the stored status, not the button's own echo.
    expect(a6b).toContain('.toBe("accepted")');
    // The worker's engagement with the client is shared by earlier runs:
    // ending it is not this walk's (owner choice 2026-11-16).
    expect(spec).not.toMatch(/engagement-end|endEngagement|end_company_worker_engagement/);
  });

  it("A-8 closes only this run's own need, and only after its own proposal was accepted", () => {
    const a8 = spec.slice(spec.indexOf('test("A-8'), spec.indexOf("test.afterAll("));
    expect(a8.length, "an A-8 step exists").toBeGreaterThan(0);
    expect(spec).toContain("ownNeed = pick.t.includes(RUN)");
    expect(a8).toContain('expect(ownNeed && requestId !== ""');
    expect(a8).toContain("expect(workerAccepted");
    expect(a8.indexOf("expect(ownNeed")).toBeLessThan(a8.indexOf('getByTestId("demand-close")'));
    expect(a8).toContain("scouting?request=${requestId}");
  });

  it("it never withdraws by a broad match, so earlier runs' proposals stay untouched", () => {
    expect(teardown).not.toMatch(/hasText:\s*["'`]QA-SYNTHETIC/);
    expect(teardown).not.toMatch(/data-status="proposed"\]'\)\.(first|nth|all)\(/);
  });
});
