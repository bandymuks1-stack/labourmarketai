/* eslint-disable @typescript-eslint/no-explicit-any -- a PostgREST-shaped fake client */
import { describe, expect, it } from "vitest";

import { classifyAccount, classifyOrganization, computeProductMetrics, metricReal, metricTotal } from "./product-metrics";
import { SIGNALS, evaluateSignals, type MonitorProbes } from "./product-monitor";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

/** A PostgREST-shaped fake: `from(t).select().range().<filters>` resolves to the table rows. */
function fakeClient(tables: Record<string, Record<string, unknown>[] | "error">, users: Record<string, unknown>[]) {
  const query = (rows: Record<string, unknown>[] | "error") => {
    const q: any = {
      select: () => q,
      range: () => q,
      gte: () => q,
      eq: () => q,
      is: () => q,
      then: (resolve: (v: unknown) => void) =>
        resolve(rows === "error" ? { data: null, error: { code: "42P01" } } : { data: rows, error: null }),
    };
    return q;
  };
  return {
    from: (t: string) => query(tables[t] ?? []),
    auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } },
  } as any;
}

describe("population split", () => {
  it("separates the QA cast, test domains and staff from real people", () => {
    expect(classifyAccount({ email: "qa.owner+multiw@labourmarket.ai" })).toBe("TEST");
    expect(classifyAccount({ email: "x@anything.com", app_metadata: { qa_synthetic: true } })).toBe("TEST");
    expect(classifyAccount({ email: "probe@example.com" })).toBe("TEST");
    expect(classifyAccount({ email: "ops@labourmarket.ai" })).toBe("INTERNAL");
    expect(classifyAccount({ email: "someone@gmail.com", isAdmin: true })).toBe("INTERNAL");
    expect(classifyAccount({ email: "someone@gmail.com" })).toBe("REAL");
  });

  it("a fixture-labelled organization is TEST whoever owns it", () => {
    const people = new Map([["p1", "REAL" as const]]);
    expect(classifyOrganization({ owner_profile_id: "p1", legal_name: "QA-SYNTHETIC Alfa" }, people)).toBe("TEST");
    expect(classifyOrganization({ owner_profile_id: "p1", legal_name: "Statyba UAB" }, people)).toBe("REAL");
  });
});

describe("computeProductMetrics", () => {
  const users = [
    { id: "r1", email: "a@gmail.com", created_at: ago(2), last_sign_in_at: ago(0.5) },
    { id: "r2", email: "b@gmail.com", created_at: ago(40), last_sign_in_at: ago(3) },
    { id: "q1", email: "qa.worker+goal3@labourmarket.ai", created_at: ago(1), last_sign_in_at: ago(0.1) },
  ];

  it("counts by population and never mixes the QA cast into REAL", async () => {
    const s = await computeProductMetrics(
      fakeClient(
        {
          organizations: [
            { id: "t1", organization_type: "team", owner_profile_id: "r1", legal_name: "Brigada", created_at: ago(1) },
            { id: "t2", organization_type: "team", owner_profile_id: "q1", legal_name: "QA-SYNTHETIC brigade", created_at: ago(1) },
          ],
          engagement_contexts: [{ organization_id: "t1", profile_id: "r2", relationship_slug: "employee", status: "active" }],
        },
        users,
      ),
      NOW,
    );
    const v = (k: string) => s.metrics.find((m) => m.key === k)!.value as Record<string, number>;
    expect(v("signin_dau")).toEqual({ REAL: 1, TEST: 1, INTERNAL: 0 });
    expect(v("returning_7d")).toEqual({ REAL: 1, TEST: 0, INTERNAL: 0 });
    expect(v("teams_total")).toEqual({ REAL: 1, TEST: 1, INTERNAL: 0 });
    expect(v("teams_with_member")).toEqual({ REAL: 1, TEST: 0, INTERNAL: 0 });
    expect(v("teams_offerable")).toEqual({ REAL: 0, TEST: 0, INTERNAL: 0 });
    for (const m of s.metrics) {
      expect(m.source.length, m.key).toBeGreaterThan(0);
      expect(m.rule.length, m.key).toBeGreaterThan(0);
      expect(m.window.length, m.key).toBeGreaterThan(0);
    }
  });

  it("an unreadable source is UNKNOWN (null) and reported — never 0", async () => {
    const s = await computeProductMetrics(fakeClient({ team_demand_offers: "error" }, users), NOW);
    expect(s.metrics.find((m) => m.key === "team_offers_offered")!.value).toBeNull();
    expect(s.unknown.map((u) => u.source)).toContain("team_demand_offers");
    expect(metricTotal(null)).toBeNull();
    expect(metricReal({ REAL: 2, TEST: 5, INTERNAL: 1 })).toBe(2);
  });
});

describe("monitor signals", () => {
  const probes: MonitorProbes = {
    searchMedianMs: 800,
    acceptedInvitesWithoutAcceptor: 0,
    offersOnMissingNeed: 0,
    confirmationsOnDeletedEntries: 0,
    teamMembersOutsideTeam: 0,
  };
  const snap = (metrics: { key: string; value: unknown }[], unknown: { source: string; reason: string }[] = []) =>
    ({ computedAt: ago(0), unknown, truncated: [], metrics: metrics.map((m) => ({ ...m, group: "users", source: "s", rule: "r", window: "w" })) }) as any;

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
      snap([
        { key: "registration_started_7d", value: 5 },
        { key: "signup_completed_7d", value: 0 },
        { key: "teams_total", value: { REAL: 2, TEST: 0, INTERNAL: 0 } },
        { key: "teams_with_member", value: { REAL: 0, TEST: 0, INTERNAL: 0 } },
      ]),
      { ...probes, searchMedianMs: 6900, offersOnMissingNeed: 1 },
      { staleOfferCount: 0 },
    );
    const st = (id: string) => res.find((r) => r.id === id)!.state;
    expect(st("signup-broken")).toBe("BREACH");
    expect(st("team-formation-stalled")).toBe("BREACH");
    expect(st("search-slow")).toBe("BREACH");
    expect(st("data-integrity")).toBe("BREACH");
    expect(st("b2b-offers-unanswered")).toBe("OK");
    expect(st("review-queue-stale")).toBe("UNKNOWN");
    expect(st("metrics-unreadable")).toBe("OK");
  });

  it("observed text is aggregate numbers only", () => {
    const res = evaluateSignals(snap([], [{ source: "invitations", reason: "42P01" }]), probes);
    for (const r of res) expect(r.observed).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(res.find((r) => r.id === "metrics-unreadable")!.state).toBe("BREACH");
  });
});

describe("the service-role metrics section stays behind the superadmin gate", () => {
  it("is rendered only by the launch-readiness page, which calls requireSuperadmin first", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const web = join(__dirname, "..", "..");
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
      .flatMap((d) => walk(join(web, d)))
      .filter((f) => /from "@\/components\/admin\/product-metrics-section"/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(web.length + 1).split("\\").join("/"));
    expect(importers).toEqual(["app/[locale]/dashboard/admin/launch-readiness/page.tsx"]);
    const page = readFileSync(join(web, importers[0]!), "utf8");
    expect(page.indexOf("await requireSuperadmin(locale)")).toBeGreaterThan(-1);
    expect(page.indexOf("await requireSuperadmin(locale)")).toBeLessThan(page.indexOf("<ProductMetricsSection />"));
  });
});
