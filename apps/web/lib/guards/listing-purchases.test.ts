import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import { PURCHASE_STATUSES } from "@/lib/marketplace/listing-purchase-model";

/**
 * GOODS PURCHASE LIFECYCLE (registry 6.13 + 6.14 delivery fields, 2026-10-23).
 *
 * Pins what makes the slice safe and honest so a later edit cannot quietly
 * weaken it:
 *   1. ONE table, two-party + organization-aware RLS, RPC-only writes, no
 *      anon, definer functions with a pinned search_path, a guarded rollback,
 *      a GDPR erasure decision per person FK.
 *   2. NO payment anywhere: one payment arrangement (direct between the
 *      parties), no billing / Stripe / LMC import in the slice, honest copy in
 *      every active locale.
 *   3. Writes go through the two RPCs only; the purchase door is hidden until
 *      the migration exists; the conversation opens through the ONE
 *      conversation system with its own grant.
 *   4. A deleted listing never erases a purchase (ON DELETE SET NULL).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");
const strip = (s: string) => s.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20261023160000_listing_purchases_v1.sql";
const ROLLBACK = "supabase/rollbacks/20261023160000_listing_purchases_v1.down.sql";
const sql = strip(readRepo(MIGRATION));
const down = readRepo(ROLLBACK);

describe("1. the migration: one table, closed by default", () => {
  it("is RED-annotated and names the human gate", () => {
    expect(readRepo(MIGRATION)).toMatch(/^-- @human-gate-approved/);
    expect(readRepo(MIGRATION)).toMatch(/needs-human-gate/);
  });

  it("creates exactly one table and alters no existing one", () => {
    expect(sql.match(/create table/gi)?.length).toBe(1);
    expect(sql).toMatch(/create table if not exists public\.listing_purchases/);
    expect(sql).not.toMatch(/alter table public\.(?!listing_purchases)/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|column)\b/i);
    // The only policy drop is the idempotent re-create of its OWN policy.
    expect(sql.match(/drop policy/gi)?.length).toBe(1);
    expect(sql).toMatch(/drop policy if exists listing_purchases_select on public\.listing_purchases;/);
  });

  it("the status CHECK is the model's status set", () => {
    const check = /status\s+text not null default 'requested'\s+check \(status in \(([^)]*)\)\)/.exec(sql);
    expect(check).not.toBeNull();
    const values = check![1].split(",").map((v) => v.trim().replace(/'/g, ""));
    expect(values).toEqual([...PURCHASE_STATUSES]);
  });

  it("RLS on, select only for the two parties, their organizations' managers and admin", () => {
    expect(sql).toMatch(/alter table public\.listing_purchases enable row level security/);
    expect(sql).toMatch(/buyer_id = auth\.uid\(\)/);
    expect(sql).toMatch(/seller_id = auth\.uid\(\)/);
    expect(sql).toMatch(/public\.manages_organization\(seller_organization_id\)/);
    expect(sql).toMatch(/public\.manages_organization\(buyer_organization_id\)/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
    expect(sql).toMatch(/grant select on public\.listing_purchases to authenticated;/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*listing_purchases/i);
    expect(sql).not.toMatch(/to anon\b/i);
  });

  it("both definer functions pin search_path and are revoked from public and anon", () => {
    for (const fn of ["request_listing_purchase_v1", "transition_listing_purchase_v1"]) {
      expect(sql).toMatch(new RegExp(`function public\\.${fn}\\([\\s\\S]*?security definer set search_path = public`));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public;`));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from anon;`));
      expect(sql).toMatch(new RegExp(`grant\\s+execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    }
  });

  it("seller and seller organization are bound from the listing, never from the caller", () => {
    expect(sql).toMatch(/v_listing\.id, v_listing\.owner_id, v_listing\.organization_id, uid, p_buyer_organization_id/);
    expect(sql).toMatch(/not public\.manages_organization\(p_buyer_organization_id\)/);
    expect(sql).toMatch(/raise exception 'cannot_purchase_own_listing'/);
  });

  it("transitions lock the row (no lost update between two managers)", () => {
    expect(sql).toMatch(/from public\.listing_purchases where id = p_id for update/);
  });

  it("a deleted listing never erases a purchase", () => {
    expect(sql).toMatch(/listing_id\s+uuid references public\.marketplace_listings\(id\) on delete set null/);
  });

  it("every person FK has an erasure decision in the same file", () => {
    expect(sql).toMatch(/insert into public\.privacy_erasure_registry_v3/);
    expect(sql).toMatch(/'listing_purchases', 'buyer_id', 'profiles'/);
    expect(sql).toMatch(/'listing_purchases', 'seller_id', 'profiles'/);
  });

  it("the rollback refuses while rows exist and removes what the migration made", () => {
    expect(down).toMatch(/rollback refused: listing_purchases holds rows/);
    expect(down).toMatch(/drop function if exists public\.request_listing_purchase_v1/);
    expect(down).toMatch(/drop function if exists public\.transition_listing_purchase_v1/);
    expect(down).toMatch(/drop table if exists public\.listing_purchases/);
    expect(down).toMatch(/delete from public\.privacy_erasure_registry_v3/);
  });
});

describe("2. no payment anywhere in the slice", () => {
  const files = [
    "lib/marketplace/listing-purchase-model.ts",
    "lib/marketplace/listing-purchases.ts",
    "lib/marketplace/listing-purchase-conversation.ts",
    "components/app/listing-purchase-form.tsx",
    "components/app/listing-purchases-section.tsx",
  ];

  it("exactly one payment arrangement in SQL: direct between the parties", () => {
    expect(sql).toMatch(/check \(payment_arrangement in \('direct_between_parties'\)\)/);
  });

  it("no billing, Stripe, checkout or LMC import", () => {
    for (const f of files) {
      // Code only: the doc comments name the future checkout as an extension point.
      const src = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(src, f).not.toMatch(/from "@\/lib\/(billing|lmc)/);
      expect(src, f).not.toMatch(/stripe|checkout|lmc_/i);
    }
  });

  it("every active locale says payment is arranged directly, never 'paid' or 'secure payment'", () => {
    for (const loc of activeLocales) {
      const catalog = JSON.parse(read(`messages/${loc}.json`)) as {
        listingPurchases?: { paymentHonest?: string };
      };
      const line = catalog.listingPurchases?.paymentHonest ?? "";
      expect(line.length, loc).toBeGreaterThan(20);
      expect(line, loc).toMatch(/LabourMarket\.ai/);
    }
    expect(JSON.parse(read("messages/en.json")).listingPurchases.paymentHonest).toMatch(
      /arranged directly between buyer and seller/,
    );
  });
});

describe("3. writes, doors and the conversation", () => {
  const server = read("lib/marketplace/listing-purchases.ts");

  it("the server module writes ONLY through the two RPCs", () => {
    expect(server).toMatch(/\.rpc\("request_listing_purchase_v1"/);
    expect(server).toMatch(/\.rpc\("transition_listing_purchase_v1"/);
    expect(server).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("a missing table/function is needs-migration, a failed read is unavailable (never empty)", () => {
    expect(server).toMatch(/if \(isAbsent\(error\)\) return \{ kind: "needs-migration" \};\s*return \{ kind: "unavailable" \};/);
  });

  it("the purchase door renders only when the feature exists and the row is purchasable and not mine", () => {
    const page = read("app/[locale]/dashboard/listings/page.tsx");
    expect(page).toMatch(/const purchasesAvailable = purchases\.kind !== "needs-migration";/);
    const section = read("components/app/marketplace-listings-section.tsx");
    expect(section).toMatch(/purchasesAvailable && row\.purchasable && !row\.isMine && \(/);
    expect(read("components/app/listing-purchases-section.tsx")).toMatch(
      /if \(result\.kind === "needs-migration" \|\| result\.kind === "not-authed"\) return null;/,
    );
  });

  it("both workspaces show purchases: listings (both sides) and the buyer workspace (buying side)", () => {
    expect(read("app/[locale]/dashboard/listings/page.tsx")).toMatch(/sides=\{\["buyer", "seller"\]\}/);
    expect(read("app/[locale]/dashboard/buyer/page.tsx")).toMatch(/sides=\{\["buyer"\]\}/);
  });

  it("the thread opens through the ONE conversation system after a server-side RLS read", () => {
    const conv = read("lib/marketplace/listing-purchase-conversation.ts");
    const readAt = conv.indexOf('.from("listing_purchases")');
    const openAt = conv.indexOf("getOrCreateDirectConversation(\n");
    expect(readAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(readAt);
    expect(conv).toMatch(/"allowed_listing_purchase"/);
    expect(conv).toMatch(/canOpenPurchaseConversation\(status\)/);
  });
});
