import { describe, expect, it } from "vitest";

import { structureValueStatement } from "@/lib/structuring/value-statement";
import { LISTING_CATEGORIES } from "@/lib/marketplace/listings-model";
import { getValueChannel, VALUE_CHANNELS } from "./channel-registry";
import { assessChannelEligibility } from "./eligibility";
import { discoverChannels } from "./discovery";

/**
 * V10 channel eligibility — the closed verdict set over the six fixtures
 * plus the adversarial refusals. Every expectation runs the REAL structurer
 * first (no hand-built statements), so a structurer change that breaks
 * routing fails here.
 */

const TODAY = "2026-08-13";

const verdictFor = (text: string, channelId: string) => {
  const statement = structureValueStatement(text, TODAY);
  const e = assessChannelEligibility(statement, text);
  return e.verdicts.find((v) => v.channelId === channelId)!;
};

describe("registry construction", () => {
  it("marketplace categories are the SHARED work-bounded vocabulary, not a copy", () => {
    const marketplace = getValueChannel("internal_marketplace_listings")!;
    expect(marketplace.workBoundedCategories).toBe(LISTING_CATEGORIES);
  });

  it("no external goods/buyer channel is registered", () => {
    for (const c of VALUE_CHANNELS) {
      if (c.channelType !== "external") continue;
      expect(c.valueTypesSupported).not.toContain("goods");
      expect(c.valueTypesSupported).not.toContain("equipment_capacity");
    }
  });

  it("every destination is a real route or an existing conversation flow", () => {
    for (const c of VALUE_CHANNELS) {
      expect(
        c.destination.startsWith("/dashboard/") ||
          c.destination.startsWith("conversation:"),
        c.channelId,
      ).toBe(true);
    }
  });
});

describe("fixtures route honestly", () => {
  it("A (cucumbers): LEGAL_CHECK_REQUIRED on the marketplace — net gated", () => {
    const v = verdictFor(
      "Turiu 30 kg savo darže užaugintų agurkų ir noriu parduoti",
      "internal_marketplace_listings",
    );
    expect(v.kind).toBe("LEGAL_CHECK_REQUIRED");
    expect(v.legalCheckKey).toBe("food_sale_rules");
  });

  it("A' (wooden pallets): CHANNEL_RESTRICTED — category honestly unsupported", () => {
    const v = verdictFor(
      "Pagaminome 500 medinių palečių ir norime jas parduoti.",
      "internal_marketplace_listings",
    );
    expect(v.kind).toBe("CHANNEL_RESTRICTED");
    expect(v.reasonKey).toBe("category_not_supported");
  });

  it("B' (excavator free three days): CAN_ROUTE marketplace as machinery RENTAL", () => {
    const v = verdictFor(
      "Mūsų ekskavatorius laisvas trims dienoms.",
      "internal_marketplace_listings",
    );
    expect(v.kind).toBe("CAN_ROUTE");
    expect(v.listingCategory).toBe("machinery");
    expect(v.listingKind).toBe("rental");
  });

  it("C' (translation): CAN_ROUTE service offerings", () => {
    const v = verdictFor(
      "Galiu versti dokumentus iš lenkų į lietuvių.",
      "internal_service_offerings",
    );
    expect(v.kind).toBe("CAN_ROUTE");
  });

  it("B (electrician capacity): CAN_ROUTE the internal demand board", () => {
    const v = verdictFor(
      "Esu elektrikas ir kitą savaitę turiu dvi laisvas dienas",
      "internal_demand_board",
    );
    expect(v.kind).toBe("CAN_ROUTE");
  });

  it("C (four welders): CAN_ROUTE the internal demand board (create-demand)", () => {
    const v = verdictFor(
      "Mūsų įmonei kitą mėnesį trūks keturių suvirintojų",
      "internal_demand_board",
    );
    expect(v.kind).toBe("CAN_ROUTE");
  });
});

describe("adversarial — restricted categories refuse EVERY channel", () => {
  const cases = [
    "Noriu parduoti ginklą",
    "Parduodu vaistus",
    "Parduodu dėžę degtinės",
    "Turiu 200 pakelių cigarečių ir noriu parduoti",
    "Selling a gun",
    "Продам оружие",
  ];
  for (const text of cases) {
    it(`"${text}" → UNSUPPORTED everywhere, no alternative`, () => {
      const statement = structureValueStatement(text, TODAY);
      const e = assessChannelEligibility(statement, text);
      expect(e.verdicts.length).toBeGreaterThan(0);
      for (const v of e.verdicts) {
        expect(v.kind, v.channelId).toBe("UNSUPPORTED");
        expect(v.reasonKey).toBe("restricted_category");
      }
    });
  }
});

describe("authority is a claim, never a verification", () => {
  it("defaults to claimed; only confirmed_by_user may be minted", () => {
    const s = structureValueStatement("Parduodu grąžtą", TODAY);
    expect(assessChannelEligibility(s).authorityStatus).toBe("claimed");
    expect(
      assessChannelEligibility(s, undefined, "confirmed_by_user").authorityStatus,
    ).toBe("confirmed_by_user");
  });
});

describe("discovery ranks factually", () => {
  it("routable options come first; refusals last; ordering stable", () => {
    const text = "Mūsų ekskavatorius laisvas trims dienoms.";
    const d = discoverChannels(structureValueStatement(text, TODAY), text);
    expect(d.options[0].channelId).toBe("internal_marketplace_listings");
    expect(d.options[0].verdict.kind).toBe("CAN_ROUTE");
    const kinds = d.options.map((o) => o.verdict.kind);
    const order = ["CAN_ROUTE", "NEEDS_MORE_INFORMATION", "LEGAL_CHECK_REQUIRED", "CHANNEL_RESTRICTED", "UNSUPPORTED"];
    const ranks = kinds.map((k) => order.indexOf(k));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("an unreadable statement asks for information instead of routing", () => {
    const text = "labas rytas";
    const d = discoverChannels(structureValueStatement(text, TODAY), text);
    for (const o of d.options) {
      expect(o.verdict.kind).toBe("NEEDS_MORE_INFORMATION");
      expect(o.missing?.length).toBeGreaterThan(0);
    }
  });
});
