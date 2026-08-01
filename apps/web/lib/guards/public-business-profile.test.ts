import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * Wagon 13 slice 2 — public business showcase profile guard. Pins the public-
 * exposure safety boundary: default PRIVATE; a minimal allowlisted public read;
 * owner/manager-gated publication; the canonical `organizations` RLS UNCHANGED
 * (no blanket public read). Reuses organizations / service_offerings /
 * marketplace_listings — no duplicate systems.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

const MIGRATION = join(REPO, "supabase", "migrations", "20260719120000_business_public_profile.sql");
const ROLLBACK = join(REPO, "supabase", "rollbacks", "20260719120000_business_public_profile.down.sql");

/** Slice a `create ... function <name> ... $$;` body out of the migration. */
function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  expect(start, `${name} present`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end + 3);
}

const FORBIDDEN_PUBLIC_COLUMNS = [
  "legal_name",
  "vat_number",
  "owner_profile_id",
  "trust_score",
  "legacy_company_id",
  "legacy_agency_id",
];

describe("1. migration is additive, default-private, reversible", () => {
  it("migration + rollback exist, human-gated", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
    expect(read(MIGRATION)).toMatch(/@human-gate-approved/);
  });

  it("publication defaults to PRIVATE (opt-in)", () => {
    expect(read(MIGRATION)).toMatch(/public_profile_enabled boolean not null default false/);
  });

  it("does NOT touch the organizations base RLS (no new public policy, no anon/true read)", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/create policy[^;]*on public\.organizations/i);
    expect(sql).not.toMatch(/alter policy[^;]*on public\.organizations/i);
    // No blanket public read on the table itself.
    expect(sql).not.toMatch(/grant select on public\.organizations to anon/i);
  });

  it("rollback removes every new object + column", () => {
    const down = read(ROLLBACK);
    expect(down).toMatch(/drop function if exists public\.get_public_business_profile_v1/);
    expect(down).toMatch(/drop column if exists public_profile_enabled/);
  });
});

describe("2. public reads expose ONLY allowlisted fields for opted-in orgs", () => {
  const sql = read(MIGRATION);
  const readers = [
    "get_public_business_profile_v1",
    "get_public_business_services_v1",
    "get_public_business_listings_v1",
  ];

  for (const fn of readers) {
    it(`${fn} filters public_profile_enabled = true (no leak of private orgs)`, () => {
      expect(fnBody(sql, fn)).toMatch(/public_profile_enabled = true/);
    });
  }

  it("the profile read never selects private organization columns", () => {
    const body = fnBody(sql, "get_public_business_profile_v1");
    for (const col of FORBIDDEN_PUBLIC_COLUMNS) {
      expect(body, `profile read must not expose ${col}`).not.toContain(col);
    }
  });
});

describe("3. publication is owner/manager gated; anon only on the reads", () => {
  const sql = read(MIGRATION);

  it("set_business_public_profile_v1 re-checks manager/owner and is SECURITY DEFINER", () => {
    const body = fnBody(sql, "set_business_public_profile_v1");
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = public/);
    expect(body).toMatch(/manages_organization/);
    expect(body).toMatch(/not authorized/);
  });

  it("anon EXECUTE is granted ONLY to the three public read functions", () => {
    const anonGrants = sql
      .split("\n")
      .filter((l) => /grant execute on function/.test(l) && /to anon/.test(l));
    expect(anonGrants.length).toBe(3);
    for (const g of anonGrants) expect(g).toMatch(/get_public_business_/);
    // The publication write is never granted to anon.
    expect(sql).not.toMatch(/set_business_public_profile_v1\([^)]*\) to [^;]*anon/);
  });
});

describe("4. surface exists and reuses canonical entities", () => {
  it("the public page + management panel + lib exist", () => {
    expect(existsSync(join(WEB, "app", "[locale]", "business", "[slug]", "page.tsx"))).toBe(true);
    expect(existsSync(join(WEB, "components", "app", "business-public-profile-panel.tsx"))).toBe(true);
    expect(existsSync(join(WEB, "lib", "company", "public-profile.ts"))).toBe(true);
  });

  it("services + listings come from the canonical stores (no duplicate tables)", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/from public\.service_offerings/);
    expect(sql).toMatch(/from public\.marketplace_listings/);
    // No new *_profile / *_business table is created.
    expect(sql).not.toMatch(/create table[^;]*business_profiles/i);
  });
});

describe("5. copy resolves in every active locale", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (n, k) => (n && typeof n === "object" ? (n as Record<string, unknown>)[k] : undefined),
      msgs,
    );
  const keys = [
    "businessProfile.panelTitle",
    "businessProfile.panelIntro",
    "businessProfile.enableLabel",
    "businessProfile.servicesTitle",
    "businessProfile.listingsTitle",
    "businessProfile.errorNotAuthorized",
  ];
  for (const loc of activeLocales) {
    it(`${loc}: business-profile copy is non-empty`, () => {
      const msgs = JSON.parse(read(join(WEB, "messages", `${loc}.json`)));
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});

describe("W4 Slice 3 — the description write path", () => {
  const action = read(join(WEB, "lib", "company", "description-actions.ts"));
  const panel = read(join(WEB, "components", "app", "business-public-profile-panel.tsx"));

  it("writes through the owner's OWN companies row, never organizations directly", () => {
    // organizations is admin-RLS + RPC-only; the mirror trigger is the one
    // non-admin path. A direct organizations write here would silently no-op
    // for every real owner.
    expect(action).toMatch(/from\("companies"\)/);
    expect(action).not.toMatch(/from\("organizations"\)[\s\S]{0,200}\.update\(/);
    expect(action).toMatch(/profile_id.*user\.id|eq\("profile_id", user\.id\)/);
  });

  it("is bounded and honest about ownership", () => {
    expect(action).toMatch(/ORG_DESCRIPTION_MAX = 2000/);
    expect(action).toMatch(/no-company/);
  });

  it("the panel carries the description editor with its hint", () => {
    expect(panel).toMatch(/business-description-input/);
    expect(panel).toMatch(/descriptionHint/);
    expect(panel).toMatch(/maxLength=\{2000\}/);
  });

  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
      msgs,
    );
  for (const loc of activeLocales) {
    it(`${loc}: description editor copy is non-empty`, () => {
      const msgs = JSON.parse(read(join(WEB, "messages", `${loc}.json`)));
      for (const key of [
        "businessProfile.descriptionLabel",
        "businessProfile.descriptionPlaceholder",
        "businessProfile.descriptionHint",
        "businessProfile.errorDescription",
      ]) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});
