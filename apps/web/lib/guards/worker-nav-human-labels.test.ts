import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";
import { TODAY_STATIONS } from "../today/today-route";

/**
 * Human navigation guard (slice human-nav-cleanup-v1, PR E).
 *
 * The logged-in navigation must follow the human, action-first logic
 * (Mano erdvė / Žemėlapis / Darbo žurnalas / Žinutės), settings live in the
 * avatar menu, and every surface stays reachable. (The card-wall pins that
 * watched the second dashboard retired with it — W3 Package 4 deleted the
 * page itself.)
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const tabs = (j: Record<string, unknown>) =>
  ((j.auth as { dashboard: { tabs: Record<string, string> } }).dashboard).tabs;

describe("primary nav uses human, action-first labels (not module words)", () => {
  it("LT primary tabs read as erdvė / žemėlapis / darbo žurnalas / žinutės", () => {
    const tl = tabs(lt);
    expect(tl.overview).toMatch(/erdvė/i);
    expect(tl.marketMap).toMatch(/žemėlap/i);
    expect(tl.journal).toMatch(/žurnal/i);
    expect(tl.communication).toMatch(/žinut/i);
  });
  it("EN primary tabs mirror the human labels", () => {
    const tl = tabs(en);
    expect(tl.overview).toMatch(/space/i);
    expect(tl.marketMap).toMatch(/map/i);
    expect(tl.journal).toMatch(/journal/i);
    expect(tl.communication).toMatch(/message/i);
  });
  it("no module / cockpit / dashboard wording in the primary tab labels", () => {
    for (const j of [lt, en]) {
      const blob = [
        tabs(j).overview,
        tabs(j).marketMap,
        tabs(j).journal,
        tabs(j).communication,
      ].join(" ");
      expect(blob).not.toMatch(/\bdashboard\b|cockpit|\bmodul/i);
      expect(blob).not.toMatch(/profile completion|profilio užbaigim/i);
    }
  });
});

describe("compact action-first global nav + sub-surface reachability", () => {
  it("the global nav is the action-first set: space + map + journal + messages", () => {
    const hrefs = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.href);
    for (const r of [
      "/dashboard",
      "/dashboard/market-map",
      "/dashboard/journal",
      "/dashboard/communication",
    ]) {
      expect(hrefs, `compact nav must include ${r}`).toContain(r);
    }
  });

  it("profile + account/settings are NOT global tabs (sub-surface / avatar menu)", () => {
    const hrefs = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.href);
    for (const r of ["/dashboard/profile", "/dashboard/account"]) {
      expect(hrefs, `${r} must NOT be a global nav tab`).not.toContain(r);
    }
    // the abstract marketplace hub is NOT a global tab (the map replaced it)
    expect(hrefs, "marketplace hub is not a global tab").not.toContain(
      "/dashboard/marketplace",
    );
  });

  it("profile stays reachable as a sub-surface (account page)", () => {
    // IdentityActions died with the second dashboard (W3 Package 4); the
    // account page keeps the profile door.
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(account).toMatch(/\/dashboard\/profile/);
  });

  it("account/settings stays reachable via the avatar account menu", () => {
    const menu = read("components/app/account-menu.tsx");
    expect(menu).toMatch(/\/dashboard\/account/);
  });
});

describe("ONE home — the conversation; ŠIANDIEN is its opening context (owner decision 0017, 2026-09-22)", () => {
  // RETIRED: the worker's 3-tab bar ŠIANDIEN · PASAULIS · PAKLAUSK (IA
  // 2026-09-13 §2). Three bottom tabs read as three product roots and made
  // the conversation a feature to find ("Paklausk"). Frozen contract §2.3
  // called the set "a hypothesis, not irreversible architecture"; the owner
  // retired it. What the tabs carried is preserved: ŠIANDIEN is composed
  // INSIDE the conversation's opening, PASAULIS is the opportunities station
  // + a chat intent + a search command, PAKLAUSK is the always-present
  // composer. The catalogue bar survives for the admin console only.
  const stations = (j: Record<string, unknown>) =>
    (j.todayScreen as { home: { stations: Record<string, string> } }).home.stations;

  it("no worker bar component, no `today` chrome mode, no `?ask=1` door", () => {
    expect(existsSync(join(root, "components/app/today/worker-bottom-nav.tsx"))).toBe(false);
    const chrome = read("components/app/dashboard-chrome.tsx");
    expect(chrome).not.toMatch(/WorkerBottomNav|workerNav|=== "today"|useSearchParams/);
    expect(chrome).toMatch(/dashboardChromeMode\(pathname\)/);
    expect(read("app/[locale]/dashboard/layout.tsx")).not.toMatch(/workerNav|todayScreen\.nav/);
    expect(read("components/app/today/today-screen.tsx")).not.toMatch(/ask=1|ASK_PARAM|today-ask/);
    // The retired tab labels are gone from the catalogs — nothing can render them.
    expect((lt.todayScreen as Record<string, unknown>).nav).toBeUndefined();
    expect((en.todayScreen as Record<string, unknown>).nav).toBeUndefined();
  });

  it("the root page renders the conversation for every identity, with ŠIANDIEN in its opening slot", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/openingContext=\{workerToday \? <TodayScreen\b/);
    expect(page).not.toMatch(/dashboardRootSurface|rootSurface === "today"/);
    // The bottom-nav primitive is the catalogue bar again — no caller-composed
    // tab set, no `placement`/`visibility` variants kept "just in case".
    expect(read("components/app/bottom-nav.tsx")).not.toMatch(/WorkerNavIconKey|explicitItems|placement/);
  });

  it("ŠIANDIEN renders no page quick-nav strip (a second nav strip is card soup)", () => {
    const dir = join(root, "components", "app", "today");
    for (const f of readdirSync(dir)) {
      expect(read(`components/app/today/${f}`), f).not.toMatch(/PageQuickNav|page-quick-nav/);
    }
    expect(read("app/[locale]/dashboard/page.tsx")).not.toMatch(/PageQuickNav/);
  });

  it("the stations are text links, one tap from ŠIANDIEN — opportunities (the former PASAULIS) first", () => {
    expect(TODAY_STATIONS.map((s) => s.href)).toEqual([
      "/dashboard/opportunities",
      "/dashboard/journal",
      "/dashboard/work-in-numbers",
      "/dashboard/profile",
      "/cv",
      "/dashboard/gallery",
    ]);
    const screen = read("components/app/today/today-screen.tsx");
    expect(screen).toMatch(/TODAY_STATIONS\.map/);
    expect(screen).toMatch(/today-station-\$\{s\.id\}/);
    // Every station has a human label in LT and EN (the former tab label
    // "Pasaulis" / "World" moved here, so nothing was retyped by a machine).
    for (const s of TODAY_STATIONS) {
      expect(stations(lt)[s.id], `lt ${s.id}`).toBeTruthy();
      expect(stations(en)[s.id], `en ${s.id}`).toBeTruthy();
    }
    expect(stations(lt).world).toBe("Pasaulis");
  });
});

describe("the work-card editor keeps its canonical home", () => {
  // The duplicate-door / card-wall pins targeted the second dashboard's
  // page, which W3 Package 4 deleted outright — the strongest form of
  // duplicate removal. The surviving half of that contract: the work-card
  // editor lives in the player-card result.
  it("the player-card result carries the work-card editor", () => {
    expect(read("components/app/workspace/player-card-result.tsx")).toMatch(
      /<WorkCardEditor/,
    );
  });
});
