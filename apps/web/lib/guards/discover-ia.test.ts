import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  DISCOVER_ENTRIES,
  DISCOVER_GROUPS,
  discoverEntriesFor,
  groupDiscoverEntries,
} from "../discover/discover-registry";
import {
  CORE_NAV_IDS,
  VISIBLE_PRIMARY_NAV_ITEMS,
} from "../config/navigation";
import { getFeatureConfig } from "../config/feature-availability";
import { routeRequirement } from "../auth/role-gated-routes";

/**
 * DISCOVER IA GUARD (owner decision 2026-10-02).
 *
 * The marketplace is NOT only recruitment: it is the broader DISCOVER world
 * where people and businesses OFFER or SEEK work, services, work resources and
 * opportunities. It is a first-class, role-aware DESTINATION (not a corner of
 * the map). This guard replaces the old "map is the second tab" pin
 * (compact-nav-marketplace-ia.test.ts) with the new architecture and pins:
 *
 *  1. Discover is a primary tab AND a core destination of the one top bar;
 *  2. it lives at /dashboard/market (never the removed /dashboard/discover
 *     job-matching browse - matching-ui-neutralized.test.ts);
 *  3. it owns no data - every card is a link to a REAL existing section, and
 *     a role is never offered a card its destination would refuse;
 *  4. only production-real branches are listed (no RPL, no paid marketplace,
 *     no consumer classifieds, no sample listings);
 *  5. copy exists in all six locales and the word "demo" is absent.
 */

const ROOT = join(__dirname, "..", "..");
const APP = join(ROOT, "app", "[locale]");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const LOCALES = ["en", "lt", "de", "pl", "ru", "nl"] as const;

function pageExists(href: string): boolean {
  const rel = href.replace(/^\//, "");
  return (
    existsSync(join(APP, rel, "page.tsx")) ||
    existsSync(join(APP, "(marketing)", rel, "page.tsx"))
  );
}

describe("Discover is a first-class destination", () => {
  it("is the second primary tab and the second core destination", () => {
    const ids = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id);
    expect(ids[1]).toBe("discover");
    expect([...CORE_NAV_IDS].slice(0, 2)).toEqual(["overview", "discover"]);
    const f = getFeatureConfig("discover");
    expect(f.availability).toBe("active");
    expect(f.primaryRoute).toBe("/dashboard/market");
  });

  it("the map is a lens of Discover, no longer a tab, and still a real page", () => {
    expect(getFeatureConfig("market_map").safeToShowInPrimaryNav).toBe(false);
    expect(pageExists("/dashboard/market-map")).toBe(true);
    expect(DISCOVER_ENTRIES.some((e) => e.href === "/dashboard/market-map")).toBe(true);
  });

  it("the page exists; the removed /dashboard/discover browse does not", () => {
    expect(existsSync(join(APP, "dashboard", "market", "page.tsx"))).toBe(true);
    expect(existsSync(join(APP, "dashboard", "discover", "page.tsx"))).toBe(false);
  });

  it("/dashboard/marketplace now leads to Discover, not straight to the map", () => {
    const cfg = read("next.config.ts");
    expect(cfg).toMatch(
      /source:\s*"\/:locale\/dashboard\/marketplace",\s*destination:\s*"\/:locale\/dashboard\/market"/,
    );
  });

  it("the page owns no data: no database client, no writes", () => {
    const page = read("app/[locale]/dashboard/market/page.tsx");
    expect(page).not.toMatch(/\.from\(|\.rpc\(|insert\(|update\(|supabase/i);
  });
});

describe("registry truth", () => {
  it("every entry points at a real page", () => {
    const missing = DISCOVER_ENTRIES.filter((e) => !pageExists(e.href)).map((e) => e.href);
    expect(missing).toEqual([]);
  });

  it("ids are unique and every group is used", () => {
    const ids = DISCOVER_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of DISCOVER_GROUPS) {
      expect(DISCOVER_ENTRIES.some((e) => e.group === g), g).toBe(true);
    }
  });

  it("a card never leads a role into the destination's refusal (role gates mirrored)", () => {
    for (const e of DISCOVER_ENTRIES) {
      const req = routeRequirement(e.href);
      if (!req) continue;
      expect(req.kind, `${e.id} is operator-only and must not be a Discover card`).toBe("role");
      if (req.kind === "role") {
        // Org access to /dashboard/company* is derived from the active
        // organisation (membership), so agency is admitted like company.
        const allowed = req.role === "company" ? ["company", "agency"] : [req.role];
        expect(
          e.roles.every((r) => allowed.includes(r)),
          `${e.id}: roles ${e.roles.join(",")} exceed the gate ${req.role}`,
        ).toBe(true);
      }
    }
  });

  it("no admin / operator / preview route is offered", () => {
    for (const e of DISCOVER_ENTRIES) {
      expect(e.href).not.toMatch(/^\/dashboard\/(admin|talent|visual-os|learning)/);
    }
  });

  it("only production-real branches: nothing for RPL, payments, classifieds or sample listings", () => {
    const forbidden = /(rpl|recognition|checkout|payment|classified|sample|fixture|preview)/i;
    for (const e of DISCOVER_ENTRIES) {
      expect(`${e.id} ${e.href}`).not.toMatch(forbidden);
    }
  });

  it("role-aware: each role sees only what it can use", () => {
    const view = (roles: string[], capabilities: string[] = []) =>
      discoverEntriesFor({ roles: new Set(roles), capabilities: new Set(capabilities) }).map((e) => e.id);
    const worker = view(["worker"]);
    expect(worker).toContain("opportunities");
    expect(worker).not.toContain("scouting");
    expect(worker).not.toContain("needs");
    const company = view(["company"]);
    expect(company).toContain("scouting");
    expect(company).toContain("needs");
    expect(company).not.toContain("opportunities");
    expect(company).not.toContain("education");
    expect(view(["company"], ["training_provider"])).toContain("education");
    const customer = view(["customer"]);
    expect(customer).toContain("buyer");
    expect(customer).not.toContain("scouting");
    // the shared offer/seek branches are open to every role
    for (const list of [worker, company, customer]) {
      expect(list).toEqual(expect.arrayContaining(["map", "services", "service_requests", "listings", "network"]));
    }
    // groups with no entry for the viewer are dropped, never rendered empty
    expect(groupDiscoverEntries(discoverEntriesFor({ roles: new Set(["worker"]), capabilities: new Set() })).every((g) => g.entries.length > 0)).toBe(true);
  });
});

describe("copy: six locales, honest, no banned words", () => {
  for (const loc of LOCALES) {
    it(`${loc}: every group, entry, side and status string exists`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const d = m.discover;
      expect(d, "discover namespace").toBeTruthy();
      for (const k of ["eyebrow", "title", "lead", "honesty"]) expect(String(d[k] ?? "").trim(), k).not.toBe("");
      for (const s of ["seek", "offer", "both"]) expect(String(d.side?.[s] ?? "").trim(), s).not.toBe("");
      for (const s of ["early", "earlyNote"]) expect(String(d.status?.[s] ?? "").trim(), s).not.toBe("");
      for (const g of DISCOVER_GROUPS) {
        expect(String(d.groups?.[g]?.title ?? "").trim(), g).not.toBe("");
        expect(String(d.groups?.[g]?.lead ?? "").trim(), g).not.toBe("");
      }
      for (const e of DISCOVER_ENTRIES) {
        expect(String(d.entries?.[e.id]?.title ?? "").trim(), e.id).not.toBe("");
        expect(String(d.entries?.[e.id]?.desc ?? "").trim(), e.id).not.toBe("");
      }
      expect(String(m.auth.dashboard.tabs.discover ?? "").trim()).not.toBe("");
      expect(JSON.stringify(d)).not.toMatch(/\bdemo\b/i);
    });
  }
});

// ── Reachability: no working user-facing page may be orphaned ────────────────

function findPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) findPages(p, acc);
    else if (entry === "page.tsx") acc.push(p);
  }
  return acc;
}

/** Nav surfaces an ordinary person is given (or the finder reaches): a page named
 *  in one of these is PRIMARY / SECONDARY / FINDER. */
const NAV_SURFACES = [
  "lib/config/navigation.ts",
  "lib/config/feature-availability.ts",
  "lib/discover/discover-registry.ts",
  "lib/navigation/command-registry.ts",
  "lib/dashboard/dashboard-module-registry.ts",
  "components/app/account-menu.tsx",
  "components/marketing/site-nav.tsx",
  "components/marketing/site-footer.tsx",
  "components/layouts/site-nav.tsx",
] as const;

/**
 * Pages that are DELIBERATELY not in a nav surface: they are reached from the
 * page that owns them (CONTEXTUAL) or are addressed by id (DEEP-LINK ONLY).
 * Each names the file that really links to it. The list is a ratchet in both
 * directions: a page here that gains a nav-surface entry must leave the list,
 * and a new page that is in no nav surface must be added WITH a real inbound.
 */
const CONTEXTUAL: Record<string, { via: string; needle: string }> = {
  "dashboard/company/partners": { via: "components/app/company-home-field-section.tsx", needle: "/dashboard/company/partners" },
  "dashboard/company/people": { via: "components/app/organization/company-model-screen.tsx", needle: "/dashboard/company/people" },
  "dashboard/company/projects/new": { via: "app/[locale]/dashboard/company/page.tsx", needle: "/dashboard/company/projects/new" },
  "dashboard/gallery": { via: "app/[locale]/dashboard/profile/page.tsx", needle: "/dashboard/gallery" },
  "dashboard/inbox/quick": { via: "app/[locale]/dashboard/inbox/page.tsx", needle: "/dashboard/inbox/quick" },
  "dashboard/inbox/report": { via: "app/[locale]/dashboard/inbox/page.tsx", needle: "/dashboard/inbox/report" },
  "dashboard/journal/voice": { via: "app/[locale]/dashboard/journal/page.tsx", needle: "/dashboard/journal/voice" },
  // EDU-5 (owner): the review queue is reached through the manager brief chip
  // only while something awaits review - route-truth-map.test.ts.
  "dashboard/learning": { via: "lib/conversation/opening-brief.ts", needle: "EDU-5" },
  "dashboard/people/[workerId]": { via: "components/app/company-workers-section.tsx", needle: "/dashboard/people/" },
  "dashboard/projects/[id]": { via: "app/[locale]/dashboard/projects/page.tsx", needle: "/dashboard/projects/" },
  "dashboard/projects/[id]/operations": { via: "components/app/project-assignment-manager.tsx", needle: "/operations" },
  "dashboard/reports/evidence": { via: "app/[locale]/dashboard/documents/page.tsx", needle: "/dashboard/reports/evidence" },
  "dashboard/start/buyer": { via: "app/[locale]/dashboard/buyer/page.tsx", needle: "/dashboard/start/buyer" },
  "dashboard/communication/[conversationId]": { via: "app/[locale]/dashboard/communication/page.tsx", needle: "/dashboard/communication/" },
};

describe("reachability: no working dashboard page is orphaned", () => {
  const pages = findPages(join(APP, "dashboard"))
    .map((p) => relative(APP, p).split(sep).slice(0, -1).join("/"))
    // operator console + operator-only pages have their own hub and gate
    .filter((r) => !r.startsWith("dashboard/admin") && r !== "dashboard/talent");

  const surfaceText = NAV_SURFACES.filter((f) => existsSync(join(ROOT, f))).map((f) => read(f)).join("\n");

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inNavSurface = (route: string): boolean => {
    const body = route
      .split("/")
      .map((seg) => (/^\[.+\]$/.test(seg) ? "[^\"'`?#/]+" : escapeRe(seg)))
      .join("/");
    return new RegExp("[\"'`]/" + body + "(?:[\"'`?#/]|\\$\\{)").test(surfaceText);
  };

  it("every non-admin dashboard page is in a nav surface or has a declared, real contextual inbound", () => {
    const orphaned = pages.filter((r) => !inNavSurface(r) && !(r in CONTEXTUAL));
    expect(orphaned, "ORPHANED pages: give them a Discover/finder/menu entry or a contextual inbound").toEqual([]);
  });

  it("every contextual declaration is real (the linking file names the route)", () => {
    for (const [route, { via, needle }] of Object.entries(CONTEXTUAL)) {
      expect(pages, `${route} must exist`).toContain(route);
      expect(existsSync(join(ROOT, via)), `${via} must exist`).toBe(true);
      expect(read(via), `${via} must link ${route}`).toContain(needle);
    }
  });

  it("the contextual list only holds pages that are really outside the nav surfaces (ratchet)", () => {
    // /dashboard/projects/[id]-style dynamic routes cannot be matched by a
    // static string and stay here as DEEP-LINK ONLY.
    const stale = Object.keys(CONTEXTUAL).filter((r) => inNavSurface(r));
    expect(stale, "now in a nav surface - remove from CONTEXTUAL").toEqual([]);
  });

  it("the formerly weak capabilities now have a proper entry", () => {
    for (const route of [
      "dashboard/opportunities",
      "dashboard/listings",
      "dashboard/services",
      "dashboard/service-requests",
      "dashboard/market/recognize",
      "dashboard/company/education",
      "dashboard/company/needs",
      "dashboard/buyer",
      "dashboard/hours",
      "dashboard/work-in-numbers",
      "dashboard/instructions",
      "dashboard/intelligence",
      "dashboard/assist",
    ]) {
      expect(inNavSurface(route), `${route} must be in a nav surface`).toBe(true);
    }
  });
});
