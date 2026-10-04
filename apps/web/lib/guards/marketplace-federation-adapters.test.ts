import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Marketplace FEDERATION ADAPTERS — structural guard.
 *
 * Owner requirement: the Universal Marketplace is a FEDERATED discovery over
 * the canonical domain sources, never one table. This slice adds adapters for
 * vacancies, available workforce and project / contract demand WITHOUT any
 * schema change and WITHOUT widening any reader. This guard pins:
 *
 *  1. adapters compose ONLY the existing gated readers (no service role, no
 *     table reads, no writes, no new SQL);
 *  2. the anon boundary: the hidden vacancy title is never read;
 *  3. no individual worker is listed (discoverability stays per-need,
 *     consent-gated, anonymized in scouting);
 *  4. the SQL index view is NOT widened to demand / vacancies;
 *  5. the domains appear in the normal discovery UI behind the existing route;
 *  6. i18n keys exist in every locale that carries the namespace;
 *  7. no banned product words.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const IO = read(join(WEB, "lib", "marketplace", "federation.ts"));
const MODEL = read(join(WEB, "lib", "marketplace", "federation-model.ts"));
const LISTINGS = read(join(WEB, "lib", "marketplace", "listings.ts"));
const SECTION = read(join(WEB, "components", "app", "marketplace-listings-section.tsx"));

describe("1. adapters compose existing authorized readers only", () => {
  it("IO half is server-only and the model half is pure", () => {
    expect(IO).toMatch(/import "server-only"/);
    expect(code(MODEL)).not.toMatch(/server-only/);
    expect(code(MODEL)).not.toMatch(/@\/lib\/supabase/);
  });

  it("reaches the three sources through their own gated readers", () => {
    const c = code(IO);
    expect(c).toContain("search_public_vacancy_previews_v1");
    expect(c).toContain("listAvailableSupplyForEmployer");
    expect(c).toContain("loadCanonicalDemand");
  });

  it("holds no service role, no table read, no write", () => {
    const c = code(IO) + code(MODEL);
    expect(c).not.toMatch(/service_role|createAdminClient|SUPABASE_SERVICE/i);
    expect(c).not.toMatch(/\.from\(/);
    expect(c).not.toMatch(/\.(insert|upsert|update|delete)\(/);
  });

  it("slice ships no migration of its own", () => {
    const mig = readdirSync(join(REPO, "supabase", "migrations")).filter((f) =>
      /federat|marketplace_adapter/i.test(f),
    );
    expect(mig).toEqual([]);
  });
});

describe("2. anon boundary of public vacancies is preserved", () => {
  it("never reads title_raw / attribution_code as a value", () => {
    const c = code(MODEL) + code(IO);
    expect(c).not.toMatch(/raw\.title_raw/);
    expect(c).not.toMatch(/attribution_code/);
  });

  it("calls the RPC with exactly the four anon-boundary arguments", () => {
    expect(code(IO)).toMatch(
      /p_query:[^}]*p_profession_slug:[^}]*p_limit:[^}]*p_offset:/,
    );
  });
});

describe("3. no individual worker is listed", () => {
  it("adapters never touch workers / profiles / worker consent", () => {
    const c = code(IO) + code(MODEL);
    expect(c).not.toMatch(/can_view_worker|profile_discoverability|from\("workers"\)|from\("profiles"\)/);
  });
});

describe("4. the SQL index view stays federated-by-table, not widened", () => {
  it("market_index_v1 still unions only listings + service offerings", () => {
    const sql = read(
      join(REPO, "supabase", "migrations", "20261003150300_marketplace_index_v1.sql"),
    );
    const view = sql.slice(sql.indexOf("create or replace view public.market_index_v1"));
    const body = view.slice(0, view.indexOf("-- 11."));
    expect(body).toContain("from public.marketplace_listings");
    expect(body).toContain("from public.service_offerings");
    expect(body).not.toContain("customer_requests");
    expect(body).not.toContain("public_vacancies");
  });

  it("discovery keeps the view as the base and composes adapters on top", () => {
    expect(LISTINGS).toContain('from("market_index_v1")');
    expect(LISTINGS).toContain("readFederatedMarketRows");
    expect(LISTINGS).toContain("mergeDiscoveryRows");
  });
});

describe("5. the new domains are in the normal discovery UI", () => {
  it("tabs, provenance + visibility chips, source link and partial notice render", () => {
    expect(SECTION).toMatch(/"service", "job", "workforce"/);
    expect(SECTION).toContain("market-row-visibility");
    expect(SECTION).toContain("market-row-provenance");
    expect(SECTION).toContain("federation-partial");
    expect(SECTION).toContain('row.contactAction === "open_source"');
  });

  it("the page passes the unavailable-source signal through", () => {
    const page = read(join(WEB, "app", "[locale]", "dashboard", "listings", "page.tsx"));
    expect(page).toContain("unavailable={unavailable}");
  });
});

describe("6. i18n: every locale that carries the namespace has the keys", () => {
  const LOCALES = ["de", "en", "lt", "nl", "pl", "ru"] as const;
  const FLAT = ["federationPartial", "allJobsLink", "titleNotStated", "openInSource"] as const;
  const VIS = ["public", "signed_in", "organizations", "workers", "own"] as const;
  const PROV = ["platform", "external_vacancy"] as const;

  for (const loc of LOCALES) {
    it(`${loc}: federation keys present and non-empty`, () => {
      const m = JSON.parse(read(join(WEB, "messages", `${loc}.json`))).marketplaceListings;
      for (const k of FLAT) expect(String(m[k] ?? "").trim().length, `${loc}.${k}`).toBeGreaterThan(0);
      for (const d of ["job", "workforce"]) {
        expect(String(m.domains?.[d] ?? "").trim().length, `${loc}.domains.${d}`).toBeGreaterThan(0);
      }
      for (const v of VIS) expect(String(m.visibility?.[v] ?? "").trim().length).toBeGreaterThan(0);
      for (const p of PROV) expect(String(m.provenance?.[p] ?? "").trim().length).toBeGreaterThan(0);
    });
  }

  it("every visibility / provenance value the model can emit has a key", () => {
    for (const v of ["public", "signed_in", "organizations", "workers", "own"]) {
      expect(MODEL + read(join(WEB, "lib", "marketplace", "listings-model.ts"))).toContain(`"${v}"`);
    }
  });
});

describe("7. banned product words", () => {
  it("new strings avoid demo / player / game", () => {
    for (const loc of ["de", "en", "lt", "nl", "pl", "ru"]) {
      const m = JSON.parse(read(join(WEB, "messages", `${loc}.json`))).marketplaceListings;
      const blob = JSON.stringify([m.visibility, m.provenance, m.federationPartial, m.allJobsLink, m.domains]);
      expect(blob).not.toMatch(/\b(demo|player|game)\b/i);
    }
  });
});
