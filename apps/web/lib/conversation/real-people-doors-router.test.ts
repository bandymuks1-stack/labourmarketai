import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent-router";

/**
 * Real-user fitness walk on production, 2026-09-06: sentences ordinary people
 * type when they want to OFFER something they can do. Before this, "galiu
 * kirpti plaukus namuose" and "noriu siūlyti buhalterijos paslaugas" both
 * landed in the not-understood menu, although the services door
 * (/dashboard/services) exists for exactly that. The offer verb is bound to
 * the activity in ONE regex so a bare occupation stem keeps its old route.
 */
describe("offering an everyday service routes to offer-value", () => {
  it.each([
    "galiu kirpti plaukus namuose",
    "Galiu mokyti matematikos vaikams",
    "siūlau valyti butus Vilniuje",
    "galiu tvarkyti sodus savaitgaliais",
    "noriu siūlyti buhalterijos paslaugas",
    "teikiu apskaitos paslaugas mažoms įmonėms",
    "I can paint houses and fences",
  ])("%s", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("offer-value");
  });

  it("diacritic-free typing reaches it too", () => {
    expect(classifyIntent("galiu kirpti plaukus namuose").intent).toBe("offer-value");
    expect(classifyIntent("noriu siulyti buhalterijos paslaugas").intent).toBe("offer-value");
  });

  it("a bare occupation need keeps its employer route (need-workers)", () => {
    expect(classifyIntent("reikia 2 valytojų Kaune").intent).toBe("need-workers");
    expect(classifyIntent("reikia santechniko").intent).toBe("need-workers");
  });

  it("'galiu mokytis' (to learn) is not an offer of a service", () => {
    expect(classifyIntent("galiu mokytis vakarais").intent).not.toBe("offer-value");
  });

  it("'galiu dirbti' (I can work) is not an offer of a service", () => {
    expect(classifyIntent("galiu dirbti nuo pirmadienio").intent).not.toBe("offer-value");
  });

  it("the translate REQUEST stays translate", () => {
    expect(classifyIntent("išversk šį tekstą į anglų kalbą").intent).not.toBe("offer-value");
  });
});
