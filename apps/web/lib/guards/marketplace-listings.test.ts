import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LISTING_CATEGORIES,
  LISTING_KINDS,
  LISTING_STATUSES,
} from "@/lib/marketplace/listings-model";
import { CONTACT_PERMISSION_STATES } from "@/lib/communication/communication-eligibility";
import { getModuleRoute } from "@/lib/dashboard/dashboard-module-registry";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Wagon 13 — European Work & Business Ecosystem Marketplace (work-resource
 * listings, slice 1) guard. Pins the doctrine contract: ONE new additive table,
 * default-closed + owner-gated, reusing the canonical service_offerings (for
 * services), conversations (for enquiries) and command registry (for search) —
 * no second marketplace / messaging / payment system.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260718210000_marketplace_listings.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260718210000_marketplace_listings.down.sql",
);

describe("1. migration is additive, default-closed, owner-gated (RED, reversible)", () => {
  it("migration + paired rollback exist", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
  });

  it("carries the human-gate marker and enables RLS", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/@human-gate-approved/);
    expect(sql).toMatch(/alter table public\.marketplace_listings enable row level security/);
  });

  it("every SECURITY DEFINER function pins search_path = public", () => {
    const sql = read(MIGRATION);
    const defs = sql.match(/security definer[^;]*?as \$\$/gi) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(4);
    for (const d of defs) {
      expect(d).toMatch(/set search_path = public/);
    }
  });

  it("grants only to authenticated — never anon, never using (true)", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/grant execute on function public\.create_marketplace_listing_v1/);
    // Scan the DDL only — honest header comments may NAME a banned pattern
    // (documenting what the migration avoids) without tripping the scan.
    const ddl = sql
      .split("\n")
      .filter((l) => !/^\s*--/.test(l))
      .join("\n");
    expect(ddl).not.toMatch(/to anon/);
    expect(ddl).not.toMatch(/using \(true\)/i);
  });

  it("discovery is bounded to active rows (no blanket read)", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/status = 'active'/);
  });

  it("rollback drops every new object", () => {
    const down = read(ROLLBACK);
    expect(down).toMatch(/drop table if exists public\.marketplace_listings/);
    expect(down).toMatch(/drop function if exists public\.create_marketplace_listing_v1/);
  });
});

describe("2. model vocabularies mirror the migration CHECK constraints", () => {
  const sql = read(MIGRATION);
  it("listing kinds match", () => {
    for (const k of LISTING_KINDS) expect(sql).toContain(`'${k}'`);
    expect([...LISTING_KINDS].sort()).toEqual(["rental", "sale", "wanted"]);
  });
  it("categories match (work-bounded, no generic consumer goods)", () => {
    for (const c of LISTING_CATEGORIES) expect(sql).toContain(`'${c}'`);
    expect(LISTING_CATEGORIES).toContain("accommodation");
    expect(LISTING_CATEGORIES).toContain("machinery");
  });
  it("statuses match", () => {
    for (const s of LISTING_STATUSES) expect(sql).toContain(`'${s}'`);
  });
});

describe("3. reuse — no second messaging / payment / marketplace system", () => {
  it("enquiries reuse the canonical conversation bridge with a real grant", () => {
    const srv = read(join(WEB, "lib", "marketplace", "listings.ts"));
    expect(srv).toMatch(/getOrCreateDirectConversation/);
    expect(srv).toMatch(/allowed_marketplace_enquiry/);
    // the grant must be a real, guard-pinned contact-permission state
    expect(CONTACT_PERMISSION_STATES).toContain("allowed_marketplace_enquiry");
  });

  it("no payment / checkout anywhere in the module", () => {
    const files = [
      read(MIGRATION),
      read(join(WEB, "lib", "marketplace", "listings.ts")),
      read(join(WEB, "lib", "marketplace", "listings-model.ts")),
      read(join(WEB, "components", "app", "marketplace-listings-section.tsx")),
    ].join("\n").toLowerCase();
    for (const banned of ["stripe", "checkout", "amount_cents", "price_cents", "payment_intent"]) {
      expect(files).not.toContain(banned);
    }
  });

  it("the client-safe model never imports a server-only module", () => {
    const model = read(join(WEB, "lib", "marketplace", "listings-model.ts"));
    expect(model).not.toMatch(/server-only/);
    expect(model).not.toMatch(/from "@\/lib\/supabase\/server"/);
  });
});

describe("4. route is a real, registered launch surface", () => {
  it("the listings module resolves to /dashboard/listings and the page exists", () => {
    expect(getModuleRoute("listings")).toBe("/dashboard/listings");
    expect(
      existsSync(join(WEB, "app", "[locale]", "dashboard", "listings", "page.tsx")),
    ).toBe(true);
  });
  it("is registered in the primary-route smoke inventory", () => {
    expect(PRIMARY_ROUTES.some((r) => r.urlPattern === "/dashboard/listings")).toBe(true);
  });
});

describe("5. copy resolves in every active locale", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (n, k) => (n && typeof n === "object" ? (n as Record<string, unknown>)[k] : undefined),
      msgs,
    );
  for (const loc of activeLocales) {
    it(`${loc}: title, intro, every kind/category/status resolve non-empty`, () => {
      const msgs = JSON.parse(read(join(WEB, "messages", `${loc}.json`)));
      const keys = [
        "marketplaceListings.pageTitle",
        "marketplaceListings.pageIntro",
        "marketplaceListings.enquire",
        ...LISTING_KINDS.map((k) => `marketplaceListings.kinds.${k}`),
        ...LISTING_CATEGORIES.map((c) => `marketplaceListings.categories.${c}`),
        ...LISTING_STATUSES.map((s) => `marketplaceListings.status.${s}`),
      ];
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});
