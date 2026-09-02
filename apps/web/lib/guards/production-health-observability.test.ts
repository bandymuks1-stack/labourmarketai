import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  boundedReason,
  summarizeHealth,
  timedCheck,
} from "@/lib/ops/health-model";

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
    expect(route).toMatch(/rpc\/count_public_vacancies_v1/);
    expect(route).toMatch(/timedCheck\(/);
    expect(route).toMatch(/PROBE_TIMEOUT_MS/);
  });

  it("uses only the anon key — never the service role, never cookies", () => {
    expect(route).not.toMatch(/SERVICE_ROLE|service_role|createClient\(|cookies\(/);
  });

  it("503 when not ok, 200 when ok", () => {
    expect(route).toMatch(/status: report\.ok \? 200 : 503/);
  });

  it("the report is booleans + latencies + build; overall ok = auth && db", () => {
    const r = summarizeHealth({
      auth: { ok: true, ms: 12 },
      db: { ok: false, ms: 4000, reason: "timeout" },
      build: "289c92ac",
      region: "dub1",
      now: new Date("2026-09-02T15:00:00Z"),
    });
    expect(r).toEqual({
      ok: false,
      at: "2026-09-02T15:00:00.000Z",
      build: "289c92ac",
      region: "dub1",
      checks: { auth: { ok: true, ms: 12 }, db: { ok: false, ms: 4000, reason: "timeout" } },
    });
    expect(JSON.stringify(r)).not.toMatch(/supabase\.co|eyJ|sb_/);
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
