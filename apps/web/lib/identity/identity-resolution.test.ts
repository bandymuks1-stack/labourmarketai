import { describe, expect, it } from "vitest";

import {
  AUTO_MERGE_ENABLED,
  buildDuplicateDetectedEvent,
  buildMergeConfirmedEvent,
  buildMergeRejectedEvent,
  buildUnmergeEvent,
  canAutoMerge,
  detectPotentialDuplicates,
  detectWeakHints,
  normalizeEmail,
  normalizePhone,
  type IdentityCandidateInput,
} from "./identity-resolution";

const A: IdentityCandidateInput = {
  profileId: "aaaa",
  email: "Jonas@Example.com",
  phone: "+370 600 00001",
  fullName: "Jonas Jonaitis",
};
const B: IdentityCandidateInput = {
  profileId: "bbbb",
  email: "jonas@example.com",
  phone: "0037060000001",
  fullName: "J. Jonaitis",
};
const C: IdentityCandidateInput = {
  profileId: "cccc",
  email: "kitas@example.com",
  phone: "+37060000099",
  fullName: "Jonas Jonaitis",
};

describe("normalization", () => {
  it("emails compare case-insensitively after trimming", () => {
    expect(normalizeEmail(" Jonas@Example.com ")).toBe("jonas@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });

  it("phones normalize separators and 00 → +", () => {
    expect(normalizePhone("+370 600 00001")).toBe("+37060000001");
    expect(normalizePhone("0037060000001")).toBe("+37060000001");
    expect(normalizePhone("(370) 600-00001")).toBe("37060000001");
  });

  it("short fragments never become comparable phones", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("detectPotentialDuplicates — strong deterministic identifiers only", () => {
  it("detects the email+phone pair as strong_deterministic_id", () => {
    const out = detectPotentialDuplicates([A, B]);
    expect(out).toHaveLength(1);
    expect(out[0].matchKind).toBe("strong_deterministic_id");
    expect(out[0].primaryProfileId).toBe("aaaa");
    expect(out[0].duplicateProfileId).toBe("bbbb");
  });

  it("email-only overlap is email_exact; phone-only is phone_exact", () => {
    const emailOnly = detectPotentialDuplicates([
      { profileId: "p1", email: "x@y.com", phone: "+37060000001" },
      { profileId: "p2", email: "x@y.com", phone: "+37060000002" },
    ]);
    expect(emailOnly[0].matchKind).toBe("email_exact");

    const phoneOnly = detectPotentialDuplicates([
      { profileId: "p1", email: "a@y.com", phone: "+37060000001" },
      { profileId: "p2", email: "b@y.com", phone: "0037060000001" },
    ]);
    expect(phoneOnly[0].matchKind).toBe("phone_exact");
  });

  it("same NAME alone never matches (weak hints only)", () => {
    expect(detectPotentialDuplicates([A, C])).toEqual([]);
  });

  it("missing identifiers never match (null ≠ null)", () => {
    const out = detectPotentialDuplicates([
      { profileId: "p1" },
      { profileId: "p2" },
      { profileId: "p3", email: "", phone: "" },
    ]);
    expect(out).toEqual([]);
  });

  it("is deterministic and input-order independent", () => {
    const forward = detectPotentialDuplicates([A, B, C]);
    const backward = detectPotentialDuplicates([C, B, A]);
    expect(forward).toEqual(backward);
  });

  it("summaries mask contact data (domain hint only)", () => {
    const [match] = detectPotentialDuplicates([A, B]);
    expect(match.maskedHint).toContain("example.com");
    expect(match.maskedHint).not.toContain("jonas@");
    expect(match.maskedHint).not.toContain("37060000001");
    expect(Object.keys(match).sort()).toEqual([
      "duplicateProfileId",
      "maskedHint",
      "matchKind",
      "primaryProfileId",
    ]);
  });
});

describe("weak hints — clearly typed as insufficient", () => {
  it("exact-name pairs surface as weak_hint, not as candidates", () => {
    const hints = detectWeakHints([A, C]);
    expect(hints).toHaveLength(1);
    expect(hints[0].kind).toBe("weak_hint");
    expect(hints[0].reason).toBe("similar_name");
  });

  it("pairs that already match strongly are not re-hinted", () => {
    expect(detectWeakHints([A, B])).toEqual([]);
  });
});

describe("auto-merge policy — v1: a human confirms everything", () => {
  it("AUTO_MERGE_ENABLED is false", () => {
    expect(AUTO_MERGE_ENABLED).toBe(false);
  });

  it("even a strong match with a legal basis does not auto-merge", () => {
    const [match] = detectPotentialDuplicates([A, B]);
    expect(match.matchKind).toBe("strong_deterministic_id");
    expect(canAutoMerge(match, "duplicate hygiene, contract basis")).toBe(false);
    expect(canAutoMerge(match, null)).toBe(false);
  });
});

describe("event builders — audit records, never rewrites", () => {
  const [match] = detectPotentialDuplicates([A, B]);

  it("duplicate_detected needs no decider", () => {
    const r = buildDuplicateDetectedEvent(match, "seen in weekly sweep");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.kind).toBe("duplicate_detected");
      expect(r.event.matchedOn).toBe("strong_deterministic_id");
      expect(r.event.legalBasis).toBeNull();
    }
  });

  it("merge_confirmed requires BOTH a human decider and a legal basis", () => {
    expect(
      buildMergeConfirmedEvent({ match, decidedByProfileId: null, legalBasis: "x" }),
    ).toEqual({ ok: false, reason: "missing_human_decider" });
    expect(
      buildMergeConfirmedEvent({ match, decidedByProfileId: " ", legalBasis: "x" }),
    ).toEqual({ ok: false, reason: "missing_human_decider" });
    expect(
      buildMergeConfirmedEvent({
        match,
        decidedByProfileId: "admin-1",
        legalBasis: "",
      }),
    ).toEqual({ ok: false, reason: "missing_legal_basis" });

    const ok = buildMergeConfirmedEvent({
      match,
      decidedByProfileId: "admin-1",
      legalBasis: "duplicate hygiene",
      notes: "confirmed by phone",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.event.kind).toBe("merge_confirmed");
      expect(ok.event.legalBasis).toBe("duplicate hygiene");
    }
  });

  it("merge_rejected records the human 'no'", () => {
    const r = buildMergeRejectedEvent(match, "different people, shared family phone");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.kind).toBe("merge_rejected");
  });

  it("unmerge is always buildable (nothing was destroyed by the merge)", () => {
    const r = buildUnmergeEvent({
      primaryProfileId: "aaaa",
      duplicateProfileId: "bbbb",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.kind).toBe("unmerge");
      expect(r.event.matchedOn).toBe("human_decision");
    }
  });

  it("self-pairs are refused everywhere", () => {
    const self = { ...match, duplicateProfileId: match.primaryProfileId };
    expect(buildDuplicateDetectedEvent(self)).toEqual({
      ok: false,
      reason: "same_profile",
    });
    expect(
      buildUnmergeEvent({ primaryProfileId: "x", duplicateProfileId: "x" }),
    ).toEqual({ ok: false, reason: "same_profile" });
  });
});
