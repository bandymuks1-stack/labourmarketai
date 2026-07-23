import { describe, expect, it } from "vitest";
import {
  isBridgeUuid,
  pendingInvites,
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
