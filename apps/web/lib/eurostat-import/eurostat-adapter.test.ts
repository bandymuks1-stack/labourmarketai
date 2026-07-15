import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildEurostatRequestUrl,
  fetchEurostatDataset,
} from "./eurostat-adapter";
import { getEurostatDataset } from "@/lib/intelligence/eurostat-source-v1";

const UNE = getEurostatDataset("une_rt_m")!;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildEurostatRequestUrl — deterministic official request", () => {
  it("targets the canonical host and pins every dimension + geo + lastTimePeriod", () => {
    const url = buildEurostatRequestUrl(UNE, "LT", 4);
    const u = new URL(url);
    expect(u.origin).toBe("https://ec.europa.eu");
    expect(u.pathname).toContain("/eurostat/api/dissemination/statistics/1.0/data/une_rt_m");
    expect(u.searchParams.get("geo")).toBe("LT");
    expect(u.searchParams.get("lastTimePeriod")).toBe("4");
    expect(u.searchParams.get("s_adj")).toBe("SA");
    expect(u.searchParams.get("unit")).toBe("PC_ACT");
    expect(u.searchParams.get("format")).toBe("JSON");
  });
});

function enable() {
  vi.stubEnv("EUROSTAT_SOURCE_ENABLED", "on");
  vi.stubEnv("EUROSTAT_KILL_SWITCH", "");
}

describe("fetchEurostatDataset — gates and bounds", () => {
  it("refuses a non-allowlisted dataset code without any network call", async () => {
    enable();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await fetchEurostatDataset({ datasetCode: "nama_10_gdp", geo: "LT", lastTimePeriod: 4 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("dataset_not_allowlisted");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a non-allowlisted geography", async () => {
    enable();
    vi.stubGlobal("fetch", vi.fn());
    const res = await fetchEurostatDataset({ datasetCode: "une_rt_m", geo: "US", lastTimePeriod: 4 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("geo_not_allowlisted");
  });

  it("throws (kill switch) when the source is not operational", async () => {
    vi.stubEnv("EUROSTAT_SOURCE_ENABLED", "on");
    vi.stubEnv("EUROSTAT_KILL_SWITCH", "on");
    await expect(
      fetchEurostatDataset({ datasetCode: "une_rt_m", geo: "LT", lastTimePeriod: 4 }),
    ).rejects.toThrow(/eurostat_blocked:kill_switch_engaged/);
  });

  it("returns parsed JSON + sha256 on a valid JSON response", async () => {
    enable();
    const body = JSON.stringify({ class: "dataset", updated: "2026-07-02T23:00:00+0200" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    const res = await fetchEurostatDataset({ datasetCode: "une_rt_m", geo: "LT", lastTimePeriod: 4 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.httpStatus).toBe(200);
      expect(res.responseSha256).toMatch(/^[a-f0-9]{64}$/);
      expect((res.body as { class?: string }).class).toBe("dataset");
    }
  });

  it("does NOT retry a deterministic 4xx", async () => {
    enable();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response("bad", { status: 400, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await fetchEurostatDataset({ datasetCode: "une_rt_m", geo: "LT", lastTimePeriod: 4 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("http_error");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-JSON content type", async () => {
    enable();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } })),
    );
    const res = await fetchEurostatDataset({ datasetCode: "une_rt_m", geo: "LT", lastTimePeriod: 4 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("content_type_invalid");
  });
});
