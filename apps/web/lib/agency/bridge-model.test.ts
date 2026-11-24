import { describe, expect, it } from "vitest";
import {
  isBridgeUuid,
  mergeClientConnectionStates,
  pendingInvites,
  effectiveReviewStage,
  reviewStageTone,
  validateInviteEmail,
  validateOfferNote,
  type ClientConnectionInvite,
} from "@/lib/agency/bridge-model";

const U = "11111111-1111-1111-1111-111111111111";

describe("isBridgeUuid", () => {
  it("accepts a uuid, rejects junk / injection", () => {
    expect(isBridgeUuid(U)).toBe(true);
    expect(isBridgeUuid("")).toBe(false);
    expect(isBridgeUuid("x")).toBe(false);
    expect(isBridgeUuid(`${U} or 1=1`)).toBe(false);
  });
});

describe("validateInviteEmail", () => {
  it("normalizes + validates, rejects bad", () => {
    const ok = validateInviteEmail("  Client@Example.COM ");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toBe("client@example.com");
    expect(validateInviteEmail("nope").ok).toBe(false);
    expect(validateInviteEmail("").ok).toBe(false);
  });
});

describe("validateOfferNote", () => {
  it("trims, nulls empty, caps at 500", () => {
    expect(validateOfferNote("  ")).toBeNull();
    expect(validateOfferNote(null)).toBeNull();
    expect(validateOfferNote("hi")).toBe("hi");
    expect(validateOfferNote("a".repeat(600))!.length).toBe(500);
  });
});

describe("pendingInvites", () => {
  it("keeps only pending", () => {
    const rows: ClientConnectionInvite[] = [
      { id: "1", agencyName: "A", invitedEmail: "e", status: "pending", createdAt: "" },
      { id: "2", agencyName: "A", invitedEmail: "e", status: "active", createdAt: "" },
      { id: "3", agencyName: "A", invitedEmail: "e", status: "revoked", createdAt: "" },
    ];
    expect(pendingInvites(rows).map((r) => r.id)).toEqual(["1"]);
  });
});

describe("mergeClientConnectionStates — one client list from the email-keyed and company-keyed reads", () => {
  const inv = (id: string, status: ClientConnectionInvite["status"], createdAt: string, agencyName = "Agency A"): ClientConnectionInvite => ({
    id,
    agencyName,
    invitedEmail: "c@x.lt",
    status,
    createdAt,
  });

  it("unions by id, newest first, and lets the joined read name an agency the fallback could not", () => {
    const m = mergeClientConnectionStates(
      { kind: "ok", rows: [inv("a", "pending", "2026-09-01"), inv("b", "active", "2026-09-02", "\u2014")] },
      { kind: "ok", rows: [inv("b", "active", "2026-09-02", "Agency B"), inv("c", "active", "2026-09-03")] },
    );
    expect(m.kind).toBe("ok");
    if (m.kind !== "ok") return;
    expect(m.rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(m.rows.find((r) => r.id === "b")!.agencyName).toBe("Agency B");
  });

  it("either read failing makes the whole list UNKNOWN — never a partial list posing as complete", () => {
    expect(mergeClientConnectionStates({ kind: "ok", rows: [] }, { kind: "error" })).toEqual({ kind: "error" });
    expect(mergeClientConnectionStates({ kind: "error" }, { kind: "ok", rows: [] })).toEqual({ kind: "error" });
    expect(mergeClientConnectionStates({ kind: "needs-migration" }, { kind: "error" })).toEqual({ kind: "needs-migration" });
  });
});

describe("reviewStageTone", () => {
  it("maps stages to tones", () => {
    expect(reviewStageTone("accepted")).toBe("success");
    expect(reviewStageTone("booking_started")).toBe("info");
    expect(reviewStageTone("contacted")).toBe("info");
    expect(reviewStageTone("rejected")).toBe("warning");
    expect(reviewStageTone("offered")).toBe("muted");
    expect(reviewStageTone("reviewed")).toBe("muted");
  });
});

describe("effectiveReviewStage — a closed offer never wears another offer's booking stage", () => {
  it("declined offer on a pair whose OTHER offer was accepted → rejected (production 2026-09-21 case)", () => {
    expect(effectiveReviewStage("declined", "accepted")).toBe("rejected");
    expect(effectiveReviewStage("declined", "booking_started")).toBe("rejected");
    expect(effectiveReviewStage("declined", "offered")).toBe("rejected");
  });

  it("withdrawn offer stays at offered whatever the pair-derived stage says", () => {
    expect(effectiveReviewStage("withdrawn", "accepted")).toBe("offered");
    expect(effectiveReviewStage("withdrawn", "contacted")).toBe("offered");
  });

  it("open and accepted offers keep the derived stage", () => {
    expect(effectiveReviewStage("offered", "reviewed")).toBe("reviewed");
    expect(effectiveReviewStage("offered", "contacted")).toBe("contacted");
    expect(effectiveReviewStage("accepted", "accepted")).toBe("accepted");
    expect(effectiveReviewStage("accepted", "booking_started")).toBe("booking_started");
  });
});
