import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import {
  ANALYTICS_CONSENT_KEY,
  CONSENT_BOOTSTRAP_SCRIPT,
  CONSENT_VALID_DAYS,
  parseConsentRecord,
} from "@/lib/consent/analytics-consent";

/**
 * THE BANNER DOES NOT MOVE THE PAGE (UX-3). It is in the first paint, and the inline
 * script hides it before paint for a person who already chose. That script is a copy
 * of `parseConsentRecord` in plain text, so both must answer the same on every value:
 * if the script hid the banner for an expired or malformed choice, a person would
 * never be asked, and "no choice means no" would quietly stop being asked for.
 */
const WEB = resolve(__dirname, "../..");

function hides(stored: string | null, storageThrows = false): boolean {
  let marked = false;
  runInNewContext(CONSENT_BOOTSTRAP_SCRIPT, {
    localStorage: {
      getItem: (k: string) => {
        if (storageThrows) throw new Error("blocked");
        return k === ANALYTICS_CONSENT_KEY ? stored : null;
      },
    },
    document: { documentElement: { setAttribute: () => (marked = true) } },
  });
  return marked;
}

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const json = (v: unknown) => JSON.stringify(v);

describe("the inline script agrees with parseConsentRecord", () => {
  it.each([
    ["no value", null],
    ["not JSON", "{oops"],
    ["null", "null"],
    ["an array", "[]"],
    ["a string", json("granted")],
    ["an unknown choice", json({ choice: "maybe", decidedOn: day(1) })],
    ["no date", json({ choice: "granted" })],
    ["a malformed date", json({ choice: "granted", decidedOn: "2026-1-1" })],
    ["an impossible date", json({ choice: "granted", decidedOn: "2026-99-99" })],
    ["granted today", json({ choice: "granted", decidedOn: day(0) })],
    ["refused a month ago", json({ choice: "refused", decidedOn: day(30) })],
    ["still within the term", json({ choice: "granted", decidedOn: day(CONSENT_VALID_DAYS - 1) })],
    ["expired", json({ choice: "granted", decidedOn: day(CONSENT_VALID_DAYS + 2) })],
  ])("%s", (_name, stored) => {
    expect(hides(stored)).toBe(parseConsentRecord(stored) !== null);
  });

  it("blocked storage asks, as readAnalyticsConsent does", () => {
    expect(hides(null, true)).toBe(false);
  });
});

describe("how the banner reaches the first paint", () => {
  const banner = readFileSync(resolve(WEB, "components/app/analytics-consent.tsx"), "utf8");
  const layout = readFileSync(resolve(WEB, "app/[locale]/layout.tsx"), "utf8");
  const css = readFileSync(resolve(WEB, "app/globals.css"), "utf8");

  it("the server renders it: only a known choice removes it", () => {
    expect(banner).toContain("if (ready && choice !== null) return null;");
    expect(banner).not.toContain("if (!ready || choice !== null) return null;");
  });

  it("stays in the page flow, so it never covers a field or a CTA", () => {
    const start = banner.indexOf("export function AnalyticsConsentBanner");
    expect(banner.slice(start, banner.indexOf("export function AnalyticsConsentControl"))).not.toMatch(/\b(fixed|sticky|absolute)\b/);
  });

  it("the script runs in <head>, before the body paints", () => {
    expect(layout.indexOf("CONSENT_BOOTSTRAP_SCRIPT }}")).toBeGreaterThan(-1);
    expect(layout.indexOf("CONSENT_BOOTSTRAP_SCRIPT }}")).toBeLessThan(layout.indexOf("</head>"));
  });

  it("the mark hides it", () => {
    expect(css).toMatch(/html\[data-consent-decided\] \[data-testid="analytics-consent-banner"\] \{\s*display: none;/);
  });

  it("the script reads one key and writes nothing to the device", () => {
    expect(CONSENT_BOOTSTRAP_SCRIPT).not.toMatch(/setItem|cookie|removeItem/);
  });
});
