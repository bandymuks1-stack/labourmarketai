import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LIVE-MARKET ENTRANCE (home ↔ the ONE Market Map).
 *
 * The home and the map's signals rail show the SAME market brief, every
 * signal is a real edge into a layer of the ONE canonical map, and the map
 * keeps its privacy and truth limits: no contact data or foreign request id
 * reaches the client, no people count is implied, marker size is never
 * presented as a measurement.
 */
const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const WORLD_READ = read("lib/market-map/world-read.ts");
const WORLD = read("components/app/market-map/world-discovery.tsx");
const PAGE = read("app/[locale]/dashboard/market-map/page.tsx");
const LIST = read("components/app/market-map/market-signal-list.tsx");
const MODEL = read("lib/market-map/market-brief-model.ts");
const BRIEF = read("lib/market-map/market-brief.ts");
const HOME = read("components/app/home/home-regions.tsx");

describe("one brief, two surfaces", () => {
  it("the home region and the map rail render the same list from the same loader", () => {
    expect(HOME).toMatch(/loadMarketBrief\(\)/);
    expect(HOME).toMatch(/<MarketSignalList brief=\{brief\} variant="home"/);
    expect(PAGE).toMatch(/loadMarketBrief\(\)/);
    expect(read("components/app/market-map/market-signals-rail.tsx")).toMatch(
      /<MarketSignalList brief=\{brief\} variant="rail"/,
    );
  });

  it("the market region is mounted on the person's home and on the company home", () => {
    expect(read("components/app/today/today-screen.tsx")).toMatch(/<HomeMarket \/>/);
    expect(read("components/app/organization/company-model-screen.tsx")).toMatch(/<HomeMarket \/>/);
  });

  it("every signal is an edge into the ONE map, on the layer that shows it", () => {
    expect(LIST).toMatch(/\/dashboard\/market-map\?layer=/);
    expect(HOME).toMatch(/href="\/dashboard\/market-map"/);
    expect(PAGE).toMatch(/WORLD_LAYER_PARAM/);
    expect(PAGE).toMatch(/STATIC_LAYER_PARAM/);
  });

  it("the brief composes existing readers and runs no query of its own", () => {
    expect(BRIEF).not.toMatch(/\.from\(|\.rpc\(/);
    expect(BRIEF).not.toMatch(/createClient|service[_-]?role|createAdminClient/i);
  });

  it("there is still exactly one map engine on the page", () => {
    expect(PAGE.match(/<WorldDiscovery/g)).toHaveLength(1);
    expect(LIST + read("components/app/market-map/market-signals-rail.tsx")).not.toMatch(/leaflet|<MarketMap/i);
  });
});

describe("the brief refuses to invent", () => {
  it("has no field for a ratio, rate, match, team or people count", () => {
    const types = MODEL.slice(MODEL.indexOf("export type MarketBrief"), MODEL.indexOf("export type MarketBriefInputs"));
    expect(types).not.toMatch(/ratio|rate|match|team|people|supply|headcount/i);
  });
});

describe("presentation safety on the map", () => {
  it("a need's free-text role passes the safe-label filter", () => {
    expect(WORLD_READ).toMatch(/safeMarketLabel\(row\.roleText\)/);
    expect(WORLD_READ).not.toMatch(/label:\s*row\.roleText/);
  });

  it("a need's object id is an opaque index, never the customer_request key", () => {
    expect(WORLD_READ).toMatch(/id:\s*`need:\$\{demandIndex\+\+\}`/);
    expect(WORLD_READ).not.toMatch(/id:\s*row\.key/);
  });

  it("nothing on the client opens a need by id", () => {
    expect(WORLD).not.toMatch(/customer_request|customer-request|requests\/\{id\}/);
    // The only per-entity link is a project (RLS-visible, authorised again on arrival) or the company.
    expect(WORLD).toMatch(/projectHrefTemplate/);
    expect(WORLD).toMatch(/companyHref/);
  });

  it("an empty people layer with withheld groups says 'withheld', never 'nobody'", () => {
    expect(WORLD).toMatch(/state\.suppressed/);
    expect(WORLD).toMatch(/counts\.withheld/);
  });

  it("marker size is stated as relative, never as a market measure", () => {
    expect(WORLD).toMatch(/data-testid="world-size-note"/);
    expect(read("components/app/market-map/market-signals-rail.tsx")).toMatch(/sizeNote/);
  });

  it("the rail states that people are not counted", () => {
    expect(read("components/app/market-map/market-signals-rail.tsx")).toMatch(/peopleNote/);
  });
});
