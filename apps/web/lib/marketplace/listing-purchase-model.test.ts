import { describe, expect, it } from "vitest";

import {
  PURCHASE_ACTIONS,
  PURCHASE_STATUSES,
  PAYMENT_ARRANGEMENTS,
  availablePurchaseActions,
  canOpenPurchaseConversation,
  isPurchasableListing,
  nextPurchaseStatus,
  requestRefusalFrom,
  sideOf,
  validatePurchaseInput,
  type PurchaseStatus,
} from "@/lib/marketplace/listing-purchase-model";

const ID = "11111111-2222-3333-4444-555555555555";
const TODAY = "2026-10-23";

describe("the purchase state machine mirrors transition_listing_purchase_v1", () => {
  const table: Array<[PurchaseStatus, "buyer" | "seller", string, PurchaseStatus | null]> = [
    ["requested", "seller", "accept", "accepted"],
    ["requested", "seller", "decline", "declined"],
    ["requested", "seller", "fulfil", null],
    ["requested", "seller", "cancel", null],
    ["accepted", "seller", "fulfil", "fulfilled"],
    ["accepted", "seller", "cancel", "cancelled"],
    ["accepted", "seller", "accept", null],
    ["requested", "buyer", "cancel", "cancelled"],
    ["accepted", "buyer", "cancel", "cancelled"],
    ["requested", "buyer", "accept", null],
    ["accepted", "buyer", "fulfil", null],
  ];
  for (const [status, side, action, next] of table) {
    it(`${side} ${action} on ${status} → ${next ?? "refused"}`, () => {
      expect(nextPurchaseStatus(status, action as never, side)).toBe(next);
    });
  }

  it("terminal states never move, for either side and any action", () => {
    for (const status of ["fulfilled", "declined", "cancelled"] as const) {
      for (const side of ["buyer", "seller"] as const) {
        for (const a of PURCHASE_ACTIONS) expect(nextPurchaseStatus(status, a, side)).toBeNull();
        expect(availablePurchaseActions(status, side)).toEqual([]);
      }
    }
  });

  it("offers exactly the legal buttons", () => {
    expect(availablePurchaseActions("requested", "seller")).toEqual(["accept", "decline"]);
    expect(availablePurchaseActions("accepted", "seller")).toEqual(["fulfil", "cancel"]);
    expect(availablePurchaseActions("requested", "buyer")).toEqual(["cancel"]);
    expect(availablePurchaseActions("accepted", "buyer")).toEqual(["cancel"]);
  });

  it("the status set is the SQL CHECK set", () => {
    expect([...PURCHASE_STATUSES]).toEqual(["requested", "accepted", "fulfilled", "declined", "cancelled"]);
  });
});

describe("what is purchasable (mirrors the request RPC)", () => {
  it("a sale of goods or of a movable work resource", () => {
    expect(isPurchasableListing({ listingKind: "sale", subject: "goods_handmade" })).toBe(true);
    expect(isPurchasableListing({ listingKind: "sale", subject: "tools" })).toBe(true);
    expect(isPurchasableListing({ listingKind: "sale", subject: "safety_equipment" })).toBe(true);
  });
  it("never a rental, a wanted listing, property, personal or project work", () => {
    expect(isPurchasableListing({ listingKind: "rental", subject: "tools" })).toBe(false);
    expect(isPurchasableListing({ listingKind: "wanted", subject: "goods_other" })).toBe(false);
    expect(isPurchasableListing({ listingKind: "sale", subject: "premises" })).toBe(false);
    expect(isPurchasableListing({ listingKind: "sale", subject: "accommodation" })).toBe(false);
    expect(isPurchasableListing({ listingKind: "sale", subject: "personal" })).toBe(false);
    expect(isPurchasableListing({ listingKind: "sale", subject: "project_work" })).toBe(false);
    expect(isPurchasableListing({ listingKind: "sale", subject: "unknown_subject" })).toBe(false);
  });
});

describe("input validation mirrors the RPC bounds", () => {
  const base = { listingId: ID, quantity: 1, fulfilmentMethod: "pickup" as const };
  it("accepts a minimal pickup", () => {
    expect(validatePurchaseInput(base, { today: TODAY })).toEqual({ ok: true });
  });
  it("refuses a bad id, zero or NaN quantity, and more than the stated stock", () => {
    expect(validatePurchaseInput({ ...base, listingId: "x" }, { today: TODAY })).toEqual({ ok: false, field: "listingId" });
    expect(validatePurchaseInput({ ...base, quantity: 0 }, { today: TODAY })).toEqual({ ok: false, field: "quantity" });
    expect(validatePurchaseInput({ ...base, quantity: Number.NaN }, { today: TODAY })).toEqual({ ok: false, field: "quantity" });
    expect(validatePurchaseInput({ ...base, quantity: 4 }, { today: TODAY, stock: 3 })).toEqual({ ok: false, field: "quantity" });
  });
  it("delivery needs a place; a country must be two letters; the date not in the past", () => {
    expect(validatePurchaseInput({ ...base, fulfilmentMethod: "delivery" }, { today: TODAY })).toEqual({
      ok: false,
      field: "deliveryLocationLabel",
    });
    expect(
      validatePurchaseInput(
        { ...base, fulfilmentMethod: "delivery", deliveryLocationLabel: "Site B", deliveryCountry: "LTU" },
        { today: TODAY },
      ),
    ).toEqual({ ok: false, field: "deliveryCountry" });
    expect(validatePurchaseInput({ ...base, requestedDate: "2026-10-22" }, { today: TODAY })).toEqual({
      ok: false,
      field: "requestedDate",
    });
    expect(validatePurchaseInput({ ...base, requestedDate: TODAY }, { today: TODAY })).toEqual({ ok: true });
  });
  it("refuses an unknown handover method", () => {
    expect(validatePurchaseInput({ ...base, fulfilmentMethod: "drone" as never }, { today: TODAY })).toEqual({
      ok: false,
      field: "fulfilmentMethod",
    });
  });
});

describe("database refusals map to a closed set", () => {
  it("raised tokens map 1:1; the open-request index maps to already_requested", () => {
    expect(requestRefusalFrom({ message: "listing_not_purchasable" })).toBe("listing_not_purchasable");
    expect(requestRefusalFrom({ code: "23505", message: "duplicate key" })).toBe("already_requested");
    expect(requestRefusalFrom({ message: "something else" })).toBeNull();
    expect(requestRefusalFrom(null)).toBeNull();
  });
});

describe("side resolution and the conversation gate", () => {
  const row = {
    buyer_id: "b",
    seller_id: "s",
    buyer_organization_id: "ob",
    seller_organization_id: "os",
  };
  it("direct parties first, then a governed organization on either side; otherwise none", () => {
    expect(sideOf(row, "s", new Set())).toEqual({ side: "seller", viaOrganization: false });
    expect(sideOf(row, "b", new Set())).toEqual({ side: "buyer", viaOrganization: false });
    expect(sideOf(row, "m", new Set(["os"]))).toEqual({ side: "seller", viaOrganization: true });
    expect(sideOf(row, "m", new Set(["ob"]))).toEqual({ side: "buyer", viaOrganization: true });
    expect(sideOf(row, "m", new Set())).toBeNull();
  });
  it("the thread opens for live or done purchases only", () => {
    expect(canOpenPurchaseConversation("requested")).toBe(true);
    expect(canOpenPurchaseConversation("accepted")).toBe(true);
    expect(canOpenPurchaseConversation("fulfilled")).toBe(true);
    expect(canOpenPurchaseConversation("declined")).toBe(false);
    expect(canOpenPurchaseConversation("cancelled")).toBe(false);
  });
});

describe("no payment", () => {
  it("the only payment arrangement is direct between the parties", () => {
    expect([...PAYMENT_ARRANGEMENTS]).toEqual(["direct_between_parties"]);
  });
});
