import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

import { personKey } from "@/lib/organization-evidence/person-matching";
import { planPeopleIngest, type IngestPlan } from "./ingest-core";
import {
  mintPeopleCommitToken,
  peopleReadyFingerprint,
  verifyPeopleCommitToken,
} from "./people-commit-confirmation";

/**
 * THE COMMIT GATE, EXERCISED — not grepped.
 *
 * A source-text guard can prove the verification is CALLED. Only running it
 * proves the verification REFUSES. These are the four ways an assistant could
 * commit people it was never authorized to commit: replay a spent token, widen
 * the batch after the preview, change what the people are to the organization,
 * or use somebody else's token.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const SOMEBODY_ELSE = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";

const roster = (names: readonly string[]) =>
  names.map((n, i) => ({
    id: `p-${i}`,
    displayName: n,
    normalizedName: personKey(n),
    externalRef: null,
  }));

const plan = (names: readonly string[], existing: readonly string[] = []): IngestPlan =>
  planPeopleIngest({
    sources: names.map((name) => ({ name })),
    roster: roster(existing),
    relationship: "employee",
  });

const mint = (p: IngestPlan, userId = OWNER, relationship = "employee") =>
  mintPeopleCommitToken({ organizationId: ORG, relationship, userId, plan: p });

const verify = (
  token: string,
  p: IngestPlan,
  userId = OWNER,
  relationship = "employee",
) => verifyPeopleCommitToken({ token, organizationId: ORG, relationship, userId, plan: p });

describe("the people commit token", () => {
  it("accepts exactly the batch the preview showed", () => {
    const p = plan(["Jonas Petraitis", "Ona Kazlauskienė"]);
    expect(verify(mint(p), p).ok).toBe(true);
  });

  it("REFUSES a replay: once committed, those people are on the roster", () => {
    const previewed = plan(["Jonas Petraitis", "Ona Kazlauskienė"]);
    const token = mint(previewed);
    expect(verify(token, previewed).ok).toBe(true);

    // The commit happened: the same file previewed again now matches both
    // people against the roster, so nothing is left to create and the
    // fingerprint has moved. The token is spent by the WORLD changing, which
    // is what makes "one-time" true rather than merely claimed.
    const afterCommit = plan(
      ["Jonas Petraitis", "Ona Kazlauskienė"],
      ["Jonas Petraitis", "Ona Kazlauskienė"],
    );
    const replay = verify(token, afterCommit);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBeTruthy();
  });

  it("REFUSES a widened batch — an assistant cannot smuggle in an extra person", () => {
    const shown = plan(["Jonas Petraitis"]);
    const token = mint(shown);
    const widened = plan(["Jonas Petraitis", "Someone Never Shown"]);
    expect(verify(token, widened).ok).toBe(false);
  });

  it("REFUSES a changed relationship — a candidate is not an employee", () => {
    const p = plan(["Jonas Petraitis"]);
    const token = mint(p, OWNER, "employee");
    // Same people, different claim about what they are to the organization.
    const asCandidates = planPeopleIngest({
      sources: [{ name: "Jonas Petraitis" }],
      roster: [],
      relationship: "candidate",
    });
    expect(verify(token, asCandidates, OWNER, "candidate").ok).toBe(false);
  });

  it("REFUSES another person's token", () => {
    const p = plan(["Jonas Petraitis"]);
    expect(verify(mint(p, OWNER), p, SOMEBODY_ELSE).ok).toBe(false);
  });

  it("REFUSES a tampered token", () => {
    const p = plan(["Jonas Petraitis"]);
    const token = mint(p);
    expect(verify(`${token}x`, p).ok).toBe(false);
    expect(verify(token.slice(0, -1), p).ok).toBe(false);
  });

  it("carries no personal data — a token in a transcript discloses no names", () => {
    const p = plan(["Jonas Petraitis", "Ona Kazlauskienė"]);
    const token = mint(p);
    const fingerprint = peopleReadyFingerprint(p);
    for (const secret of ["Jonas", "Petraitis", "Ona", "Kazlausk"]) {
      expect(token, `${secret} leaked into the token`).not.toContain(secret);
      expect(fingerprint, `${secret} leaked into the fingerprint`).not.toContain(secret);
    }
  });

  it("an unresolved plan has nothing to commit, so its fingerprint is empty", () => {
    // Two roster people share a name: the batch is ambiguous, `peopleToCreate`
    // is empty, and no commit permit can describe a real write.
    const ambiguous = planPeopleIngest({
      sources: [{ name: "Jonas Petraitis" }],
      roster: roster(["Jonas Petraitis", "Jonas Petraitis"]),
      relationship: "employee",
    });
    if (ambiguous.kind !== "plan") throw new Error("unreachable");
    expect(ambiguous.needsReconciliation).toBe(true);
    expect(peopleReadyFingerprint(ambiguous)).toContain(":0:");
  });
});
