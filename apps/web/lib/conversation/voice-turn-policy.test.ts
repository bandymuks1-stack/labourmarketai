import { describe, expect, it } from "vitest";

import { isPlainAffirmation } from "./conversation-goal";
import {
  VOICE_CHIP_ONLY_HANDLERS,
  preRouteDisposition,
  singleMatchNeedsChip,
} from "./voice-turn-policy";
import { INTENT_REGISTRY } from "./intent-registry";

describe("a bare yes is never a command from speech", () => {
  const bare = ["yes", "Yes.", "ok", "okay", "taip", "Gerai!", "ja", "да", "akkoord", "  yes  "];
  for (const w of bare) {
    it(`"${w}" is plain affirmation; voice refuses it before routing, typed does not`, () => {
      expect(isPlainAffirmation(w)).toBe(true);
      expect(preRouteDisposition({ origin: "voice", text: w })).toBe("refuse-bare-affirmation");
      expect(preRouteDisposition({ origin: "typed", text: w })).toBe("route");
    });
  }
  it("a sentence with content is not bare - it routes normally", () => {
    for (const w of ["yes, accept the offer", "taip, priimk pasiūlymą", "ok show my hours", "continue with the booking"]) {
      expect(isPlainAffirmation(w), w).toBe(false);
      expect(preRouteDisposition({ origin: "voice", text: w })).toBe("route");
    }
  });
});

describe("single fuzzy matches become chips for voice", () => {
  it("covers exactly the three guarded handlers, all of which exist in the intent registry", () => {
    expect([...VOICE_CHIP_ONLY_HANDLERS].sort()).toEqual(["openConversation", "switchContext", "writeEmployer"]);
    const handlers = new Set(Object.values(INTENT_REGISTRY).map((e) => e.handler as string));
    for (const h of VOICE_CHIP_ONLY_HANDLERS) expect(handlers.has(h), h).toBe(true);
  });
  it("voice needs a chip; typed does not", () => {
    for (const h of VOICE_CHIP_ONLY_HANDLERS) {
      expect(singleMatchNeedsChip("voice", h)).toBe(true);
      expect(singleMatchNeedsChip("typed", h)).toBe(false);
    }
  });
});
