import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "./same-origin-request";

/**
 * The production shape since 2026-10-17: nginx on the VPS forwards to the
 * standalone server bound to 0.0.0.0:3000, so `req.url` carries the bind host
 * while the browser's Origin carries the public host.
 */
function behindProxy(headers: Record<string, string>): Request {
  return new Request("http://0.0.0.0:3000/api/assistant/transcript", {
    method: "POST",
    headers: {
      host: "labourmarket.ai",
      "x-forwarded-host": "labourmarket.ai",
      "x-forwarded-proto": "https",
      ...headers,
    },
  });
}

describe("isSameOriginRequest — self-hosted behind a reverse proxy", () => {
  it("accepts the browser's Origin for the public host even though req.url is the bind host", () => {
    expect(isSameOriginRequest(behindProxy({ origin: "https://labourmarket.ai", "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("the regression that broke transcript persistence: the bind host is NOT what the browser sends", () => {
    // The old check compared against req.url; this is the one Origin it would have accepted.
    expect(isSameOriginRequest(behindProxy({ origin: "http://0.0.0.0:3000", "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("refuses a cross-site page even when it forges a matching Origin header word", () => {
    expect(isSameOriginRequest(behindProxy({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(behindProxy({ origin: "https://evil.example", "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("a forged X-Forwarded-Host never widens the allowed origin (unknown hosts resolve to the canonical origin)", () => {
    expect(
      isSameOriginRequest(
        behindProxy({ "x-forwarded-host": "evil.example", origin: "https://evil.example", "sec-fetch-site": "same-origin" }),
      ),
    ).toBe(false);
  });

  it("without an Origin header only an explicit same-origin fetch metadata passes", () => {
    expect(isSameOriginRequest(behindProxy({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(behindProxy({}))).toBe(false);
    expect(isSameOriginRequest(behindProxy({ "sec-fetch-site": "none" }))).toBe(false);
  });

  it("a local development server keeps working (Origin = its own host)", () => {
    const local = new Request("http://localhost:3000/api/assistant/transcript", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
    });
    expect(isSameOriginRequest(local)).toBe(true);
  });
});
