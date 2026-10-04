import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Marketplace ACTOR dimension — structural guard (owner item 8).
 * The universal model carries ACTOR next to DIRECTION and DOMAIN. The kind is
 * derived from canonical facts; an agency is an organisation CAPABILITY
 * (organization_roles), never a legacy account / company type (ORG-2).
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const IO = read(join(WEB, "lib", "marketplace", "federation.ts"));
const MODEL = read(join(WEB, "lib", "marketplace", "federation-model.ts"));
const LISTINGS = read(join(WEB, "lib", "marketplace", "listings.ts"));
const SECTION = read(join(WEB, "components", "app", "marketplace-listings-section.tsx"));

describe("actor kind derivation", () => {
  it("no adapter reads company_type / organization_type as authority", () => {
    const c = code(IO) + code(MODEL);
    expect(c).not.toMatch(/company_type|organization_type|staffing_agency/);
  });

  it("agency comes from the capability roles; organisation kinds from the listing-keyed capability function", () => {
    expect(code(MODEL)).toContain("AGENCY_CAPABILITY_ROLES");
    expect(code(LISTINGS)).toContain("org_capabilities_for_visible_listings_v1");
  });

  it("the app never reads organization_roles directly (member-only table, RLS untouched)", () => {
    expect(code(LISTINGS)).not.toMatch(/from\("organization_roles"\)/);
  });

  it("the capability function is narrow: listing-keyed, published rows only, slugs only, no anon", () => {
    const sql = read(
      join(WEB, "..", "..", "supabase", "migrations", "20261003151200_market_org_capabilities_for_visible_listings_v1.sql"),
    ).replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/returns table \(listing_id uuid, role_slug text\)/);
    expect(sql).toMatch(/m\.status = 'active'/);
    expect(sql).toMatch(/expires_at is null or m\.expires_at > now\(\)/);
    expect(sql).toMatch(/auth\.uid\(\) is not null/);
    expect(sql).toMatch(/set search_path = public, pg_temp/);
    expect(sql).toMatch(/revoke all on function public\.org_capabilities_for_visible_listings_v1\(uuid\[\]\) from anon/);
    expect(sql).not.toMatch(/to anon/);
    expect(sql).not.toMatch(/alter table|create policy|drop policy/i);
  });

  it("adapters never copy a poster identity into the row", () => {
    expect(code(MODEL)).not.toMatch(/ownerId:\s*(raw|r)\./);
    expect(code(MODEL)).not.toMatch(/organizationId:\s*(raw|r)\./);
  });
});

describe("actor UI + i18n", () => {
  it("chip and filter are rendered", () => {
    expect(SECTION).toContain("market-row-actor");
    expect(SECTION).toContain("market-actor-filter");
  });

  for (const loc of ["de", "en", "lt", "nl", "pl", "ru"]) {
    it(`${loc}: actor keys present, non-empty, no banned words`, () => {
      const m = JSON.parse(read(join(WEB, "messages", `${loc}.json`))).marketplaceListings;
      expect(String(m.actorFilterLabel ?? "").trim().length).toBeGreaterThan(0);
      for (const k of ["all", "person", "company", "institution", "agency", "service_provider", "supplier", "other"]) {
        expect(String(m.actorKinds?.[k] ?? "").trim().length, `${loc}.actorKinds.${k}`).toBeGreaterThan(0);
      }
      expect(JSON.stringify(m.actorKinds)).not.toMatch(/\b(demo|player|game)\b/i);
    });
  }
});
