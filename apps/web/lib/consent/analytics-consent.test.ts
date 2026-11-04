import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_CONSENT_KEY,
  CONSENT_VALID_DAYS,
  hasAnalyticsConsent,
  parseConsentRecord,
  purgeAnalyticsStorage,
  readAnalyticsConsent,
  setAnalyticsConsent,
  whenAnalyticsConsentGranted,
} from "@/lib/consent/analytics-consent";
import {
  captureFirstTouchAttribution,
  getFirstTouchAttribution,
} from "@/lib/telemetry/attribution";

/**
 * ANALYTICS CONSENT (owner decision 2026-11-03): no non-essential item is
 * stored on, or sent from, the device before an explicit yes; a refusal or a
 * withdrawal removes them; an unknown, malformed or expired record is NO.
 * Run under vitest's `node` environment with a hand-built window, so the
 * storage is inspectable directly.
 */

function memoryStorage(initial: Record<string, string> = {}): Storage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function installWindow(local = memoryStorage(), session = memoryStorage(), search = "?utm_source=fb&utm_campaign=w1") {
  const listeners = new Map<string, Set<() => void>>();
  (globalThis as { window?: unknown }).window = {
    localStorage: local,
    sessionStorage: session,
    location: { search, pathname: "/lt/for-workers", host: "labourmarket.test" },
    addEventListener: (t: string, fn: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: () => void) => listeners.get(t)?.delete(fn),
    dispatchEvent: (e: Event) => {
      for (const fn of [...(listeners.get(e.type) ?? [])]) fn();
      return true;
    },
  };
  (globalThis as { document?: unknown }).document = { referrer: "" };
  return { local, session };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

describe("the stored choice", () => {
  const now = new Date("2026-11-03T12:00:00Z");

  it("no record, malformed, unknown choice or bad date = no choice (never a yes)", () => {
    expect(parseConsentRecord(null, now)).toBeNull();
    expect(parseConsentRecord("yes", now)).toBeNull();
    expect(parseConsentRecord(JSON.stringify({ choice: "maybe", decidedOn: "2026-11-01" }), now)).toBeNull();
    expect(parseConsentRecord(JSON.stringify({ choice: "granted", decidedOn: "yesterday" }), now)).toBeNull();
  });

  it("a choice expires after CONSENT_VALID_DAYS and is asked again", () => {
    const fresh = JSON.stringify({ choice: "granted", decidedOn: "2026-11-01" });
    expect(parseConsentRecord(fresh, now)).toEqual({ choice: "granted", decidedOn: "2026-11-01" });
    const old = new Date(now.getTime() - (CONSENT_VALID_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    expect(parseConsentRecord(JSON.stringify({ choice: "granted", decidedOn: old }), now)).toBeNull();
  });

  it("only an explicit yes counts; without a window there is no consent", () => {
    expect(hasAnalyticsConsent()).toBe(false);
    installWindow();
    expect(hasAnalyticsConsent()).toBe(false);
    setAnalyticsConsent("refused");
    expect(hasAnalyticsConsent()).toBe(false);
    setAnalyticsConsent("granted");
    expect(hasAnalyticsConsent()).toBe(true);
    expect(readAnalyticsConsent()?.choice).toBe("granted");
  });
});

describe("no non-essential storage before a yes", () => {
  it("first-touch attribution is neither written nor read without consent", () => {
    const { local } = installWindow();
    expect(captureFirstTouchAttribution()).toBeNull();
    expect(local.map.has("lm.attr.first")).toBe(false);
    local.setItem("lm.attr.first", JSON.stringify({ utm_source: "old" }));
    expect(getFirstTouchAttribution()).toEqual({});
  });

  it("after a yes the same landing is captured", () => {
    const { local } = installWindow();
    setAnalyticsConsent("granted");
    expect(captureFirstTouchAttribution()).toMatchObject({ utm_source: "fb", utm_campaign: "w1" });
    expect(local.map.has("lm.attr.first")).toBe(true);
  });

  it("refusing removes every non-essential item and keeps the person's other items", () => {
    const local = memoryStorage({
      "lm.attr.first": "{}",
      "lm.funnel.last_seen_day": "2026-11-02",
      "lm.funnel.signup_pending": "google",
      "lm-theme": "dark",
    });
    const session = memoryStorage({ "lm.pilot.session": "s_1", "lm.funnel.landing_fired": "1", "lm.chat.continueAfterSwitch": "x" });
    installWindow(local, session);
    setAnalyticsConsent("refused");
    expect([...local.map.keys()].sort()).toEqual([ANALYTICS_CONSENT_KEY, "lm-theme"].sort());
    expect([...session.map.keys()]).toEqual(["lm.chat.continueAfterSwitch"]);
  });

  it("purge never throws when storage is blocked", () => {
    (globalThis as { window?: unknown }).window = {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
      get sessionStorage(): Storage {
        throw new Error("SecurityError");
      },
    };
    expect(() => purgeAnalyticsStorage()).not.toThrow();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

describe("a yes given later on the page still counts the page", () => {
  it("runs once on grant, not on refusal", () => {
    installWindow();
    const fn = vi.fn();
    whenAnalyticsConsentGranted(fn);
    expect(fn).not.toHaveBeenCalled();
    setAnalyticsConsent("refused");
    expect(fn).not.toHaveBeenCalled();
    setAnalyticsConsent("granted");
    setAnalyticsConsent("granted");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs at once when consent already exists", () => {
    installWindow();
    setAnalyticsConsent("granted");
    const fn = vi.fn();
    whenAnalyticsConsentGranted(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
