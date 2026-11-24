import { describe, expect, it } from "vitest";

import {
  ZERO_BRIDGE_SPINE_COUNTS,
  clientInviteRowState,
  countPendingConnectionInvites,
  countSharesAwaitingOffer,
  deliveryByEmail,
  sharedNeedsAwaitingWorker,
  toBridgeInviteDelivery,
  type ClientConnectionInvite,
  type ClientInviteDeliveryRow,
  type OfferProgressState,
  type SharedRequestsState,
} from "@/lib/agency/bridge-model";

/**
 * Pure half of the agency → client delivery + spine work (2026-09-24):
 * the mapping from the invitation primitive's outcomes, the per-address
 * delivery index, and the three state-derived bridge counts.
 */
const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const R3 = "33333333-3333-4333-8333-333333333333";

describe("toBridgeInviteDelivery — the primitive's outcomes, honestly", () => {
  it("created / sent / delivery_failed carry the id and the link back to the inviter", () => {
    for (const outcome of ["created", "sent", "delivery_failed"] as const) {
      expect(
        toBridgeInviteDelivery("client@example.com", {
          status: "ok",
          outcome,
          invitationId: R1,
          inviteLink: "https://labourmarket.ai/lt/invite/tok",
        }),
      ).toEqual({
        email: "client@example.com",
        outcome,
        invitationId: R1,
        inviteLink: "https://labourmarket.ai/lt/invite/tok",
        reason: null,
      });
    }
  });

  it("duplicate_pending is IDEMPOTENT: nothing new is minted, no link is claimed", () => {
    const d = toBridgeInviteDelivery("client@example.com", {
      status: "ok",
      outcome: "duplicate_pending",
    });
    expect(d.outcome).toBe("duplicate_pending");
    expect(d.inviteLink).toBeNull();
    expect(d.invitationId).toBeNull();
  });

  it("any other primitive outcome is a REFUSAL that names its reason", () => {
    for (const outcome of ["limit_reached", "rate_limited", "not_authorized", "error"]) {
      const d = toBridgeInviteDelivery("client@example.com", { status: "ok", outcome });
      expect(d.outcome).toBe("refused");
      expect(d.reason).toBe(outcome);
      expect(d.inviteLink).toBeNull();
    }
  });

  it("a missing primitive is UNAVAILABLE — never 'not sent', never a link", () => {
    for (const result of [
      { status: "needs-migration" as const },
      { status: "not-authed" as const },
      null,
      undefined,
    ]) {
      const d = toBridgeInviteDelivery("client@example.com", result);
      expect(d.outcome).toBe("unavailable");
      expect(d.inviteLink).toBeNull();
      expect(d.reason).toBeNull();
    }
  });

  it("an ok result without an outcome reads as a refusal, not as created", () => {
    const d = toBridgeInviteDelivery("client@example.com", { status: "ok" });
    expect(d.outcome).toBe("refused");
    expect(d.reason).toBe("error");
  });
});

describe("deliveryByEmail — the invitation that COUNTS per address", () => {
  const row = (
    id: string,
    email: string,
    status: string,
    createdAt: string,
    deliveryStatus = "not_sent",
  ): ClientInviteDeliveryRow => ({
    invitationId: id,
    email,
    status,
    deliveryStatus,
    createdAt,
  });

  it("keys lower-cased, keeps the newest pending row among pending rows", () => {
    const m = deliveryByEmail([
      row(R1, "Client@Example.com", "pending", "2026-09-20T10:00:00Z"),
      row(R2, "client@example.com", "pending", "2026-09-22T10:00:00Z"),
    ]);
    expect(m.get("client@example.com")?.invitationId).toBe(R2);
    expect(m.size).toBe(1);
  });

  it("an ACCEPTED row wins over a newer pending one — the client's confirmation is what is awaited", () => {
    // Review round 2: an accepted (single-use, consumed) invitation used to
    // read "no invitation link yet", and "Get link" minted a second one.
    const m = deliveryByEmail([
      row(R1, "client@example.com", "accepted", "2026-09-20T10:00:00Z"),
      row(R2, "client@example.com", "pending", "2026-09-22T10:00:00Z"),
    ]);
    expect(m.get("client@example.com")?.invitationId).toBe(R1);
    expect(clientInviteRowState(m.get("client@example.com"))).toBe("accepted");
  });

  it("among accepted rows the newest wins", () => {
    const m = deliveryByEmail([
      row(R1, "client@example.com", "accepted", "2026-09-20T10:00:00Z"),
      row(R3, "client@example.com", "accepted", "2026-09-23T10:00:00Z"),
    ]);
    expect(m.get("client@example.com")?.invitationId).toBe(R3);
  });

  it("NEGATIVE: an address with only closed rows has no live invitation (a fresh one may be minted)", () => {
    const m = deliveryByEmail([
      row(R1, "a@example.com", "declined", "2026-09-20T10:00:00Z"),
      row(R2, "a@example.com", "revoked", "2026-09-21T10:00:00Z"),
      row(R3, "a@example.com", "expired", "2026-09-22T10:00:00Z"),
    ]);
    expect(m.has("a@example.com")).toBe(false);
    expect(clientInviteRowState(m.get("a@example.com"))).toBe("none");
  });

  it("clientInviteRowState: the four states, in the primitive's own vocabulary", () => {
    expect(clientInviteRowState(null)).toBe("none");
    expect(clientInviteRowState(undefined)).toBe("none");
    expect(clientInviteRowState(row(R1, "a@example.com", "accepted", "2026-09-20T10:00:00Z", "sent"))).toBe("accepted");
    expect(clientInviteRowState(row(R1, "a@example.com", "pending", "2026-09-20T10:00:00Z", "not_sent"))).toBe("created");
    expect(clientInviteRowState(row(R1, "a@example.com", "pending", "2026-09-20T10:00:00Z", "sent"))).toBe("sent");
    expect(clientInviteRowState(row(R1, "a@example.com", "pending", "2026-09-20T10:00:00Z", "delivery_failed"))).toBe("delivery_failed");
  });
});

describe("bridge spine counts — state-derived, never fabricated from an unknown", () => {
  const invite = (id: string, status: ClientConnectionInvite["status"]) => ({
    id,
    agencyName: "Agency",
    invitedEmail: "client@example.com",
    status,
    createdAt: "2026-09-20T10:00:00Z",
  });

  it("pending connection invites: pending rows only, 0 on a failed read", () => {
    expect(
      countPendingConnectionInvites({
        kind: "ok",
        rows: [invite(R1, "pending"), invite(R2, "active"), invite(R3, "declined")],
      }),
    ).toBe(1);
    expect(countPendingConnectionInvites({ kind: "error" })).toBe(0);
    expect(countPendingConnectionInvites({ kind: "needs-migration" })).toBe(0);
  });

  const shared: SharedRequestsState = {
    kind: "ok",
    rows: [R1, R2, R3].map((requestId, i) => ({
      shareId: `s${i}`,
      connectionId: "c",
      requestId,
      title: `Need ${i}`,
      roleText: null,
      country: null,
      status: "submitted",
      sharedAt: "2026-09-20T10:00:00Z",
    })),
  };
  const progress = (
    rows: ReadonlyArray<readonly [string, "offered" | "withdrawn" | "accepted" | "declined"]>,
  ): OfferProgressState => ({
    kind: "ok",
    rows: rows.map(([requestId, offerStatus], i) => ({
      offerId: `o${i}`,
      requestId,
      workerId: "w",
      offerStatus,
      reviewStage: "offered",
      createdAt: "2026-09-21T10:00:00Z",
    })),
  });

  it("shares awaiting an offer: an open or accepted offer answers a share", () => {
    expect(countSharesAwaitingOffer(shared, progress([]))).toBe(3);
    expect(countSharesAwaitingOffer(shared, progress([[R1, "offered"]]))).toBe(2);
    expect(countSharesAwaitingOffer(shared, progress([[R1, "offered"], [R2, "accepted"]]))).toBe(1);
  });

  it("NEGATIVE: a withdrawn or declined offer leaves the share unanswered again", () => {
    expect(
      countSharesAwaitingOffer(shared, progress([[R1, "withdrawn"], [R2, "declined"]])),
    ).toBe(3);
  });

  it("a need whose accepted candidate DECLINED the booking or whose placement ENDED is open again", () => {
    const prog = progress([[R1, "accepted"], [R2, "accepted"], [R3, "accepted"]]);
    const placed = (rows: ReadonlyArray<readonly [string, string | null, string | null]>) => ({
      kind: "ok" as const,
      rows: rows.map(([offerId, bookingStatus, engagementStatus]) => ({ offerId, bookingStatus, engagementStatus })),
    });
    // o0 = R1 worker declined; o1 = R2 placement ended; o2 = R3 still working
    const p = placed([["o0", "declined", null], ["o1", "accepted", "ended"], ["o2", "accepted", "active"]]);
    expect(countSharesAwaitingOffer(shared, prog, p)).toBe(2);
    const rows = sharedNeedsAwaitingWorker(shared, prog, p);
    expect(rows.map((r) => [r.requestId, r.reason])).toEqual([
      [R1, "placement_did_not_proceed"],
      [R2, "placement_did_not_proceed"],
    ]);
    // a NEW offer on the re-opened need answers it again
    const reoffered = progress([[R1, "accepted"], [R2, "accepted"], [R3, "accepted"], [R1, "offered"]]);
    expect(sharedNeedsAwaitingWorker(shared, reoffered, p).map((r) => r.requestId)).toEqual([R2]);
  });

  it("NEGATIVE: an accepted placement that is proposed / accepted / not yet booked still answers the need", () => {
    const prog = progress([[R1, "accepted"], [R2, "accepted"]]);
    const p = {
      kind: "ok" as const,
      rows: [
        { offerId: "o0", bookingStatus: "proposed", engagementStatus: null },
        { offerId: "o1", bookingStatus: null, engagementStatus: null },
      ],
    };
    expect(countSharesAwaitingOffer(shared, prog, p)).toBe(1);
  });

  it("NEGATIVE: an unreadable placement read never invents attention; a closed need is not open", () => {
    const prog = progress([[R1, "accepted"], [R2, "accepted"], [R3, "accepted"]]);
    expect(countSharesAwaitingOffer(shared, prog, { kind: "error" })).toBe(0);
    expect(countSharesAwaitingOffer(shared, prog)).toBe(0);
    const closed = {
      kind: "ok" as const,
      rows: shared.kind === "ok" ? shared.rows.map((r) => ({ ...r, status: "closed" })) : [],
    };
    expect(countSharesAwaitingOffer(closed, progress([]))).toBe(0);
  });

  it("NEGATIVE: either read failing counts 0 — the bell never invents a number", () => {
    expect(countSharesAwaitingOffer({ kind: "error" }, progress([]))).toBe(0);
    expect(countSharesAwaitingOffer(shared, { kind: "needs-migration" })).toBe(0);
  });

  it("the zero constant is all zeros (the non-company default)", () => {
    expect(Object.values(ZERO_BRIDGE_SPINE_COUNTS).every((v) => v === 0)).toBe(true);
  });
});
