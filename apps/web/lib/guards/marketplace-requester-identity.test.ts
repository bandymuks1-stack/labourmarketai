import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Requester identity on the provider inbox (Option A — enrichment RPC).
 *
 * Pins the privacy + scope boundary of the new `requester_identities_for_provider`
 * SECURITY DEFINER read RPC, the rollout-safe server enrichment, and the compact
 * request-provider identity tile. The migration is owner-applied (RED) — these
 * are deterministic static proofs (the surface is auth-gated).
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const stripSqlComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const MIGRATION = "supabase/migrations/20260627174500_requester_identity_for_provider.sql";
const ROLLBACK = "supabase/rollbacks/20260627174500_requester_identity_for_provider.down.sql";

describe("requester-identity RPC is a tightly-bounded SECURITY DEFINER read", () => {
  const sql = stripSqlComments(readRepo(MIGRATION)).toLowerCase();

  it("adds EXACTLY one SECURITY DEFINER function, search_path-pinned", () => {
    expect((sql.match(/security definer/g) ?? []).length).toBe(1);
    expect(sql).toMatch(/create or replace function public\.requester_identities_for_provider\(p_request_ids uuid\[\]\)/);
    expect(sql).toMatch(/security definer set search_path = public/);
  });

  it("execute is revoked from public and granted only to authenticated", () => {
    expect(sql).toMatch(/revoke all on function public\.requester_identities_for_provider\(uuid\[\]\) from public/);
    expect(sql).toMatch(/grant execute on function public\.requester_identities_for_provider\(uuid\[\]\) to authenticated/);
    expect(sql).not.toMatch(/to anon/);
    expect(sql).not.toMatch(/\bto public\b/);
  });

  it("re-checks provider scope at fire time (provider_id = auth.uid())", () => {
    expect(sql).toMatch(/where r\.id = any\(p_request_ids\)\s*and r\.provider_id = auth\.uid\(\)/);
  });

  it("adds NO table / column / policy / table-grant / using(true)", () => {
    expect(sql).not.toMatch(/create table|alter table|add column|create policy|drop policy/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
  });
});

describe("privacy boundary — ONLY the display name is exposed", () => {
  const sql = stripSqlComments(readRepo(MIGRATION)).toLowerCase();

  it("selects only full_name from profiles (display name)", () => {
    expect(sql).toMatch(/select r\.id, p\.full_name/);
    expect(sql).toMatch(/returns table \(request_id uuid, display_name text\)/);
  });

  it("never references email / phone / location / profile_text / consent / avatar / buyer_id projection", () => {
    expect(sql).not.toMatch(/\bemail\b/);
    expect(sql).not.toMatch(/\bphone\b/);
    expect(sql).not.toMatch(/\bcountry\b/);
    expect(sql).not.toMatch(/profile_text/);
    expect(sql).not.toMatch(/consent_/);
    expect(sql).not.toMatch(/avatar_url/);
    // the function output columns are request_id + display_name only (no buyer_id)
    expect(sql).not.toMatch(/p\.email|p\.phone|p\.country|p\.profile_text|p\.avatar_url/);
  });
});

describe("the rollback is fully reversible (function-only)", () => {
  const down = stripSqlComments(readRepo(ROLLBACK)).toLowerCase();
  it("drops only the function, touches no table/data", () => {
    expect(down).toMatch(/drop function if exists public\.requester_identities_for_provider\(uuid\[\]\)/);
    expect(down).not.toMatch(/drop table|delete from|truncate|alter table/);
  });
});

describe("server enrichment is rollout-safe + provider-scoped via the RPC", () => {
  const src = read("lib/marketplace/service-requests.ts");

  it("calls the provider-scoped RPC with the inbox request ids", () => {
    expect(src).toMatch(/\.rpc\("requester_identities_for_provider", \{\s*p_request_ids: requestIds/);
  });

  it("degrades gracefully — empty map on absent/error, never throws, never fakes a name", () => {
    expect(src).toMatch(/if \(error \|\| !Array\.isArray\(data\)\) return out;/);
    // only a real, non-empty display_name is mapped (no fabrication)
    expect(src).toMatch(/if \(id && name\) out\.set\(id, name\)/);
  });

  it("the inbox still returns ok rows + merges requesterDisplayName (no regression)", () => {
    expect(src).toMatch(/requesterDisplayName: names\.get\(r\.id\) \?\? null/);
    expect(src).toMatch(/return \{ kind: "ok", rows \};/);
  });

  it("IncomingRequestRow carries the display-name-only identity field", () => {
    const shared = read("lib/marketplace/service-requests-shared.ts");
    expect(shared).toMatch(/readonly requesterDisplayName: string \| null;/);
  });
});

describe("provider inbox renders the compact request-provider identity tile", () => {
  const section = read("components/app/marketplace-loop-section.tsx");

  it("uses the Player Identity foundation (initials + canonical surface)", () => {
    expect(section).toMatch(/from "@\/lib\/identity\/player-identity"/);
    // PR #539: identity routed through the ONE minimum Player Card contract,
    // built from ONLY the #531-safe display name; initials come from it.
    expect(section).toMatch(/from "@\/lib\/identity\/player-card-minimum"/);
    expect(section).toMatch(/buildPlayerCardMinimum\(\{\s*fullName: r\.requesterDisplayName,?\s*\}\)/);
    expect(section).toMatch(/requester\.initials/);
    expect(section).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    expect(section).toMatch(/PLAYER_IDENTITY_AVATAR_BORDER/);
    expect(section).toMatch(/data-testid="marketplace-incoming-requester"/);
  });

  it("shows a neutral fallback label when there is no name (no fabrication)", () => {
    expect(section).toMatch(/requester\.displayName \?\? labels\.requesterFallback/);
  });
});

describe("identity copy present across active locales", () => {
  it("the page threads the two new labels", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/requestedBy: t\("requestedBy"\)/);
    expect(page).toMatch(/requesterFallback: t\("requesterFallback"\)/);
  });

  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: requestedBy + requesterFallback present`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as { marketplace?: Record<string, unknown> }).marketplace ?? {};
      for (const k of ["requestedBy", "requesterFallback"]) {
        expect(typeof m[k], `${loc}.${k}`).toBe("string");
        expect(String(m[k]).trim().length, `${loc}.${k}`).toBeGreaterThan(0);
      }
    });
  }
});
