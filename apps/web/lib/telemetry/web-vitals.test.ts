import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWebVitalsSample, webVitalsRoute } from "./web-vitals";

describe("webVitalsRoute removes ids and tokens", () => {
  it("keeps plain paths", () => {
    expect(webVitalsRoute("/lt")).toBe("/lt");
    expect(webVitalsRoute("/en/for-companies")).toBe("/en/for-companies");
    expect(webVitalsRoute("")).toBe("/");
  });
  it("replaces a record id, a token and a long number", () => {
    expect(webVitalsRoute("/lt/jobs/7bb88460-71a5-4dc8-8119-c53a096b3b0d")).toBe("/lt/jobs/:id");
    expect(webVitalsRoute("/en/invite/AbCdEfGhIjKlMnOpQrStUvWx_12")).toBe("/en/invite/:id");
    expect(webVitalsRoute("/lt/dashboard/projects/123456/team")).toBe("/lt/dashboard/projects/:id/team");
  });
  it("drops the query and the fragment", () => {
    expect(webVitalsRoute("/lt/auth/login?next=%2Flt%2Fdashboard#x")).toBe("/lt/auth/login");
  });
});

describe("buildWebVitalsSample", () => {
  it("carries LCP as the duration and three bounded numbers", () => {
    expect(buildWebVitalsSample({ lcpMs: 1234.6, cls: 0.11449, fcpMs: 900.2, ttfbMs: 310.9 })).toEqual({
      durationMs: 1235,
      metadata: { cls: 0.114, fcp_ms: 900, ttfb_ms: 311 },
    });
  });
  it("sends nothing without a usable LCP", () => {
    expect(buildWebVitalsSample({ lcpMs: null, cls: 0, fcpMs: 1, ttfbMs: 1 })).toBeNull();
    expect(buildWebVitalsSample({ lcpMs: 0, cls: 0, fcpMs: 1, ttfbMs: 1 })).toBeNull();
    expect(buildWebVitalsSample({ lcpMs: Number.NaN, cls: 0, fcpMs: 1, ttfbMs: 1 })).toBeNull();
    expect(buildWebVitalsSample({ lcpMs: 500_000, cls: 0, fcpMs: 1, ttfbMs: 1 })).toBeNull();
  });
  it("drops a number that is out of range instead of sending it", () => {
    expect(buildWebVitalsSample({ lcpMs: 800, cls: -1, fcpMs: Infinity, ttfbMs: null })).toEqual({
      durationMs: 800,
      metadata: {},
    });
  });
});

describe("web vitals are measured only with consent (source guard)", () => {
  const root = join(__dirname, "..", "..");
  const beacon = readFileSync(join(root, "components", "app", "web-vitals-beacon.tsx"), "utf8");
  const task = readFileSync(join(root, "lib", "telemetry", "task.ts"), "utf8");
  const actions = readFileSync(join(root, "lib", "telemetry", "actions.ts"), "utf8");

  it("the beacon checks consent before it sets up any observer", () => {
    const consent = beacon.indexOf("if (!hasAnalyticsConsent()) return;");
    const firstObserver = beacon.indexOf("new PerformanceObserver");
    expect(consent).toBeGreaterThan(-1);
    expect(firstObserver).toBeGreaterThan(consent);
  });

  it("the sample goes through the one consent-gated event sender", () => {
    expect(task).toContain("fire(WEB_VITALS_EVENT, \"info\", {");
    expect(task).toContain("if (!hasAnalyticsConsent()) return;");
    expect(beacon).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest/);
  });

  it("the route is filed without ids or tokens", () => {
    expect(task).toContain("route: webVitalsRoute(pathname),");
  });

  it("the server accepts exactly the three extra numbers", () => {
    for (const key of ['"cls"', '"fcp_ms"', '"ttfb_ms"']) expect(actions).toContain(key);
  });
});
