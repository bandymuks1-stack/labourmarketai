import { describe, expect, it } from "vitest";

import {
  GEO_ERROR_PERMISSION_DENIED,
  GEO_ERROR_POSITION_UNAVAILABLE,
  GEO_ERROR_TIMEOUT,
  canRetrySucceed,
  classifyGeoFailure,
  detectInAppBrowser,
  needsOpenInBrowserGuidance,
  type GeoEnvironment,
} from "./geo-capability";

const normalEnv: GeoEnvironment = {
  secureContext: true,
  apiAvailable: true,
  inApp: null,
};

// Real-world user agents (abbreviated to the discriminating tokens).
const UA = {
  fbIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/468.0.0;FB_IAB/FB4A]",
  fbAndroid: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/467.1.0.53.83;]",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 340.0.0.22.92",
  tiktok: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 musical_ly_2023 BytedanceWebview",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; SM-G991B; wv) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile",
  chromeDesktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0",
};

describe("detectInAppBrowser", () => {
  it("detects Facebook / Instagram / TikTok / generic webviews", () => {
    expect(detectInAppBrowser(UA.fbIos)).toBe("facebook");
    expect(detectInAppBrowser(UA.fbAndroid)).toBe("facebook");
    expect(detectInAppBrowser(UA.instagram)).toBe("instagram");
    expect(detectInAppBrowser(UA.tiktok)).toBe("tiktok");
    expect(detectInAppBrowser(UA.androidWebView)).toBe("other-in-app");
  });
  it("returns null for normal browsers (never over-detects)", () => {
    expect(detectInAppBrowser(UA.chromeDesktop)).toBeNull();
    expect(detectInAppBrowser(UA.safariIos)).toBeNull();
    expect(detectInAppBrowser(UA.firefoxAndroid)).toBeNull();
    expect(detectInAppBrowser(null)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });
});

describe("classifyGeoFailure — every failure is a distinct state", () => {
  it("insecure context wins over everything (API is platform-disabled)", () => {
    expect(
      classifyGeoFailure({ ...normalEnv, secureContext: false }, null),
    ).toBe("insecure-context");
  });
  it("missing API → unsupported", () => {
    expect(classifyGeoFailure({ ...normalEnv, apiAvailable: false }, null)).toBe("unsupported");
  });
  it("permission denied in a normal browser → denied", () => {
    expect(classifyGeoFailure(normalEnv, GEO_ERROR_PERMISSION_DENIED)).toBe("denied");
  });
  it("permission denied inside an in-app browser → denied-in-app (different recovery)", () => {
    expect(
      classifyGeoFailure({ ...normalEnv, inApp: "facebook" }, GEO_ERROR_PERMISSION_DENIED),
    ).toBe("denied-in-app");
  });
  it("timeout and unavailable stay distinct (only one is retryable)", () => {
    expect(classifyGeoFailure(normalEnv, GEO_ERROR_TIMEOUT)).toBe("timeout");
    expect(classifyGeoFailure(normalEnv, GEO_ERROR_POSITION_UNAVAILABLE)).toBe("unavailable");
  });
  it("unknown error codes degrade to unavailable — never to a scary dead end", () => {
    expect(classifyGeoFailure(normalEnv, 99)).toBe("unavailable");
    expect(classifyGeoFailure(normalEnv, null)).toBe("unavailable");
  });
});

describe("recovery contract — retry only when retry can succeed", () => {
  it("timeout/unavailable are retryable", () => {
    expect(canRetrySucceed("timeout")).toBe(true);
    expect(canRetrySucceed("unavailable")).toBe(true);
  });
  it("denied/blocked/unsupported are NOT retryable in-page", () => {
    expect(canRetrySucceed("denied")).toBe(false);
    expect(canRetrySucceed("denied-in-app")).toBe(false);
    expect(canRetrySucceed("unsupported")).toBe(false);
    expect(canRetrySucceed("insecure-context")).toBe(false);
  });
  it("open-in-browser guidance appears exactly when it can unblock", () => {
    expect(needsOpenInBrowserGuidance("denied-in-app", { ...normalEnv, inApp: "facebook" })).toBe(true);
    expect(
      needsOpenInBrowserGuidance("unsupported", { ...normalEnv, apiAvailable: false, inApp: "instagram" }),
    ).toBe(true);
    expect(needsOpenInBrowserGuidance("denied", normalEnv)).toBe(false);
    expect(needsOpenInBrowserGuidance("timeout", normalEnv)).toBe(false);
  });
});
