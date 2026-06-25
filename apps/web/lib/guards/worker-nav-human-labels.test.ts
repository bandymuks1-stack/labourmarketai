import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Human navigation guard (slice human-nav-cleanup-v1, PR E).
 *
 * The logged-in worker navigation must follow the human work-card logic
 * (Mano erdvė / Darbo kortelė / Įrodymai / Nustatymai), every primary route
 * stays reachable, and the dashboard keeps no duplicate doors / card wall.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const tabs = (j: Record<string, unknown>) =>
  ((j.auth as { dashboard: { tabs: Record<string, string> } }).dashboard).tabs;
const DASH = "app/[locale]/dashboard/page.tsx";

describe("primary nav uses human work-card labels, not module words", () => {
  it("LT tabs read as space / profilis / Mano CV / settings", () => {
    const tl = tabs(lt);
    expect(tl.overview).toMatch(/erdvė/i);
    // Marketplace IA: Profilis = edit identity; Mano CV = identity + work
    // records. The two are distinct, no competing "Darbo kortelė" tab.
    expect(tl.profile).toMatch(/profil/i);
    expect(tl.profile).not.toMatch(/kortel/i);
    expect(tl.journal).toMatch(/cv/i);
    expect(tl.journal).not.toMatch(/įrodym/i);
    expect(tl.account).toMatch(/nustatym/i);
  });
  it("EN tabs mirror the human labels", () => {
    const tl = tabs(en);
    expect(tl.overview).toMatch(/space/i);
    expect(tl.profile).toMatch(/profile/i);
    expect(tl.profile).not.toMatch(/card/i);
    expect(tl.journal).toMatch(/cv/i);
    expect(tl.journal).not.toMatch(/evidence/i);
    expect(tl.account).toMatch(/setting/i);
  });
  it("no module / cockpit / dashboard wording in the primary tab labels", () => {
    for (const j of [lt, en]) {
      const blob = [
        tabs(j).overview,
        tabs(j).profile,
        tabs(j).journal,
        tabs(j).account,
      ].join(" ");
      expect(blob).not.toMatch(/\bdashboard\b|cockpit|\bmodul/i);
      expect(blob).not.toMatch(/Apžvalga|Žurnalas|profile completion|profilio užbaigim/i);
    }
  });
});

describe("compact global nav + sub-surface reachability (IA cleanup v2)", () => {
  it("the global nav is the compact, map-first set: space + map + messages + settings", () => {
    const hrefs = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.href);
    for (const r of [
      "/dashboard",
      "/dashboard/market-map",
      "/dashboard/communication",
      "/dashboard/account",
    ]) {
      expect(hrefs, `compact nav must include ${r}`).toContain(r);
    }
  });

  it("profile + Mano CV are demoted OUT of the global nav (now sub-surfaces)", () => {
    const hrefs = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.href);
    for (const r of ["/dashboard/profile", "/dashboard/journal"]) {
      expect(hrefs, `${r} must NOT be a global nav tab`).not.toContain(r);
    }
    // the abstract marketplace hub is NOT a global tab (the map replaced it)
    expect(hrefs, "marketplace hub is not a global tab").not.toContain(
      "/dashboard/marketplace",
    );
  });

  it("profile + Mano CV stay reachable as sub-surfaces (account menu / overview)", () => {
    // Account settings links to the profile identity surface; the overview
    // identity actions reach profile + CV. Reachability is preserved without
    // a global tab for each.
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(account).toMatch(/\/dashboard\/profile/);
    const identity = read("components/app/identity-actions.tsx");
    expect(identity).toMatch(/\/dashboard\/(profile|journal)/);
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
  it("still mounts the work card + current-space header (identity preserved)", () => {
    expect(page).toMatch(/<WorkCard\b/);
    expect(page).toMatch(/<CurrentSpaceHeader role=\{role\} \/>/);
  });
  it("keeps the page free of inline primary gradient CTAs (the one CTA is the work card's)", () => {
    expect(page).not.toMatch(/from-brand-blue to-brand-cyan/);
  });
});
