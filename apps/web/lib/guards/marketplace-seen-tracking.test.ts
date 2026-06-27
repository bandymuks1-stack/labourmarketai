import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeNewCounts } from "@/lib/marketplace/service-requests-shared";

/**
 * "New updates since last seen" tracking (Option C′).
 *
 * Pins the one-row-per-user seen table + mark-seen RPC boundary, the PURE
 * new-count logic (own action never self-notifies; only a real other-party update
 * after seenAt counts; seenAt null → 0), the rollout-safe server helpers, the
 * visit-marks-seen wiring, and the count-gated dashboard markers. The migration
 * is owner-applied (RED) — static proofs for the auth-gated surface.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const stripSql = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const MIGRATION = "supabase/migrations/20260627181500_service_requests_seen.sql";
const ROLLBACK = "supabase/rollbacks/20260627181500_service_requests_seen.down.sql";

describe("seen table is one-row-per-user, own-row-only, writes RPC-only", () => {
  const sql = stripSql(readRepo(MIGRATION)).toLowerCase();

  it("stores exactly user_id (pk) + seen_at — nothing else", () => {
    expect(sql).toMatch(/create table if not exists public\.service_offering_requests_seen \(\s*user_id uuid primary key references public\.profiles\(id\) on delete cascade,\s*seen_at timestamptz not null default now\(\)\s*\)/);
    // no other-party / per-request / PII columns
    expect(sql).not.toMatch(/request_id|buyer_id|provider_id|email|phone|full_name/);
  });

  it("RLS is enabled and SELECT is own-row only (no using(true), no anon/public)", () => {
    expect(sql).toMatch(/alter table public\.service_offering_requests_seen enable row level security/);
    expect(sql).toMatch(/for select to authenticated\s*using \(user_id = auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/to anon/);
    expect(sql).not.toMatch(/\bto public\b/);
  });

  it("grants SELECT only — no write policy / no write grant (writes via RPC)", () => {
    expect(sql).toMatch(/grant select on public\.service_offering_requests_seen to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)/);
    expect(sql).not.toMatch(/for (insert|update|delete)/);
  });
});

describe("mark-seen RPC is a bounded SECURITY DEFINER upsert of the caller's row", () => {
  const sql = stripSql(readRepo(MIGRATION)).toLowerCase();

  it("is SECURITY DEFINER, search_path-pinned, public-revoked, authenticated-granted", () => {
    expect((sql.match(/security definer/g) ?? []).length).toBe(1);
    expect(sql).toMatch(/create or replace function public\.mark_service_requests_seen\(\)/);
    expect(sql).toMatch(/security definer set search_path = public/);
    expect(sql).toMatch(/revoke all on function public\.mark_service_requests_seen\(\) from public/);
    expect(sql).toMatch(/grant execute on function public\.mark_service_requests_seen\(\) to authenticated/);
  });

  it("upserts ONLY auth.uid()'s row and no-ops the unauthenticated caller", () => {
    expect(sql).toMatch(/if auth\.uid\(\) is null then return; end if/);
    expect(sql).toMatch(/values \(auth\.uid\(\), now\(\)\)\s*on conflict \(user_id\) do update set seen_at = now\(\)/);
  });
});

describe("rollback is guarded + self-contained", () => {
  const down = stripSql(readRepo(ROLLBACK)).toLowerCase();
  it("refuses a non-empty table, then drops the fn + table only", () => {
    expect(down).toMatch(/is not empty — refusing automatic rollback/);
    expect(down).toMatch(/drop function if exists public\.mark_service_requests_seen\(\)/);
    expect(down).toMatch(/drop table if exists public\.service_offering_requests_seen/);
  });
});

describe("pure new-count logic — honest, other-party-only", () => {
  const T0 = "2026-06-27T10:00:00.000+00:00"; // seenAt
  const BEFORE = "2026-06-27T09:00:00.000+00:00";
  const AFTER = "2026-06-27T11:00:00.000+00:00";

  it("seenAt null → 0 new for both (never opened → no claim)", () => {
    const r = computeNewCounts(null, [{ status: "sent", createdAt: AFTER }], [
      { status: "accepted", respondedAt: AFTER },
    ]);
    expect(r).toEqual({ providerNew: 0, buyerNew: 0 });
  });

  it("other-party update AFTER seen counts as new", () => {
    const r = computeNewCounts(
      T0,
      [{ status: "sent", createdAt: AFTER }], // a buyer sent it after I looked
      [{ status: "accepted", respondedAt: AFTER }], // a provider responded after I looked
    );
    expect(r).toEqual({ providerNew: 1, buyerNew: 1 });
  });

  it("updates BEFORE seen do not count", () => {
    const r = computeNewCounts(
      T0,
      [{ status: "sent", createdAt: BEFORE }],
      [{ status: "accepted", respondedAt: BEFORE }],
    );
    expect(r).toEqual({ providerNew: 0, buyerNew: 0 });
  });

  it("my OWN action never creates a new badge for me", () => {
    // provider's own respond shows as accepted/declined in INCOMING — providerNew
    // only counts 'sent', so it is ignored. buyer's own request shows as 'sent' in
    // OUTGOING — buyerNew only counts accepted/declined, so it is ignored.
    const r = computeNewCounts(
      T0,
      [{ status: "accepted", createdAt: AFTER }, { status: "withdrawn", createdAt: AFTER }],
      [{ status: "sent", respondedAt: AFTER }],
    );
    expect(r).toEqual({ providerNew: 0, buyerNew: 0 });
  });

  it("declined response also counts as a new buyer update", () => {
    const r = computeNewCounts(T0, [], [{ status: "declined", respondedAt: AFTER }]);
    expect(r.buyerNew).toBe(1);
  });
});

describe("server helpers are rollout-safe + visit marks seen", () => {
  const src = read("lib/marketplace/service-requests.ts");

  it("seen read returns null on absent/error/no row (→ 0 new)", () => {
    expect(src).toMatch(/export async function getServiceRequestsSeenAt\(\): Promise<string \| null>/);
    expect(src).toMatch(/if \(error \|\| !data\) return null;/);
  });

  it("new-counts uses the pure compute and degrades when seen is null", () => {
    expect(src).toMatch(/const seenAt = await getServiceRequestsSeenAt\(\);/);
    expect(src).toMatch(/if \(!seenAt\) return \{ providerNew: 0, buyerNew: 0 \};/);
    expect(src).toMatch(/return computeNewCounts\(/);
  });

  it("mark-seen calls the RPC and never throws (no-op on absent/error)", () => {
    expect(src).toMatch(/export async function markServiceRequestsSeen\(\): Promise<void>/);
    expect(src).toMatch(/\.rpc\("mark_service_requests_seen"\)/);
    expect(src).toMatch(/catch \{[\s\S]*?\}/);
  });

  it("visiting /dashboard/service-requests mounts the mark-seen effect", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/<MarkServiceRequestsSeen \/>/);
    const cmp = read("components/app/mark-service-requests-seen.tsx");
    expect(cmp).toMatch(/markServiceRequestsSeen\(\)/);
    expect(cmp).toMatch(/useEffect/);
  });
});

describe("dashboard renders count-gated 'new' markers (no fake unread)", () => {
  const page = read("app/[locale]/dashboard/page.tsx");

  it("computes both new counts via the marketplace helper", () => {
    expect(page).toMatch(/const \{ providerNew, buyerNew \} = await getServiceRequestsNewCounts\(\);/);
  });

  it("provider marker shows ONLY when providerNew > 0", () => {
    expect(page).toMatch(/providerNew > 0 &&/);
    expect(page).toMatch(/data-testid="dashboard-service-requests-new"/);
  });

  it("buyer marker shows ONLY when buyerNew > 0", () => {
    expect(page).toMatch(/buyerNew > 0 &&/);
    expect(page).toMatch(/data-testid="dashboard-outgoing-requests-new"/);
  });
});

describe("new-badge copy present across active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: marketplace.newBadge present + non-empty`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as { marketplace?: Record<string, unknown> }).marketplace ?? {};
      expect(typeof m.newBadge, `${loc}.newBadge`).toBe("string");
      expect(String(m.newBadge).trim().length).toBeGreaterThan(0);
    });
  }
});
