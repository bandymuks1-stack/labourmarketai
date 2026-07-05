import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMMAND_REGISTRY,
  MAX_COMMAND_RESULTS,
  matchCommands,
  normalizeForSearch,
  type CommandAudience,
} from "../navigation/command-registry";

/**
 * WAGON 3 guards — universal command finder (train doc §WAGON 3):
 *
 *  1. every registry route exists (resolved against the real app tree);
 *  2. no result points to an INTERNAL_ADMIN / GATED_PREVIEW /
 *     DUPLICATE_DRIFT / REDIRECT_STUB surface unless audience === "admin"
 *     (admin entries may target INTERNAL_ADMIN only);
 *  3. no duplicate conflicting labels for one action;
 *  4. no payment / checkout action in the registry;
 *  5. registry i18n completeness — labels + synonyms in lt/en/ru;
 *  6. the finder UI renders results ONLY from the registry (no free
 *     navigation invention);
 *  7. audience filtering: admin-only entries never match for non-admins.
 */

const APP_DIR = join(process.cwd(), "app", "[locale]");
const ACTIVE = ["lt", "en", "ru"] as const;

/** Resolve a locale-prefix-free route to a page.tsx in the app tree. The
 *  marketing group segment `(marketing)` is transparent in the URL. */
function routeExists(route: string): boolean {
  const rel = route.replace(/^\//, "");
  const candidates = [
    join(APP_DIR, rel, "page.tsx"),
    join(APP_DIR, "(marketing)", rel, "page.tsx"),
  ];
  return candidates.some((p) => existsSync(p));
}

// Mirror of the route-truth-map classes a NON-admin finder result must
// never target (route-truth-map.test.ts is the canonical list; this local
// mirror fails loudly if the registry ever links one of them).
const INTERNAL_ADMIN_PREFIX = "/dashboard/admin";
const FORBIDDEN_NON_ADMIN_TARGETS = new Set<string>([
  // GATED_PREVIEW
  "/dashboard/talent",
  "/dashboard/visual-os",
  "/dashboard/visual-os/agency",
  "/dashboard/learning",
  // DUPLICATE_DRIFT
  "/dashboard/buyer",
  "/dashboard/start/buyer",
  "/dashboard/search",
  "/dashboard/market/recognize",
  // REDIRECT_STUB — link the real destination, never the stub
  "/dashboard/marketplace",
  "/dashboard/player-card",
  "/dashboard/agency",
  "/dashboard/agency/pool",
  "/dashboard/start/agency",
]);

describe("command finder — registry route truth", () => {
  it("every registry route resolves to a real page in the app tree", () => {
    const missing = COMMAND_REGISTRY.filter((e) => !routeExists(e.route)).map(
      (e) => `${e.id} → ${e.route}`,
    );
    expect(missing, "registry routes without a real page").toEqual([]);
  });

  it("non-admin entries never target internal/gated/drift/stub surfaces", () => {
    const bad = COMMAND_REGISTRY.filter(
      (e) =>
        e.audience !== "admin" &&
        (e.route.startsWith(INTERNAL_ADMIN_PREFIX) ||
          FORBIDDEN_NON_ADMIN_TARGETS.has(e.route)),
    ).map((e) => `${e.id} → ${e.route}`);
    expect(bad).toEqual([]);
  });

  it("admin entries target only the internal admin tree", () => {
    const bad = COMMAND_REGISTRY.filter(
      (e) => e.audience === "admin" && !e.route.startsWith(INTERNAL_ADMIN_PREFIX),
    ).map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it("no payment / checkout action in the registry", () => {
    const paymentish = /(checkout|payment|billing|subscribe|stripe|mollie|paypal)/i;
    const bad = COMMAND_REGISTRY.filter(
      (e) => paymentish.test(e.route) || paymentish.test(e.id),
    ).map((e) => e.id);
    expect(bad).toEqual([]);
  });
});

describe("command finder — registry data quality", () => {
  it("ids are unique", () => {
    const ids = COMMAND_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no duplicate conflicting labels for one action (per locale)", () => {
    for (const locale of ACTIVE) {
      const seen = new Map<string, string>();
      for (const e of COMMAND_REGISTRY) {
        const label = normalizeForSearch(e.labels[locale]);
        const prior = seen.get(label);
        expect(
          prior,
          `duplicate ${locale} label "${e.labels[locale]}" on ${prior} and ${e.id}`,
        ).toBeUndefined();
        seen.set(label, e.id);
      }
    }
  });

  it("i18n completeness — non-empty label and at least one synonym in lt/en/ru", () => {
    for (const e of COMMAND_REGISTRY) {
      for (const locale of ACTIVE) {
        expect(
          e.labels[locale]?.trim().length,
          `${e.id} missing ${locale} label`,
        ).toBeGreaterThan(0);
        expect(
          e.synonyms[locale]?.length,
          `${e.id} missing ${locale} synonyms`,
        ).toBeGreaterThan(0);
        for (const s of e.synonyms[locale]) {
          expect(s.trim().length, `${e.id} empty ${locale} synonym`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("audience values are valid", () => {
    const valid: CommandAudience[] = ["public", "worker", "company", "admin"];
    for (const e of COMMAND_REGISTRY) {
      expect(valid).toContain(e.audience);
    }
  });

  it("finder UI copy exists in all active locales", () => {
    for (const locale of ACTIVE) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as Record<string, Record<string, string>>;
      const ns = messages.commandFinder;
      expect(ns, `${locale}.json missing commandFinder namespace`).toBeTruthy();
      for (const key of [
        "title",
        "placeholder",
        "inputLabel",
        "resultsLabel",
        "noResults",
      ]) {
        expect(
          ns[key]?.trim().length,
          `${locale}.json commandFinder.${key} empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("command finder — the train doc's term list resolves", () => {
  // Every term from the WAGON 3 spec list must produce at least one result
  // for the widest honest audience (worker+company; admin terms excluded —
  // the spec list has none). Locale column: what a real user would type.
  const ALL = new Set<CommandAudience>(["public", "worker", "company"]);
  const TERMS: ReadonlyArray<readonly [string, (typeof ACTIVE)[number]]> = [
    ["cv", "lt"],
    ["player card", "en"],
    ["kortelė", "lt"],
    ["profile", "en"],
    ["profilis", "lt"],
    ["work journal", "en"],
    ["žurnalas", "lt"],
    ["skills", "en"],
    ["įgūdžiai", "lt"],
    ["team", "en"],
    ["komanda", "lt"],
    ["brigade", "en"],
    ["brigada", "lt"],
    ["object", "en"],
    ["objektas", "lt"],
    ["project", "en"],
    ["job", "en"],
    ["darbas", "lt"],
    ["demand", "en"],
    ["paklausa", "lt"],
    ["find workers", "en"],
    ["darbuotojai", "lt"],
    ["find work", "en"],
    ["services", "en"],
    ["paslaugos", "lt"],
    ["recruiter", "en"],
    ["legal help", "en"],
    ["accounting help", "en"],
    ["buhalterija", "lt"],
    ["documents", "en"],
    ["dokumentai", "lt"],
    ["transport", "en"],
    ["transportas", "lt"],
    ["tools", "en"],
    ["įrankiai", "lt"],
    ["accommodation", "en"],
    ["apgyvendinimas", "lt"],
    ["messages", "en"],
    ["žinutės", "lt"],
    ["follow-up", "en"],
    ["pricing", "en"],
    ["kainos", "lt"],
    ["privacy", "en"],
    ["privatumas", "lt"],
    ["gdpr", "lt"],
    ["резюме", "ru"],
    ["журнал", "ru"],
    ["команда", "ru"],
  ];

  it.each(TERMS)("term %s (%s) finds at least one result", (term, locale) => {
    expect(matchCommands(term, locale, ALL).length).toBeGreaterThan(0);
  });
});

describe("command finder — matching + audience behaviour", () => {
  const ALL = new Set<CommandAudience>(["public", "worker", "company", "admin"]);
  const PUBLIC_ONLY = new Set<CommandAudience>(["public"]);

  it("diacritics-insensitive: 'kortele' finds the Player Card, 'zurnalas' the journal", () => {
    const cards = matchCommands("kortele", "lt", ALL).map((e) => e.id);
    expect(cards).toContain("player_card");
    const journal = matchCommands("zurnalas", "lt", ALL).map((e) => e.id);
    expect(journal).toContain("work_journal");
  });

  it("EN fallback: an EN term matches from the lt/ru locale", () => {
    expect(matchCommands("privacy", "lt", ALL).map((e) => e.id)).toContain(
      "privacy",
    );
    expect(matchCommands("pricing", "ru", ALL).map((e) => e.id)).toContain(
      "pricing",
    );
  });

  it("admin-only entries never surface without the admin audience", () => {
    const workerCompany = new Set<CommandAudience>([
      "public",
      "worker",
      "company",
    ]);
    expect(
      matchCommands("admin", "en", workerCompany).map((e) => e.id),
    ).not.toContain("admin_control_room");
    expect(matchCommands("admin", "en", ALL).map((e) => e.id)).toContain(
      "admin_control_room",
    );
  });

  it("audience filter hides role-scoped entries from a public-only viewer", () => {
    expect(matchCommands("scouting", "en", PUBLIC_ONLY)).toEqual([]);
    expect(matchCommands("cv", "en", PUBLIC_ONLY).map((e) => e.id)).not.toContain(
      "cv",
    );
  });

  it("empty query yields no results and result count is capped", () => {
    expect(matchCommands("", "lt", ALL)).toEqual([]);
    expect(matchCommands("   ", "lt", ALL)).toEqual([]);
    for (const q of ["a", "o", "e"]) {
      expect(
        matchCommands(q, "lt", ALL).length,
      ).toBeLessThanOrEqual(MAX_COMMAND_RESULTS);
    }
  });
});

describe("command finder — UI renders only from the registry", () => {
  const src = readFileSync(
    join(process.cwd(), "components", "app", "command-finder.tsx"),
    "utf8",
  );

  it("component consumes matchCommands from the curated registry", () => {
    expect(src).toContain('from "@/lib/navigation/command-registry"');
    expect(src).toContain("matchCommands(");
  });

  it("component contains no hardcoded route hrefs (registry routes only)", () => {
    // The ONLY href in the finder is entry.route — no literal "/..." link
    // targets, so the UI cannot invent navigation outside the registry.
    expect(src).not.toMatch(/href=\{?["']\//);
    expect(src).toContain("href={entry.route");
  });
});

// ── Owner lock (2026-07-05): NO FAKE FINDER RESULTS for WAGON-10-pending
// help terms. Until Wagon 10 lands the real internal request flow, the
// recruiter/accounting/legal help entries must read as INFORMATION/help
// surfaces (never "request X" action phrasing) and route only to honest
// existing surfaces. When Wagon 10 ships the real CTAs, update routes AND
// this guard together — action phrasing becomes legal only then.
describe("W10-pending help terms stay information-shaped (owner lock)", () => {
  const PENDING_IDS = ["recruiter_help", "accounting_help", "legal_help"];
  const ACTION_TOKENS = [
    /request\s/i, // en action phrasing
    /užsak/i, // lt "užsakyti"
    /pateikti užklaus/i, // lt "submit a request"
    /заказать/i, // ru order
    /запросить/i, // ru request
  ];
  const INFO_ROUTE_ALLOWLIST = new Set([
    "/dashboard/service-requests",
    "/dashboard/documents",
    "/about",
  ]);
  for (const id of PENDING_IDS) {
    const entry = COMMAND_REGISTRY.find((e) => e.id === id);
    it(`${id} exists and routes to an allowed info surface`, () => {
      expect(entry).toBeTruthy();
      expect(INFO_ROUTE_ALLOWLIST.has(entry!.route)).toBe(true);
    });
    it(`${id} labels carry no request-action phrasing in any locale`, () => {
      for (const locale of ["en", "lt", "ru"] as const) {
        const label = entry!.labels[locale];
        for (const rx of ACTION_TOKENS) {
          expect(label, `${id}.${locale} label "${label}"`).not.toMatch(rx);
        }
      }
    });
  }
});
