import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPINE_SIGNALS } from "@/lib/notifications/spine-signals";

/**
 * A brigade's offer against a company's need must REACH that company (walk
 * 2026-10-11): a bell/Today signal while it waits, and the scouting page opens
 * the need that carries it — before worker-interest and the structured-first
 * fallback. Same receiver RPC the section renders; no new table.
 */
const APP = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf8");

describe("a team offer reaches the receiving company", () => {
  it("is a spine signal that clears on the scouting page", () => {
    const s = SPINE_SIGNALS.find((x) => x.id === "open-team-offers");
    expect(s?.type).toBe("open_team_offers");
    expect(s?.href).toBe("/dashboard/company/scouting");
    expect(s?.count({ openTeamOffers: 2 } as never)).toBe(2);
  });

  it("is counted from the caller's own OPEN needs through the receiver RPC", () => {
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(/listCompanyDemands\(\)\)\.filter\(\(d\) => d\.status !== "closed"\)/);
    expect(read("lib/company/team-offer.ts")).toMatch(/countOpenTeamOffersByDemand[\s\S]{0,700}listReceivedOffers\(id\)[\s\S]{0,300}o\.status === "offered"/);
  });

  it("scouting opens the need with a waiting team offer first, and badges it", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/request \?\?\s*mostTeamOffered \?\?\s*mostAwaited \?\?/);
    expect(page).toContain("scouting-demand-team-offers-");
  });
});
