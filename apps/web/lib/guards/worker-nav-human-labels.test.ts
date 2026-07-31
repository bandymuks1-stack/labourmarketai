import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Human navigation guard (slice human-nav-cleanup-v1, PR E).
 *
 * The logged-in navigation must follow the human, action-first logic
 * (Mano erdvė / Žemėlapis / Darbo žurnalas / Žinutės), settings live in the
 * avatar menu, every surface stays reachable, and the dashboard keeps no
 * duplicate doors / card wall.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const tabs = (j: Record<string, unknown>) =>
  ((j.auth as { dashboard: { tabs: Record<string, string> } }).dashboard).tabs;
const DASH = "app/[locale]/dashboard/advanced/page.tsx";

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

  it("profile stays reachable as a sub-surface (account page / overview actions)", () => {
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(account).toMatch(/\/dashboard\/profile/);
    const identity = read("components/app/identity-actions.tsx");
    expect(identity).toMatch(/\/dashboard\/profile/);
  });

  it("account/settings stays reachable via the avatar account menu", () => {
    const menu = read("components/app/account-menu.tsx");
    expect(menu).toMatch(/\/dashboard\/account/);
  });
});

describe("worker dashboard has no duplicate doors / card wall", () => {
  const page = read(DASH);
  it("removed the bottom 'other spaces' account handle (duplicate doorway)", () => {
    expect(page).not.toMatch(/my-space-account-handle/);
  });
  it("removed the profile/journal duplicate cards (the nav tabs own those doors)", () => {
    expect(page).not.toMatch(/tMy\("activities|tMy\("proofCard|mySpace\.activities/);
  });
  it("still surfaces the worker's folded next action + current-space header (identity preserved)", () => {
    // WorkCard was removed (dedup v1); the worker identity/card area is the hub
    // person block, which carries the folded next action + inline editor.
    // W3 row 1: the editor left this page with the person card and lives in
    // the `player-card` result. Both halves pinned.
    expect(page).not.toMatch(/workEditor/);
    expect(read("components/app/workspace/player-card-result.tsx")).toMatch(
      /<WorkCardEditor/,
    );
    expect(page).toMatch(/<CurrentSpaceHeader role=\{role\} \/>/);
  });
  it("keeps the page free of inline primary gradient CTAs (the one CTA is the work card's)", () => {
    expect(page).not.toMatch(/from-brand-blue to-brand-cyan/);
  });
});
