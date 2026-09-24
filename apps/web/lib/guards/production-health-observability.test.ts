import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VACANCY_FRESHNESS_DELAYED_AFTER_HOURS,
  VACANCY_FRESHNESS_STALE_AFTER_HOURS,
  boundedReason,
  buildVacancyFreshness,
  summarizeHealth,
  timedCheck,
  type VacancyFreshnessCheck,
} from "@/lib/ops/health-model";
import { deployEnvFromEnv } from "@/lib/telemetry/production-host";

/**
 * Guard: production health + error instrumentation (FINAL COMPLETION Train L1).
 *
 * Pins the two properties that make these safe to expose and cheap to keep:
 *   1. /api/health answers only booleans, latencies and the build id — never
 *      a count of anything a person owns, never a secret, never a hostname;
 *      overall `ok` is the conjunction of what a sign-in needs (auth + db).
 *   2. onRequestError logs a bounded, PII-free JSON line — route PATTERN,
 *      method, error name, digest — never the URL query, headers, cookies,
 *      body or the free-form message.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("Guard: /api/health", () => {
  const route = read("app/api/health/route.ts");

  it("is a public, uncached, timeout-bounded probe of auth + db", () => {
    expect(route).toMatch(/export const dynamic = "force-dynamic"/);
    expect(route).toMatch(/cache-control.*no-store/);
    expect(route).toMatch(/auth\/v1\/settings/);
    expect(route).toMatch(/rpc\/\$\{DB_PROBE_RPC\}/);
    expect(route).toMatch(/timedCheck\(/);
    expect(route).toMatch(/PROBE_TIMEOUT_MS/);
  });

  it("the db probe is a CONSTANT-COST real read, not the heavy public count (P0-1, 2026-09-03)", () => {
    // count_public_vacancies_v1 scans ~45k active rows and measured 3.1–3.8 s
    // cold against the anon 3 s statement_timeout: the probe flapped 503/200
    // with the buffer pool, paging on a slow public query rather than on the
    // product's ability to serve a person. A primary-key lookup on the nil
    // UUID is a real PostgREST → pooler → database round trip at bounded cost.
    expect(route).toMatch(/const DB_PROBE_RPC = "get_public_vacancy_preview_v1"/);
    expect(route).toMatch(/const NIL_UUID = "00000000-0000-0000-0000-000000000000"/);
    expect(route).toMatch(/body: JSON\.stringify\(\{ p_id: NIL_UUID \}\)/);
    // executable text only — the rationale comment is allowed to name the old RPC
    const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // RE-ANCHORED 2026-09-23: the count RPC may appear in executable text ONLY
    // as the separate freshness probe (below); the db probe never names it.
    expect(code).not.toMatch(/DB_PROBE_RPC = "count_public_vacancies_v1"/);
    expect(code.match(/count_public_vacancies_v1/g)).toEqual(["count_public_vacancies_v1"]);
    expect(code).toMatch(/const FRESHNESS_RPC = "count_public_vacancies_v1"/);
    expect(code).not.toMatch(/search_public_vacancy_previews_v1|list_public_vacancy_sitemap_v1/);
  });

  it("uses only the anon key — never the service role, never cookies", () => {
    expect(route).not.toMatch(/SERVICE_ROLE|service_role|createClient\(|cookies\(/);
  });

  it("503 when not ok, 200 when ok", () => {
    expect(route).toMatch(/status: report\.ok \? 200 : 503/);
  });

  const FRESH: VacancyFreshnessCheck = {
    ok: true,
    ms: 30,
    state: "current",
    lastRefreshedAt: "2026-09-02T14:00:00.000Z",
    ageHours: 1,
    staleAfterHours: VACANCY_FRESHNESS_STALE_AFTER_HOURS,
  };

  it("the report is booleans + latencies + build + bounded words; overall ok = auth && db", () => {
    const r = summarizeHealth({
      auth: { ok: true, ms: 12 },
      db: { ok: false, ms: 4000, reason: "timeout" },
      vacancyFreshness: FRESH,
      deployEnv: "production",
      build: "289c92ac",
      region: "dub1",
      now: new Date("2026-09-02T15:00:00Z"),
    });
    expect(r).toEqual({
      ok: false,
      at: "2026-09-02T15:00:00.000Z",
      build: "289c92ac",
      region: "dub1",
      deployEnv: "production",
      checks: { auth: { ok: true, ms: 12 }, db: { ok: false, ms: 4000, reason: "timeout" } },
      vacancyFreshness: FRESH,
    });
    expect(JSON.stringify(r)).not.toMatch(/supabase\.co|eyJ|sb_/);
  });

  /**
   * DEPLOY ENV (2026-09-24). The outbound host policy's primary production
   * evidence is `VERCEL_ENV`, and an env-keyed rule fails open when the
   * variable goes missing. The health answer names what the variable holds
   * so a monitor on the production host can see `unset` — informational,
   * never folded into `ok`.
   */
  describe("deployEnv", () => {
    it("the route reports VERCEL_ENV through the ONE bounded parser", () => {
      expect(route).toMatch(/deployEnv: deployEnvFromEnv\(\)/);
      expect(route).toMatch(/from "@\/lib\/telemetry\/production-host"/);
    });

    it("is one of five words — a missing variable is `unset`, an unknown value is `other`, never the value itself", () => {
      expect(deployEnvFromEnv({ VERCEL_ENV: "production" })).toBe("production");
      expect(deployEnvFromEnv({ VERCEL_ENV: "preview" })).toBe("preview");
      expect(deployEnvFromEnv({ VERCEL_ENV: "development" })).toBe("development");
      expect(deployEnvFromEnv({})).toBe("unset");
      expect(deployEnvFromEnv({ VERCEL_ENV: "  " })).toBe("unset");
      expect(deployEnvFromEnv({ VERCEL_ENV: "https://secret.host" })).toBe("other");
    });

    it("NEGATIVE CONTROL — `unset` on a healthy deployment does not flip `ok`; it is reported, not judged", () => {
      const r = summarizeHealth({
        auth: { ok: true, ms: 12 },
        db: { ok: true, ms: 30 },
        vacancyFreshness: FRESH,
        deployEnv: "unset",
        build: null,
        region: null,
        now: new Date("2026-09-24T12:00:00Z"),
      });
      expect(r.ok).toBe(true);
      expect(r.deployEnv).toBe("unset");
      const model = read("lib/ops/health-model.ts");
      expect(model).not.toMatch(/ok: input\.auth\.ok && input\.db\.ok && /);
      expect(model).not.toMatch(/deployEnv === "production" &&/);
    });
  });

  /**
   * VACANCY FRESHNESS (2026-09-23). Ingestion runs as a GitHub schedule in a
   * PUBLIC repository; GitHub disables such schedules after 60 days without
   * repository activity, and the only monitor lived on the same schedules.
   * `/api/health` now carries the age of the supply for an external monitor —
   * and NEVER lets it change the status a sign-in monitor pages on.
   */
  describe("vacancyFreshness", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
    const answered = { ok: true, ms: 40 };

    it("thresholds: one missed day is delayed, three days is stale", () => {
      expect(VACANCY_FRESHNESS_DELAYED_AFTER_HOURS).toBe(24);
      expect(VACANCY_FRESHNESS_STALE_AFTER_HOURS).toBe(72);
    });

    it("classifies a confirmed refresh by age", () => {
      expect(buildVacancyFreshness({ probe: answered, lastRefreshedAt: hoursAgo(2), now })).toEqual({
        ok: true,
        ms: 40,
        state: "current",
        lastRefreshedAt: hoursAgo(2),
        ageHours: 2,
        staleAfterHours: 72,
      });
      expect(buildVacancyFreshness({ probe: answered, lastRefreshedAt: hoursAgo(30), now }).state).toBe("delayed");
      expect(buildVacancyFreshness({ probe: answered, lastRefreshedAt: hoursAgo(71), now }).state).toBe("delayed");
      expect(buildVacancyFreshness({ probe: answered, lastRefreshedAt: hoursAgo(72), now }).state).toBe("stale");
      expect(buildVacancyFreshness({ probe: answered, lastRefreshedAt: hoursAgo(24 * 61), now }).state).toBe("stale");
    });

    it("an answered read with no timestamp is unknown; a failed read is unavailable — neither is current", () => {
      expect(buildVacancyFreshness({ probe: answered, lastRefreshedAt: null, now })).toMatchObject({
        ok: true,
        state: "unknown",
        ageHours: null,
      });
      const failed = buildVacancyFreshness({
        probe: { ok: false, ms: 4000, reason: "timeout" },
        // A stale-looking timestamp from a probe that did NOT answer is not trusted.
        lastRefreshedAt: hoursAgo(1),
        now,
      });
      expect(failed).toMatchObject({ ok: false, reason: "timeout", state: "unavailable", lastRefreshedAt: null });
    });

    it("NEGATIVE CONTROL — stale supply does not flip `ok`, and a healthy corpus does not rescue it", () => {
      const stale = buildVacancyFreshness({ probe: answered, lastRefreshedAt: hoursAgo(200), now });
      expect(stale.state).toBe("stale");
      const r = summarizeHealth({
        auth: { ok: true, ms: 12 },
        db: { ok: true, ms: 30 },
        vacancyFreshness: stale,
        deployEnv: "production",
        build: null,
        region: null,
        now,
      });
      expect(r.ok).toBe(true);
      expect(r.vacancyFreshness.state).toBe("stale");
      const down = summarizeHealth({
        auth: { ok: false, ms: 4000, reason: "timeout" },
        db: { ok: true, ms: 30 },
        vacancyFreshness: FRESH,
        deployEnv: "production",
        build: null,
        region: null,
        now,
      });
      expect(down.ok).toBe(false);
    });

    it("the route reads it through a SEPARATE anon probe, bounded like the others, and never folds it into `ok`", () => {
      expect(route).toMatch(/rpc\/\$\{FRESHNESS_RPC\}/);
      expect(route).toMatch(/const \[auth, db, freshness\] = await Promise\.all\(/);
      expect(route).toMatch(/buildVacancyFreshness\(\{/);
      expect(route).toMatch(/last_refreshed_at/);
      // Three timed checks, one timeout constant, no untimed fetch.
      expect(route.match(/timedCheck\(/g)).toHaveLength(3);
      expect(route.match(/PROBE_TIMEOUT_MS\)/g)).toHaveLength(3);
      // The model — not the route — decides `ok`, and it ignores freshness.
      const model = read("lib/ops/health-model.ts");
      expect(model).toMatch(/ok: input\.auth\.ok && input\.db\.ok,/);
      expect(model).not.toMatch(/ok: input\.auth\.ok && input\.db\.ok && /);
    });
  });

  it("a hung dependency is a failed check, not a hung probe", async () => {
    const c = await timedCheck(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      20,
    );
    expect(c.ok).toBe(false);
    expect(c.reason).toBe("timeout");
    expect(c.ms).toBeGreaterThanOrEqual(15);
  });

  it("reasons are bounded class names, never messages", () => {
    expect(boundedReason(new TypeError("fetch failed: https://secret.host"))).toBe("TypeError");
    expect(boundedReason({ name: "weird name with spaces" })).toBe("Error");
    expect(boundedReason("string")).toBe("Error");
  });
});

describe("Guard: onRequestError instrumentation", () => {
  const src = read("instrumentation.ts");

  it("exports the Next.js hook and logs one JSON line tagged request_error", () => {
    expect(src).toMatch(/export async function onRequestError\(/);
    expect(src).toMatch(/event: "request_error"/);
    expect(src).toMatch(/console\.error\(JSON\.stringify\(line\)\)/);
  });

  it("logs the route PATTERN, method, name and digest — never query, headers, cookies, body or message", () => {
    expect(src).toMatch(/route: boundedRoute\(/);
    expect(src).toMatch(/digest: digestOf\(/);
    const logged = src.slice(src.indexOf("const line = {"), src.indexOf("console.error("));
    expect(logged).not.toMatch(/headers|cookie|body|message|searchParams|query|user/i);
    expect(src).toMatch(/split\("\?"\)\[0\]/);
  });

  it("carries no vendor SDK", () => {
    expect(src).not.toMatch(/@sentry|posthog|datadog|newrelic|logtail|axiom/i);
  });
});
