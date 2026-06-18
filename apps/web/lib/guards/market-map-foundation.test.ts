import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the live market map FOUNDATION is honest and inert.
 *  - the /dashboard/market-map route exists and is auth-gated like a dashboard;
 *  - NO fake marker / seeded geo data;
 *  - NO external map API / key / env dependency (Mapbox / Google Maps);
 *  - the shell has the planned layers, a filter bar, a status legend and a
 *    next-action panel;
 *  - copy frames it as a "live labour-market map", never a directory/catalogue;
 *  - copy present in every active locale.
 */
const APP_ROOT = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}
function str(root: Record<string, unknown>, path: string): string {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

const PAGE = "app/[locale]/dashboard/market-map/page.tsx";
const SHELL = "components/app/market-map-shell.tsx";

describe("market map foundation — route + auth", () => {
  const page = read(PAGE);

  it("the /dashboard/market-map route exists and renders the shell", () => {
    expect(page).toMatch(/<MarketMapShell\b/);
  });
  it("is auth-gated like a dashboard room (getUser → redirect to login)", () => {
    expect(page).toMatch(/auth\.getUser\(\)/);
    expect(page).toMatch(/redirect\(`\/\$\{locale\}\/auth\/login`\)/);
  });
  it("is reachable from the main dashboard", () => {
    const dash = read("app/[locale]/dashboard/page.tsx");
    expect(dash).toMatch(/data-testid="dashboard-market-map-link"/);
    expect(dash).toMatch(/\/dashboard\/market-map/);
  });
});

describe("market map foundation — no fake data, no external map API", () => {
  const shell = read(SHELL);
  const page = read(PAGE);

  it("has NO seeded marker / coordinate arrays", () => {
    expect(shell).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/\bgeoPayloads\b|placeholders/);
    expect(shell).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
  });
  it("the signal-board shell has NO external map API / key (Mapbox / Google Maps)", () => {
    // The real Google Maps BASE now lives in the dedicated, config-gated
    // <MarketMapBase> component (slice market-map-google-base-v1). The signal
    // board shell stays free of external map APIs and never plots markers.
    expect(shell).not.toMatch(/mapbox/i);
    expect(shell).not.toMatch(/google[^\n]*maps/i);
    expect(shell).not.toMatch(/process\.env[^\n]*MAP|NEXT_PUBLIC_[A-Z_]*MAP|access[_-]?token/i);
    // Neither the shell nor the page uses Mapbox or an access token anywhere.
    for (const src of [shell, page]) {
      expect(src).not.toMatch(/mapbox/i);
      expect(src).not.toMatch(/access[_-]?token/i);
    }
  });
});

describe("market map foundation — shell sections", () => {
  const shell = read(SHELL);
  for (const id of [
    "market-map-shell",
    "market-map-filters",
    "market-map-canvas",
    "market-map-legend",
    "market-map-layers",
    "market-map-next-actions",
    "back-to-action-center",
    "market-map-owner-scope-note",
  ]) {
    it(`renders ${id}`, () => {
      expect(shell).toMatch(new RegExp(`data-testid="${id}"`));
    });
  }
});

describe("market map foundation — honest copy in every active locale", () => {
  const DIRECTORY = /\bdirectory\b|katalog|каталог/i;
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: title + owner scope note + layers + next actions present`, () => {
      expect(str(m, "marketMap.title"), `${locale} title`).toBeTruthy();
      expect(str(m, "marketMap.ownerScopeNote"), `${locale} ownerScopeNote`).toBeTruthy();
      expect(str(m, "marketMap.layers.workers.label"), `${locale} layer`).toBeTruthy();
      expect(str(m, "marketMap.layers.accommodation.label"), `${locale} accommodation`).toBeTruthy();
      expect(str(m, "marketMap.nextActions.companyNeed"), `${locale} action`).toBeTruthy();
    });
    it(`${locale}: it is a living map, not a directory/catalogue`, () => {
      expect(str(m, "marketMap.title")).not.toMatch(DIRECTORY);
      expect(str(m, "marketMap.subtitle")).not.toMatch(DIRECTORY);
    });
  }
  it("lt title frames it as the owner's own working market map", () => {
    expect(str(loadMessages("lt"), "marketMap.title")).toMatch(/mano rinkos žemėlapis/i);
  });
});
