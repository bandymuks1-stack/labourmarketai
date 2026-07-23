import { describe, expect, it } from "vitest";
import {
  groupOffersByRequest,
  hasActiveOffer,
  isOfferUuid,
  validateOfferInput,
  type AgencyCandidateOffer,
} from "@/lib/agency/candidate-offers-model";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const R1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const R2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function offer(
  partial: Partial<AgencyCandidateOffer> & { id: string },
): AgencyCandidateOffer {
  return {
    workerId: U1,
    requestId: R1,
    status: "offered",
    note: null,
    createdAt: "2026-07-23T00:00:00Z",
    ...partial,
  };
}

describe("isOfferUuid", () => {
  it("accepts a canonical uuid and rejects junk", () => {
    expect(isOfferUuid(U1)).toBe(true);
    expect(isOfferUuid("")).toBe(false);
    expect(isOfferUuid("not-a-uuid")).toBe(false);
    expect(isOfferUuid(`${U1} or 1=1`)).toBe(false);
  });
});

describe("validateOfferInput mirrors the server checks", () => {
  it("requires a valid request uuid", () => {
    const r = validateOfferInput({ requestId: "x", workerId: U1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("requestId");
  });
  it("requires a valid worker uuid", () => {
    const r = validateOfferInput({ requestId: R1, workerId: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("workerId");
  });
  it("rejects an over-long note (>500)", () => {
    const r = validateOfferInput({
      requestId: R1,
      workerId: U1,
      note: "a".repeat(501),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("note");
  });
  it("normalizes an empty note to null and trims", () => {
    const r = validateOfferInput({ requestId: R1, workerId: U1, note: "   " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.note).toBeNull();
      expect(r.value.requestId).toBe(R1);
      expect(r.value.workerId).toBe(U1);
    }
  });
});

describe("groupOffersByRequest", () => {
  it("groups only ACTIVE offers by request, dropping withdrawn ones", () => {
    const offers = [
      offer({ id: "1", requestId: R1, workerId: U1 }),
      offer({ id: "2", requestId: R1, workerId: U2 }),
      offer({ id: "3", requestId: R2, workerId: U1 }),
      offer({ id: "4", requestId: R2, workerId: U2, status: "withdrawn" }),
    ];
    const grouped = groupOffersByRequest(offers);
    expect(grouped.get(R1)?.length).toBe(2);
    expect(grouped.get(R2)?.length).toBe(1); // withdrawn dropped
  });
});

describe("hasActiveOffer", () => {
  it("is true only for an active (worker,request) pair", () => {
    const offers = [
      offer({ id: "1", requestId: R1, workerId: U1 }),
      offer({ id: "2", requestId: R2, workerId: U2, status: "withdrawn" }),
    ];
    expect(hasActiveOffer(offers, U1, R1)).toBe(true);
    expect(hasActiveOffer(offers, U2, R2)).toBe(false); // withdrawn
    expect(hasActiveOffer(offers, U2, R1)).toBe(false);
  });
});
