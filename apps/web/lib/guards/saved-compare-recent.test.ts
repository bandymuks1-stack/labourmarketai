/**
 * Guard — saved bookmarks / recently viewed / compare (Marketplace Precision
 * Phase-2 PR 5).
 *
 * Pins the honesty contract of the three board conveniences:
 *
 *  1. #723 compat — the saved-opportunities lib speaks EXACTLY the draft
 *     migration's vocabulary (table worker_saved_opportunities, RPCs
 *     save_worker_opportunity_v1 / unsave_worker_opportunity_v1 with
 *     p_request_id / p_note) and maps every absent-store error code
 *     (42P01 / 42883 / PGRST202) to feature-absent. NOTHING applies SQL.
 *  2. Honest invisibility — when the owner-gated store is absent the save
 *     toggle is NOT rendered (source-pinned conditional), never a dead button.
 *  3. Recently viewed is DEVICE-LOCAL and minimal: capped at 10 entries and
 *     structurally unable to store anything beyond (id, viewedAtIso) pairs.
 *  4. Compare renders ONLY the whitelisted fact keys; gaps become the honest
 *     "not stated" — never a fabricated value, never persisted, no score.
 *  5. i18n parity ×11 for opportunities.saved / .recent / .compare.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMPARE_FACT_KEYS,
  COMPARE_MAX,
  COMPARE_MIN,
  completeCompareFacts,
} from "@/lib/opportunities/compare-facts";
import {
  RECENTLY_VIEWED_MAX,
  parseRecentlyViewed,
  recordRecentlyViewed,
} from "@/lib/opportunities/recently-viewed";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// ── 1. #723 vocabulary pinned ────────────────────────────────────────────────

describe("saved-opportunities lib — pinned to the #723 draft migration", () => {
  const lib = read("lib/opportunities/saved-opportunities.ts");

  it("uses exactly the #723 table + RPC names and parameter names", () => {
    expect(lib).toContain('from("worker_saved_opportunities")');
    expect(lib).toContain('rpc("save_worker_opportunity_v1"');
    expect(lib).toContain('rpc("unsave_worker_opportunity_v1"');
    expect(lib).toContain("p_request_id");
    expect(lib).toContain("p_note");
    // No legacy/renamed vocabulary may sneak in.
    expect(lib).not.toMatch(/save_opportunity_v2|worker_saved_demands/);
  });

  it("maps every absent-store error code to feature-absent and never applies SQL", () => {
    for (const code of ["42P01", "42883", "PGRST202"]) {
      expect(lib, `missing code ${code}`).toContain(code);
    }
    expect(lib).toContain('"feature-absent"');
    // Read path: RLS-scoped select of OWN rows only, never a broad select.
    expect(lib).toContain('.select("request_id")');
    expect(lib).toContain('.eq("worker_id", workerId)');
    // The lib is a client of the applied schema — it never ships DDL.
    expect(lib).not.toMatch(/create\s+table|create\s+or\s+replace\s+function/i);
  });

  it("server actions are thin wrappers over the gated flows", () => {
    const actions = read("lib/opportunities/saved-actions.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("saveOpportunity(");
    expect(actions).toContain("unsaveOpportunity(");
  });
});

// ── 2. Feature-absent → toggle not rendered (honest invisibility) ────────────

describe("save toggle — rendered ONLY when the owner-gated store exists", () => {
  it("the page gates <WorkerSaveOpportunityButton> on result.savedAvailable", () => {
    const page = read("app/[locale]/dashboard/opportunities/page.tsx");
    // The ONLY mount of the toggle sits directly inside the savedAvailable
    // conditional — absence is invisibility, not a broken button.
    expect(page).toMatch(
      /result\.savedAvailable \? \([\s\S]{0,200}<WorkerSaveOpportunityButton/,
    );
    const mounts = page.match(/<WorkerSaveOpportunityButton/g) ?? [];
    expect(mounts).toHaveLength(1);
    // The saved section is gated on the same server-side feature detection.
    expect(page).toContain("result.savedAvailable &&");
    expect(page).toContain('data-testid="opportunities-saved"');
    expect(page).toContain('data-testid="opportunities-saved-stale"');
  });

  it("the loader feature-detects once per page load via listMySavedOpportunities", () => {
    const loader = read("lib/opportunities/load-worker-opportunities.ts");
    expect(loader).toContain("listMySavedOpportunities(supabase, ctx.workerId)");
    expect(loader).toContain("savedAvailable: mySaved.available");
    expect(loader).toContain("saved: mySaved.requestIds.has(need.id)");
  });
});

// ── 3. Recently viewed — device-local, capped, ids + timestamps ONLY ─────────

describe("recently viewed — caps at 10 and stores nothing beyond id + timestamp", () => {
  const NOW = "2026-07-11T12:00:00.000Z";

  it(`caps at ${RECENTLY_VIEWED_MAX} entries, newest first, deduped`, () => {
    expect(RECENTLY_VIEWED_MAX).toBe(10);
    let list: ReturnType<typeof recordRecentlyViewed> = [];
    for (let i = 0; i < 25; i++) {
      list = recordRecentlyViewed(list, `id-${i}`, NOW);
    }
    expect(list).toHaveLength(10);
    expect(list[0]?.id).toBe("id-24");
    // Re-viewing moves to the front without duplicating.
    list = recordRecentlyViewed(list, "id-20", "2026-07-11T13:00:00.000Z");
    expect(list).toHaveLength(10);
    expect(list[0]).toEqual({ id: "id-20", viewedAtIso: "2026-07-11T13:00:00.000Z" });
    expect(list.filter((e) => e.id === "id-20")).toHaveLength(1);
  });

  it("structurally strips anything beyond (id, viewedAtIso) — even smuggled fields", () => {
    const smuggled = [
      {
        id: "keep",
        viewedAtIso: NOW,
        title: "LEAKED TITLE",
        pay: "9000",
        company: "LEAKED CO",
      },
      { id: "bad-ts", viewedAtIso: "not-a-date" },
      { viewedAtIso: NOW },
      "garbage",
      42,
    ];
    const next = recordRecentlyViewed(smuggled, "new", NOW);
    expect(next).toEqual([
      { id: "new", viewedAtIso: NOW },
      { id: "keep", viewedAtIso: NOW },
    ]);
    const json = JSON.stringify(next);
    for (const leak of ["LEAKED TITLE", "LEAKED CO", "title", "pay", "company"]) {
      expect(json, `leaked: ${leak}`).not.toContain(leak);
    }
    // Every entry is exactly the two allowed keys.
    for (const entry of next) {
      expect(Object.keys(entry).sort()).toEqual(["id", "viewedAtIso"]);
    }
  });

  it("parse is tolerant: garbage in → empty list out, cap enforced", () => {
    expect(parseRecentlyViewed(undefined)).toEqual([]);
    expect(parseRecentlyViewed("")).toEqual([]);
    expect(parseRecentlyViewed("{not json")).toEqual([]);
    expect(parseRecentlyViewed('{"a":1}')).toEqual([]);
    const oversized = JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({ id: `id-${i}`, viewedAtIso: NOW })),
    );
    expect(parseRecentlyViewed(oversized)).toHaveLength(10);
  });

  it("the strip discloses device-only storage and the disclosure records on open", () => {
    const strip = read("components/app/recently-viewed-strip.tsx");
    expect(strip).toContain("labels.deviceOnly");
    expect(strip).toContain("readRecentlyViewedFromStorage");
    // No server persistence anywhere near the recently-viewed path.
    expect(strip).not.toMatch(/supabase|fetch\(|\.rpc\(/i);
    const util = read("lib/opportunities/recently-viewed.ts");
    expect(util).not.toMatch(/supabase|fetch\(|\.rpc\(|"use server"/i);
    const disclosure = read("components/app/opportunity-details-disclosure.tsx");
    expect(disclosure).toContain("recordRecentlyViewedInStorage(recentlyViewedId)");
  });
});

// ── 4. Compare — whitelisted fact keys only, honest gaps, pure client ────────

describe("compare — closed fact whitelist, no persistence, no score", () => {
  it("the whitelist is pinned", () => {
    expect([...COMPARE_FACT_KEYS]).toEqual([
      "pay",
      "hours",
      "start",
      "engagement",
      "accommodation",
      "transport",
      "tools",
      "languages",
      "location",
      "company",
    ]);
    expect(COMPARE_MIN).toBe(2);
    expect(COMPARE_MAX).toBe(3);
  });

  it("completeCompareFacts emits EXACTLY the whitelist — unknown keys dropped, gaps honest", () => {
    const facts = completeCompareFacts(
      {
        pay: "14.50–18 EUR / hour (gross)",
        location: "Rotterdam · Netherlands",
        // Whitelist-shaped but empty/dash values → honest fallback.
        hours: "",
        transport: "—",
        // Smuggled non-whitelisted keys must be dropped.
        ...({ score: "97%", popularity: "hot", phone: "+370600" } as object),
      },
      "not stated",
    );
    expect(Object.keys(facts).sort()).toEqual([...COMPARE_FACT_KEYS].sort());
    expect(facts.pay).toBe("14.50–18 EUR / hour (gross)");
    expect(facts.hours).toBe("not stated");
    expect(facts.transport).toBe("not stated");
    expect(facts.company).toBe("not stated");
    const json = JSON.stringify(facts);
    for (const leak of ["score", "97%", "popularity", "phone", "+370600"]) {
      expect(json, `leaked: ${leak}`).not.toContain(leak);
    }
  });

  it("the compare table iterates COMPARE_FACT_KEYS and persists/fetches nothing", () => {
    const component = read("components/app/opportunity-compare.tsx");
    expect(component).toContain("COMPARE_FACT_KEYS.map((key)");
    expect(component).toContain("e.facts[key]");
    // Pure client state: no storage, no network, no server round-trip.
    expect(component).not.toMatch(/localStorage|sessionStorage|supabase|fetch\(|\.rpc\(/i);
    // Mobile honesty: horizontal scroll INSIDE the table's own container.
    expect(component).toContain("overflow-x-auto");
    // Real pressed-state chip.
    expect(component).toContain("aria-pressed={isSelected}");
  });

  it("the page builds compare entries through the whitelist normalizer", () => {
    const page = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toContain("completeCompareFacts(");
    expect(page).toContain("<CompareToggleChip");
    expect(page).toContain("<CompareBar");
    expect(page).toContain("<OpportunityCompareProvider>");
  });
});

// ── 5. i18n parity ×11 ───────────────────────────────────────────────────────

describe("i18n — opportunities.saved / .recent / .compare parity in all 11 catalogs", () => {
  const LOCALES = ["en", "lt", "ru", "nl", "de", "da", "lv", "et", "pl", "no", "sv"] as const;
  const NAMESPACES = ["saved", "recent", "compare"] as const;

  function leafPaths(obj: unknown, path = ""): string[] {
    if (typeof obj === "string") return [path];
    if (obj && typeof obj === "object") {
      return Object.entries(obj).flatMap(([k, v]) => leafPaths(v, path ? `${path}.${k}` : k));
    }
    return [];
  }

  type Catalog = { opportunities: Record<string, unknown> };
  const catalog = (locale: string) =>
    (JSON.parse(read(`messages/${locale}.json`)) as Catalog).opportunities;

  const en = catalog("en");
  const enKeys = NAMESPACES.flatMap((ns) => leafPaths(en[ns], ns)).sort();

  it("en defines the full key set", () => {
    expect(enKeys).toContain("saved.privateHint");
    expect(enKeys).toContain("saved.noLongerOpen");
    expect(enKeys).toContain("recent.deviceOnly");
    expect(enKeys).toContain("compare.notStated");
    for (const k of COMPARE_FACT_KEYS) expect(enKeys).toContain(`compare.fact.${k}`);
    expect(enKeys).toHaveLength(28);
  });

  for (const locale of LOCALES) {
    it(`${locale}: same key set, every value a non-empty string`, () => {
      const block = catalog(locale);
      const keys = NAMESPACES.flatMap((ns) => leafPaths(block[ns], ns)).sort();
      expect(keys).toEqual(enKeys);
      for (const ns of NAMESPACES) {
        const walk = (o: unknown): void => {
          if (typeof o === "string") {
            expect(o.trim()).not.toBe("");
            return;
          }
          if (o && typeof o === "object") Object.values(o).forEach(walk);
        };
        walk(block[ns]);
      }
    });
  }

  it("active locales (en/lt/ru/nl/de/da) carry REAL translations — no [EN] markers", () => {
    for (const locale of ["en", "lt", "ru", "nl", "de", "da"]) {
      const block = catalog(locale);
      const json = JSON.stringify(
        NAMESPACES.map((ns) => block[ns]),
      );
      expect(json, `${locale} leaked an [EN] marker`).not.toContain("[EN]");
    }
  });
});
