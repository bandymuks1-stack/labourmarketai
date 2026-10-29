import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GROWTH_DAILY_DEFINITION_VERSION,
  MIN_CELL,
  SUPPRESSED,
  UNRECOGNISED,
  buildGrowthDaily,
  resolveGrowthDay,
} from "./growth-daily";

const NOW = Date.parse("2026-10-29T08:00:00Z");
const AT = "2026-10-29T08:00:00.000Z";
const g = (utm_source: string | null, utm_medium: string | null, utm_campaign: string | null, utm_content: string | null, n: number) =>
  ({ utm_source, utm_medium, utm_campaign, utm_content, n });
const raw = (groups: ReturnType<typeof g>[], active = 7, day = "2026-10-28") => ({
  day,
  registrations_total: groups.reduce((s, x) => s + x.n, 0),
  registrations_by_attribution: groups,
  active_living_cv: active,
});

describe("growth daily — day resolution (complete UTC days only)", () => {
  it("defaults to yesterday and accepts a past day inside the lookback", () => {
    expect(resolveGrowthDay(null, NOW)).toEqual({ ok: true, day: "2026-10-28" });
    expect(resolveGrowthDay("2026-10-01", NOW)).toEqual({ ok: true, day: "2026-10-01" });
  });
  it("refuses today, the future, malformed and out-of-range days", () => {
    for (const d of ["2026-10-29", "2026-11-02", "2026-02-30", "28-10-2026", "2026-10-28T00:00", "2025-01-01"]) {
      expect(resolveGrowthDay(d, NOW)).toEqual({ ok: false });
    }
  });
});

describe("growth daily — body", () => {
  it("emits exactly the agreed keys, counts only", () => {
    const body = buildGrowthDaily(raw([g("nonstop", "email", "worker-inbound-2026-09", "ns-inbound-a", 4)]), "2026-10-28", AT);
    expect(Object.keys(body!).sort()).toEqual(["activeLivingCv", "day", "definitionVersion", "generatedAt", "registrations"]);
    expect(body!.definitionVersion).toBe(GROWTH_DAILY_DEFINITION_VERSION);
    expect(body!.registrations).toEqual({
      total: 4,
      byAttribution: [{ utmSource: "nonstop", utmMedium: "email", utmCampaign: "worker-inbound-2026-09", utmContent: "ns-inbound-a", count: 4 }],
    });
    expect(body!.activeLivingCv).toBe(7);
  });

  it("a zero day is a real zero, not an outage", () => {
    const body = buildGrowthDaily(raw([], 0), "2026-10-28", AT);
    expect(body!.registrations).toEqual({ total: 0, byAttribution: [] });
  });

  it("fails closed on anything malformed or inconsistent (null → 503)", () => {
    const ok = raw([g("a", "b", "c", "d", 3)]);
    expect(buildGrowthDaily(null, "2026-10-28", AT)).toBeNull();
    expect(buildGrowthDaily(ok, "2026-10-27", AT)).toBeNull(); // another day's answer
    expect(buildGrowthDaily({ ...ok, registrations_total: 4 }, "2026-10-28", AT)).toBeNull(); // groups ≠ total
    expect(buildGrowthDaily({ ...ok, active_living_cv: -1 }, "2026-10-28", AT)).toBeNull();
    expect(buildGrowthDaily({ ...ok, active_living_cv: undefined }, "2026-10-28", AT)).toBeNull();
    expect(buildGrowthDaily(raw([g("a", "b", "c", "d", 0)]), "2026-10-28", AT)).toBeNull();
    expect(buildGrowthDaily(raw([{ ...g("a", "b", "c", "d", 3), utm_source: 5 as unknown as string }]), "2026-10-28", AT)).toBeNull();
  });
});

describe("growth daily — small-cell rule (no group below MIN_CELL is published)", () => {
  it("rolls per-recipient utm_content tags up to their campaign", () => {
    const body = buildGrowthDaily(
      raw([
        g("nonstop", "email", "worker-inbound-2026-09", "ns-inbound-0123456789ab", 1),
        g("nonstop", "email", "worker-inbound-2026-09", "ns-inbound-ba9876543210", 1),
        g("nonstop", "email", "worker-inbound-2026-09", "ns-inbound-aaaaaaaaaaaa", 1),
      ]),
      "2026-10-28",
      AT,
    );
    expect(body!.registrations.byAttribution).toEqual([
      { utmSource: "nonstop", utmMedium: "email", utmCampaign: "worker-inbound-2026-09", utmContent: SUPPRESSED, count: 3 },
    ]);
    expect(JSON.stringify(body)).not.toContain("ns-inbound-");
  });

  it("keeps rolling up while a group is still small, ending in one all-suppressed residual", () => {
    const body = buildGrowthDaily(
      raw([
        g("nonstop", "email", "c1", "x", 5),
        g("nonstop", "email", "c2", "y", 1),
        g("nonstop", "sms", "c3", "z", 1),
        g("linkedin", "social", "c4", "w", 2),
        g(null, null, null, null, 1),
      ]),
      "2026-10-28",
      AT,
    );
    const rows = body!.registrations.byAttribution;
    // nonstop c2+c3 reach only 2 at the source level, linkedin 2, organic 1: none ever meets the bar, so all five
    // land in the residual.
    expect(rows).toEqual([
      { utmSource: "nonstop", utmMedium: "email", utmCampaign: "c1", utmContent: "x", count: 5 },
      { utmSource: SUPPRESSED, utmMedium: SUPPRESSED, utmCampaign: SUPPRESSED, utmContent: SUPPRESSED, count: 5 },
    ]);
    for (const r of rows) {
      const allSuppressed = [r.utmSource, r.utmMedium, r.utmCampaign, r.utmContent].every((v) => v === SUPPRESSED);
      if (!allSuppressed) expect(r.count).toBeGreaterThanOrEqual(MIN_CELL);
    }
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(body!.registrations.total);
    expect(rows.filter((r) => r.utmSource === SUPPRESSED)).toHaveLength(1);
  });

  it("a small campaign that reaches the bar at its source level is published there", () => {
    const body = buildGrowthDaily(
      raw([g("nonstop", "email", "c2", "y", 1), g("nonstop", "sms", "c3", "z", 2)]),
      "2026-10-28",
      AT,
    );
    expect(body!.registrations.byAttribution).toEqual([
      { utmSource: "nonstop", utmMedium: SUPPRESSED, utmCampaign: SUPPRESSED, utmContent: SUPPRESSED, count: 3 },
    ]);
  });

  it("an organic group of three or more is published with null tags", () => {
    const body = buildGrowthDaily(raw([g(null, null, null, null, 3)]), "2026-10-28", AT);
    expect(body!.registrations.byAttribution).toEqual([{ utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, count: 3 }]);
  });

  it("never echoes free text from a visitor's URL, even in a large cell", () => {
    const body = buildGrowthDaily(raw([g("nonstop", "email", "jonas.jonaitis@mail.lt", "Hello World", 9)]), "2026-10-28", AT);
    expect(body!.registrations.byAttribution[0]).toMatchObject({ utmCampaign: UNRECOGNISED, utmContent: UNRECOGNISED, count: 9 });
    expect(JSON.stringify(body)).not.toContain("@");
  });
});

describe("growth daily — the database aggregate", () => {
  const migDir = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
  const sql = readFileSync(join(migDir, "20261029120000_agentai_daily_growth_aggregate_v1.sql"), "utf8");
  const populationRule = (text: string) => {
    const m = /case\s+when coalesce\(u\.raw_app_meta_data[\s\S]*?end as pop/.exec(text);
    return m ? m[0].replace(/\s+/g, " ") : null;
  };

  it("uses the ops_product_metrics_v1 REAL-population rule verbatim", () => {
    const ops = readFileSync(join(migDir, "20261013140000_ops_product_metrics_staff_acceptance_v2.sql"), "utf8");
    expect(populationRule(sql)).not.toBeNull();
    expect(populationRule(sql)).toBe(populationRule(ops));
  });

  it("reads only the four utm keys from user metadata and returns no person-level column", () => {
    const metaKeys = [...sql.matchAll(/meta ->> '([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(metaKeys).toEqual(["utm_campaign", "utm_content", "utm_medium", "utm_source"]);
    const output = sql.slice(sql.indexOf("select jsonb_build_object("));
    for (const forbidden of ["email", "u.id", "profile_id", "original_text", "display_name", "phone"]) {
      expect(output).not.toContain(forbidden);
    }
  });

  it("is EXECUTE for service_role only, with a rollback", () => {
    expect(sql).toMatch(/revoke all on function public\.agentai_daily_growth_aggregate_v1\(date\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.agentai_daily_growth_aggregate_v1\(date\) to service_role;/);
    expect(sql).toContain("set search_path = ''");
    expect(readFileSync(join(migDir, "..", "rollbacks", "20261029120000_agentai_daily_growth_aggregate_v1.down.sql"), "utf8")).toContain(
      "drop function if exists public.agentai_daily_growth_aggregate_v1(date);",
    );
  });
});
