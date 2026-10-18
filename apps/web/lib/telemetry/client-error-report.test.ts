import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  browserFamily,
  redactMessage,
  routeShape,
  sanitizeClientErrorReport,
} from "./client-error-report";
import { CLIENT_ERROR_EARLY_SCRIPT } from "./client-error-early-script";
import { POST } from "@/app/api/client-errors/route";

/**
 * Browser crash reports (2026-10-18 incident): the report says what broke and
 * where, never who or with what data; the server logs one line and stores
 * nothing.
 */

const IPHONE_IOS15 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Mobile/15E148 Safari/604.1";

describe("sanitiser", () => {
  it("keeps the incident's diagnosis intact", () => {
    const r = sanitizeClientErrorReport({
      kind: "window",
      name: "SyntaxError",
      message: "Invalid regular expression: invalid group specifier name",
      route: "/en/auth/signup?next=%2Fen%2Finvite%2Fabcdef0123456789",
    });
    expect(r).toEqual({
      kind: "window",
      name: "SyntaxError",
      message: "Invalid regular expression: invalid group specifier name",
      route: "/en/auth/signup",
      digest: null,
      browser: null,
      build: null,
    });
  });

  it("removes anything that could carry a person's data", () => {
    const m = redactMessage(
      'Cannot read "Jonas Jonaitis" of jonas@example.com at https://labourmarket.ai/en/invite/tok?x=1 id 0f8fad5b-d9cb-469f-a165-70867728950e phone 37061234567',
    );
    expect(m).not.toMatch(/Jonas|example\.com|labourmarket\.ai|0f8fad5b|3706/);
    expect(m).toContain("<str>");
    expect(m).toContain("<email>");
    expect(m).toContain("<url>");
    expect(m).toContain("<id>");
    expect(m.length).toBeLessThanOrEqual(160);
  });

  it("route shapes fold tokens and ids, drop query and hash", () => {
    expect(routeShape("/en/invite/9f3c2a7d8e1b4c5d6e7f8091a2b3c4d5?x=1#y")).toBe("/en/invite/:id");
    expect(routeShape("/lt/dashboard/company/projects/12345678")).toBe("/lt/dashboard/company/projects/:id");
    expect(routeShape("https://evil.example/x")).toBe("/");
  });

  it("refuses a report without a known kind and cleans every other field", () => {
    expect(sanitizeClientErrorReport({ kind: "debug" })).toBeNull();
    expect(sanitizeClientErrorReport("x")).toBeNull();
    const r = sanitizeClientErrorReport({ kind: "boundary", name: "<script>", digest: "a b", browser: "x".repeat(80), build: "zz" });
    expect(r?.name).toBe("Error");
    expect(r?.digest).toBeNull();
    expect(r?.browser).toBeNull();
    expect(r?.build).toBeNull();
  });

  it("browser is a family and a major version only", () => {
    expect(browserFamily(IPHONE_IOS15)).toBe("Safari 15");
    expect(browserFamily("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/118.0.0.0 Mobile Safari/537.36")).toBe("Chrome 118");
    expect(browserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]")).toBe("Facebook App 440");
  });
});

describe("POST /api/client-errors", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  afterEach(() => warn.mockClear());

  const req = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://0.0.0.0:3000/api/client-errors", {
      method: "POST",
      body,
      headers: {
        host: "labourmarket.ai",
        "x-forwarded-host": "labourmarket.ai",
        "x-forwarded-proto": "https",
        "x-real-ip": "203.0.113.7",
        "user-agent": IPHONE_IOS15,
        "sec-fetch-site": "same-origin",
        origin: "https://labourmarket.ai",
        ...headers,
      },
    });

  it("logs exactly one sanitised line and answers 204", async () => {
    const res = await POST(
      req(JSON.stringify({ kind: "window", name: "SyntaxError", message: "Invalid regular expression: invalid group specifier name", route: "/en/auth/login?next=%2Fx" })),
    );
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const [tag, line] = warn.mock.calls[0] as [string, string];
    expect(tag).toBe("[client-error]");
    const logged = JSON.parse(line);
    expect(logged).toMatchObject({ kind: "window", name: "SyntaxError", route: "/en/auth/login", browser: "Safari 15" });
    expect(line).not.toContain("203.0.113.7");
    expect(line).not.toContain("next=");
  });

  it("a cross-site, oversized or malformed report is dropped silently", async () => {
    const cross = await POST(req(JSON.stringify({ kind: "window" }), { "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
    const big = await POST(req(JSON.stringify({ kind: "window", message: "x".repeat(3000) })));
    const junk = await POST(req("not json"));
    for (const r of [cross, big, junk]) expect(r.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("early crash reporter (inline, before React)", () => {
  type Listener = (event: unknown) => void;
  function load() {
    const listeners: Record<string, Listener> = {};
    const beacons: string[] = [];
    const win = { addEventListener: (type: string, fn: Listener) => (listeners[type] = fn) } as Record<string, unknown>;
    const nav = { sendBeacon: (_url: string, blob: { text: string }) => (beacons.push(blob.text), true) };
    class FakeBlob {
      text: string;
      constructor(parts: string[]) {
        this.text = parts.join("");
      }
    }
    new Function("window", "navigator", "location", "Blob", CLIENT_ERROR_EARLY_SCRIPT)(win, nav, { pathname: "/en/auth/signup" }, FakeBlob);
    return { listeners, beacons, win };
  }

  it("reports a module-evaluation crash, a missing chunk; ignores images; at most three", () => {
    const { listeners, beacons, win } = load();
    listeners.error({ target: win, error: { name: "SyntaxError", message: "Invalid regular expression: invalid group specifier name" } });
    listeners.error({ target: { tagName: "IMG", src: "https://labourmarket.ai/x.png" } });
    listeners.error({ target: { tagName: "SCRIPT", src: "https://labourmarket.ai/_next/static/chunks/737-abc.js?v=1" } });
    listeners.unhandledrejection({ reason: { name: "TypeError", message: "x" } });
    listeners.unhandledrejection({ reason: "fourth" });
    expect(beacons).toHaveLength(3);
    expect(JSON.parse(beacons[0]!)).toEqual({ kind: "window", name: "SyntaxError", message: "Invalid regular expression: invalid group specifier name", route: "/en/auth/signup" });
    expect(JSON.parse(beacons[1]!)).toMatchObject({ name: "ResourceLoadError", message: "script /_next/static/chunks/737-abc.js" });
    expect(JSON.parse(beacons[2]!)).toMatchObject({ kind: "rejection", name: "TypeError" });
  });

  it("runs in <head> right after the regex shim", () => {
    const layout = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "layout.tsx"), "utf8");
    const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
    const shim = head.indexOf("REGEXP_LOOKBEHIND_SHIM");
    const early = head.indexOf("CLIENT_ERROR_EARLY_SCRIPT");
    expect(shim).toBeGreaterThan(-1);
    expect(early).toBeGreaterThan(shim);
    expect(head.indexOf("application/ld+json")).toBeGreaterThan(early);
  });
});
