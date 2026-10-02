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
import {
  ALL_SUBJECTS,
  LISTING_DOMAINS,
  SUBJECTS_BY_DOMAIN,
} from "@/lib/marketplace/market-model";

/**
 * Marketplace guard — Wagon 13 slice 1 (work-resource listings) PLUS the
 * universal-marketplace contract (migration 20261002170000, Option C).
 *
 * Pins the doctrine contract: reuse the existing domain tables
 * (marketplace_listings, service_offerings), ONE universal discovery view,
 * ONE policy hook, default-closed + owner-gated, reusing conversations (for
 * enquiries) and the command registry (for search). No second marketplace /
 * messaging / payment system.
 *
 * OWNER CONTRACT (final): NO payment / escrow / fulfilment, and NO age /
 * birth / adult column or adult-only domain model. The model is PERSON + a
 * separate POLICY layer. Goods and service needs are in scope - the earlier
 * "work-bounded, no generic consumer goods" scope assertion is superseded by
 * that contract and is replaced below by the age-column guard.
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
const V2_MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20261002170000_marketplace_index_v1.sql",
);
const V2_ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20261002170000_marketplace_index_v1.down.sql",
);
/** Executable SQL only - comments may NAME a banned pattern. */
const ddlOf = (p: string) =>
  read(p)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");

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
  it("the original 7 work categories still match the original migration", () => {
    // Owner contract (universal marketplace): goods / service needs / personal /
    // project listings are in scope via the subject registry - the former
    // "no generic consumer goods" assertion is superseded. See section 6.
    for (const c of LISTING_CATEGORIES) expect(sql).toContain(`'${c}'`);
    expect(LISTING_CATEGORIES).toContain("accommodation");
    expect(LISTING_CATEGORIES).toContain("machinery");
    expect([...LISTING_CATEGORIES]).toEqual([...SUBJECTS_BY_DOMAIN.work_resource]);
  });
  it("statuses match the widened CHECK (draft|active|paused|closed)", () => {
    const v2 = read(V2_MIGRATION);
    for (const s of LISTING_STATUSES) expect(v2).toContain(`'${s}'`);
    expect([...LISTING_STATUSES].sort()).toEqual(["active", "closed", "draft", "paused"]);
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
      ddlOf(V2_MIGRATION),
      read(join(WEB, "lib", "marketplace", "listings.ts")),
      read(join(WEB, "lib", "marketplace", "listings-model.ts")),
      read(join(WEB, "lib", "marketplace", "market-model.ts")),
      read(join(WEB, "lib", "marketplace", "publish-policy.ts")),
      read(join(WEB, "components", "app", "marketplace-listings-section.tsx")),
    ].join("\n").toLowerCase();
    for (const banned of [
      "stripe",
      "checkout",
      "amount_cents",
      "price_cents",
      "payment_intent",
      "escrow",
    ]) {
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
        ...ALL_SUBJECTS.map((c) => `marketplaceListings.categories.${c}`),
        ...LISTING_STATUSES.map((s) => `marketplaceListings.status.${s}`),
        ...["all", ...LISTING_DOMAINS, "service", "other"].map(
          (d) => `marketplaceListings.domains.${d}`,
        ),
        ...["offer", "need", "other"].map((d) => `marketplaceListings.directions.${d}`),
        ...[
          "formDomainLabel", "formAmountLabel", "formCurrencyLabel", "formQuantityLabel",
          "formQuantityPlaceholder", "formUnitLabel", "formUnitPlaceholder", "formExpiryLabel",
          "formExpiryHint", "domainFilterLabel", "errorPrice", "errorQuantity", "errorExpiry",
          "errorRestricted", "legalCheckFood", "legalCheckAck", "serviceNeedHint",
          "moreTypesSoon", "pause", "expired", "expiresOn", "openInServices",
        ].map((k) => `marketplaceListings.${k}`),
      ];
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});


describe("6. universal marketplace migration (20261002170000) — Option C contract", () => {
  const sql = () => read(V2_MIGRATION);
  const ddl = () => ddlOf(V2_MIGRATION);

  it("migration + guarded rollback exist; RED gate marker present", () => {
    expect(existsSync(V2_MIGRATION)).toBe(true);
    expect(existsSync(V2_ROLLBACK)).toBe(true);
    expect(sql()).toMatch(/@human-gate-approved/);
    expect(read(V2_ROLLBACK)).toMatch(/rollback refused/);
  });

  it("OWNER CONTRACT: no age / birth / adult column or domain anywhere in the DDL", () => {
    for (const f of [ddl(), ddlOf(V2_ROLLBACK)]) {
      expect(f).not.toMatch(
        /\b(age|birth|birthdate|birth_date|dob|adult|adult_confirmed|is_adult|minor)\b/i,
      );
    }
    for (const d of LISTING_DOMAINS) expect(d).not.toMatch(/adult|minor|age/);
  });

  it("listings gain ONLY nullable additive columns", () => {
    const d = ddl();
    for (const col of ["price_amount", "currency", "quantity", "unit", "expires_at"]) {
      expect(d).toMatch(new RegExp(`add column if not exists ${col}\\b`));
    }
    expect(d).not.toMatch(/add column[^;]*not null/i);
    expect(d).toMatch(/price_amount numeric\(14,2\)/);
    expect(d).toMatch(/quantity numeric\(14,3\)/);
    expect(d).toMatch(/currency char\(3\)/);
  });

  it("category CHECK is a FORMAT check; registry seed mirrors the model exactly", () => {
    const d = ddl();
    expect(d).toContain("category ~ '^[a-z][a-z0-9_]{1,40}$'");
    const seeded = [...d.matchAll(/^\s*\('([a-z_]+)',\s+'([a-z_]+)'\)/gm)].map(
      (m) => `${m[1]}/${m[2]}`,
    );
    const expected = LISTING_DOMAINS.flatMap((dom) =>
      SUBJECTS_BY_DOMAIN[dom].map((s) => `${dom}/${s}`),
    );
    expect(seeded.sort()).toEqual(expected.sort());
  });

  it("registry is read-only to clients; discovery view is security_invoker + authenticated only", () => {
    const d = ddl();
    expect(d).toMatch(/revoke all on public\.market_subject_types from authenticated/);
    expect(d).toMatch(/grant select on public\.market_subject_types to authenticated/);
    expect(d).toMatch(
      /create or replace view public\.market_index_v1\s+with \(security_invoker = true\)/,
    );
    expect(d).toMatch(/grant select on public\.market_index_v1 to authenticated/);
    expect(d).toMatch(/revoke all on public\.market_index_v1 from anon/);
    expect(d).not.toMatch(/to anon/);
    expect(d).not.toMatch(/using \(true\)/i);
    expect(d).not.toMatch(/grant [^;]*\bto (anon|public)\b/i);
  });

  it("v2 RPCs are DEFINER + search_path=public, revoked from public/anon, granted to authenticated", () => {
    const d = ddl();
    for (const fn of [
      "create_marketplace_listing_v2",
      "update_marketplace_listing_v2",
      "set_marketplace_listing_status_v2",
      "market_publish_policy_v1",
    ]) {
      expect(d, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public`));
      expect(d, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from anon`));
      expect(d, fn).toMatch(
        new RegExp(`grant\\s+execute on function public\\.${fn}\\([^)]*\\) to authenticated`),
      );
    }
    const defs = d.match(/security definer set search_path = public/gi) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(3);
    // the v2 create RPC calls the policy hook before it writes
    expect(d).toMatch(
      /create or replace function public\.create_marketplace_listing_v2[\s\S]*market_publish_policy_v1[\s\S]*insert into public\.marketplace_listings/,
    );
  });

  it("policy hook reads nothing about age or identity", () => {
    const d = ddl();
    const fn =
      /create or replace function public\.market_publish_policy_v1[\s\S]*?end; \$\$;/.exec(d)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).not.toMatch(/profiles|auth\.users|birth|\bage\b|adult|minor/i);
    expect(fn).toMatch(/stable/);
  });

  it("v1 RPC signatures and conversations are NOT touched", () => {
    const d = ddl();
    for (const v1 of [
      "create_marketplace_listing_v1",
      "update_marketplace_listing_v1",
      "set_marketplace_listing_status_v1",
      "delete_marketplace_listing_v1",
    ]) {
      expect(d).not.toMatch(new RegExp(`function public\\.${v1}`));
      expect(d).not.toMatch(new RegExp(`drop function[^;]*${v1}`));
    }
    expect(d).not.toMatch(/\bconversations\b/);
    expect(d).not.toMatch(/source_type/);
  });

  it("demand stays on its own RPCs: customer_requests / public_vacancies are not unioned", () => {
    expect(ddl()).not.toMatch(/customer_requests|public_vacancies/);
    expect(ddl()).toMatch(/union all/);
  });

  it("service_offerings gets only the four additive nullable columns (organization_id deferred)", () => {
    const d = ddl();
    const block =
      /alter table public\.service_offerings\s+add column if not exists expires_at[\s\S]*?;/.exec(d)?.[0] ?? "";
    for (const col of ["expires_at", "price_amount", "currency", "location_label"]) {
      expect(block).toContain(col);
    }
    expect(d).not.toMatch(/service_offerings[^;]*organization_id/);
  });

  it("listing_kind is NOT widened (direction is derived)", () => {
    expect(ddl()).not.toMatch(/listing_kind[^;]*check/i);
    expect([...LISTING_KINDS].sort()).toEqual(["rental", "sale", "wanted"]);
  });

  it("rollback is guarded and restores the original closed constraints", () => {
    const down = read(V2_ROLLBACK);
    expect(down).toMatch(/rollback refused/);
    expect(down).toMatch(/marketplace_listings_category_check/);
    expect(down).toMatch(/check \(status in \('draft','active','closed'\)\)/);
    expect(down).toMatch(/drop table if exists public\.market_subject_types/);
  });

  it("app degrades honestly: probes 42703 / 42P01 / 42883 and keeps the v1 fallback", () => {
    const srv = read(join(WEB, "lib", "marketplace", "listings.ts"));
    for (const code of ["42703", "42P01", "42883"]) expect(srv).toContain(code);
    expect(srv).toMatch(/create_marketplace_listing_v1/);
    expect(srv).toMatch(/needs-migration/);
  });
});
