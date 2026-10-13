/* eslint-disable @typescript-eslint/no-explicit-any -- a PostgREST-shaped fake client */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RPC_CATALOGUE, computeProductMetrics, metricReal, metricTotal } from "./product-metrics";
import { SIGNALS, evaluateSignals } from "./product-monitor";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const WEB = join(__dirname, "..", "..");
const SQL = readFileSync(join(WEB, "..", "..", "supabase/migrations/20261012090000_ops_product_metrics_v1.sql"), "utf8");

const split = (REAL: number, TEST = 0, INTERNAL = 0) => ({ REAL, TEST, INTERNAL });

function fakeClient(rpc: { data: unknown; error: unknown }, tables: Record<string, unknown[] | "error"> = {}) {
  const q = (rows: unknown[] | "error") => {
    const b: any = {
      select: () => b,
      gte: () => b,
      limit: () => b,
      then: (r: (v: unknown) => void) =>
        r(rows === "error" ? { data: null, error: { code: "42501" } } : { data: rows, error: null }),
    };
    return b;
  };
  return { rpc: async () => rpc, from: (t: string) => q(tables[t] ?? []) } as any;
}

describe("the SQL function is the one computation", () => {
  it("returns numbers only and is callable by service_role alone", () => {
    expect(SQL).toMatch(/security definer/);
    expect(SQL).toMatch(/set search_path = public, auth/);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke all on function public.ops_product_metrics_v1() from ${role};`);
    }
    expect(SQL).toContain("grant execute on function public.ops_product_metrics_v1() to service_role;");
    expect(SQL).not.toMatch(/grant execute[^;]*to (anon|authenticated|public)/i);
    // No row-level field is ever a key of the result object.
    const body = SQL.slice(SQL.indexOf("select jsonb_build_object("));
    expect(body).not.toMatch(/'(email|full_name|legal_name|display_name|body|subject|title|id)'\s*,/);
  });

  it("produces every catalogue key", () => {
    const produced = new Set([...SQL.matchAll(/^\s+'([a-z0-9_]+)',/gm)].map((m) => m[1]));
    const nested: Record<string, RegExp> = {
      invites: /^invites_/,
      team_offers: /^team_offers_/,
      service_requests: /^service_requests_/,
    };
    for (const d of RPC_CATALOGUE) {
      const viaNest = Object.entries(nested).some(([k, rx]) => rx.test(d.key) && produced.has(k));
      expect(produced.has(d.key) || viaNest, d.key).toBe(true);
    }
  });

  it("uses the QA cast markers and the admin role to split populations", () => {
    expect(SQL).toContain("qa_synthetic");
    expect(SQL).toContain("labourmarket\\.ai$'");
    expect(SQL).toContain("QA[-_ ]SYNTHETIC");
    expect(SQL).toContain("p.active_role = 'admin'");
  });
});

describe("computeProductMetrics", () => {
  it("maps the function's numbers onto the catalogue, nested groups flattened", async () => {
    const s = await computeProductMetrics(
      fakeClient({
        data: {
          teams_total: split(1, 2),
          invites: { team_created: split(3), all_opened: split(4, 1) },
          team_offers: { accepted: split(0, 1) },
          need_to_first_offer_hours_p50: "5.5",
          integrity_offer_on_missing_need: 0,
          stale_offers_real_7d: 2,
        },
        error: null,
      }),
      NOW,
    );
    const v = (k: string) => s.metrics.find((m) => m.key === k)!.value;
    expect(v("teams_total")).toEqual(split(1, 2));
    expect(v("invites_team_created_90d")).toEqual(split(3));
    expect(v("invites_all_opened_90d")).toEqual(split(4, 1));
    expect(v("team_offers_accepted")).toEqual(split(0, 1));
    expect(v("need_to_first_offer_hours_p50")).toBe(5.5);
    expect(v("signin_dau")).toBeNull(); // absent from the payload → UNKNOWN, not 0
    expect(s.integrity.stale_offers_real_7d).toBe(2);
    expect(s.integrity.integrity_accepted_without_acceptor).toBeNull();
    for (const m of s.metrics) {
      expect(m.source.length, m.key).toBeGreaterThan(0);
      expect(m.rule.length, m.key).toBeGreaterThan(0);
      expect(m.window.length, m.key).toBeGreaterThan(0);
    }
  });

  it("without the function every population metric is UNKNOWN and the reason is listed", async () => {
    const s = await computeProductMetrics(fakeClient({ data: null, error: { code: "PGRST202" } }), NOW);
    expect(s.unknown).toContainEqual({ source: "ops_product_metrics_v1", reason: "PGRST202" });
    expect(s.metrics.filter((m) => m.group !== "technical").every((m) => m.value === null)).toBe(true);
    expect(metricTotal(null)).toBeNull();
    expect(metricReal(split(2, 5, 1))).toBe(2);
  });

  it("vacancy lag takes each provider's freshest cursor", async () => {
    const s = await computeProductMetrics(
      fakeClient(
        { data: {}, error: null },
        {
          vacancy_import_cursors: [
            { provider_key: "af", last_success_at: new Date(NOW - 58 * 86_400_000).toISOString() },
            { provider_key: "af", last_success_at: new Date(NOW - 2 * 3_600_000).toISOString() },
            { provider_key: "nav", last_success_at: new Date(NOW - 1 * 3_600_000).toISOString() },
          ],
        },
      ),
      NOW,
    );
    expect(s.metrics.find((m) => m.key === "vacancy_sync_lag_hours_max")!.value).toBe(2);
  });
});

describe("monitor signals", () => {
  const snap = (
    values: Record<string, unknown>,
    integrity: Record<string, number | null> = {},
    unknown: { source: string; reason: string }[] = [],
  ) =>
    ({
      computedAt: new Date(NOW).toISOString(),
      unknown,
      integrity: {
        integrity_accepted_without_acceptor: 0,
        integrity_offer_on_missing_need: 0,
        integrity_confirmation_on_deleted_entry: 0,
        integrity_join_team_into_non_team: 0,
        stale_offers_real_7d: 0,
        ...integrity,
      },
      metrics: Object.entries(values).map(([key, value]) => ({ key, value, group: "users", source: "s", rule: "r", window: "w" })),
    }) as any;

  it("every signal has a severity, a condition, an interval and a responder", () => {
    for (const s of SIGNALS) {
      expect(["P1", "P2", "P3"]).toContain(s.severity);
      expect(s.condition.length).toBeGreaterThan(10);
      expect(s.interval.length).toBeGreaterThan(0);
      expect(s.responder.length).toBeGreaterThan(0);
    }
  });

  it("fires on the condition, stays OK otherwise, and treats a missing input as UNKNOWN", () => {
    const res = evaluateSignals(
      snap(
        { registration_started_7d: 5, signup_completed_7d: 0, teams_total: split(2), teams_with_member: split(0) },
        { integrity_offer_on_missing_need: 1, stale_offers_real_7d: 1 },
      ),
      { searchMedianMs: 6900 },
    );
    const st = (id: string) => res.find((r) => r.id === id)!.state;
    expect(st("signup-broken")).toBe("BREACH");
    expect(st("team-formation-stalled")).toBe("BREACH");
    expect(st("search-slow")).toBe("BREACH");
    expect(st("data-integrity")).toBe("BREACH");
    expect(st("b2b-offers-unanswered")).toBe("BREACH");
    expect(st("review-queue-stale")).toBe("UNKNOWN");
    expect(st("metrics-unreadable")).toBe("OK");
  });

  it("observed text is aggregate numbers only, and an unreadable source is itself a breach", () => {
    const res = evaluateSignals(snap({}, {}, [{ source: "ops_product_metrics_v1", reason: "42501" }]), { searchMedianMs: 700 });
    for (const r of res) expect(r.observed).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(res.find((r) => r.id === "metrics-unreadable")!.state).toBe("BREACH");
  });
});

describe("the service-role metrics section stays behind the superadmin gate", () => {
  it("is rendered only by the launch-readiness page, which calls requireSuperadmin first", () => {
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of readdirSync(d)) {
        if (e === "node_modules" || e.startsWith(".")) continue;
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(p);
      }
      return out;
    };
    const importers = ["app", "components", "lib"]
      .flatMap((d) => walk(join(WEB, d)))
      .filter((f) => /from "@\/components\/admin\/product-metrics-section"/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(WEB.length + 1).split("\\").join("/"));
    expect(importers).toEqual(["app/[locale]/dashboard/admin/launch-readiness/page.tsx"]);
    const page = readFileSync(join(WEB, importers[0]!), "utf8");
    expect(page.indexOf("await requireSuperadmin(locale)")).toBeGreaterThan(-1);
    expect(page.indexOf("await requireSuperadmin(locale)")).toBeLessThan(page.indexOf("<ProductMetricsSection />"));
  });
});
