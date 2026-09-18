import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the public jobs pages speak the work-world grammar and carry no
 * dead utility class (`text-muted-foreground`, `hover:bg-accent`,
 * `border-input`, `bg-background`, `border-foreground` were shadcn names never
 * in the token map — they compiled to NO CSS). Disclosure rules unchanged.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const DEAD = /\b(text-muted-foreground|bg-accent(\/\d+)?|border-input|bg-background|border-foreground|text-primary-foreground|bg-primary|hover:bg-muted)\b/;

describe("Guard: PUBLIC JOBS wear the work-world grammar", () => {
  it("no dead (undefined) utility class remains on the jobs pages", () => {
    for (const rel of [
      "app/[locale]/(marketing)/jobs/page.tsx",
      "app/[locale]/(marketing)/jobs/[id]/page.tsx",
      "components/marketing/public-vacancy-card.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(DEAD);
    }
  });

  it("the public vacancy card states its publication time as a mono stamp and discloses nothing new", () => {
    const card = read("components/marketing/public-vacancy-card.tsx");
    expect(card).toMatch(/<PlaceTimeStamp>\{published\}<\/PlaceTimeStamp>/);
    const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(code).not.toMatch(/vacancy\.(employer|location|applicationUrl)|PlacePrecision/);
  });

  it("the member-only job detail states place precision from the real fields — never inferred upward", () => {
    const detail = read("app/[locale]/(marketing)/jobs/[id]/page.tsx");
    expect(detail).toMatch(/function locationPrecision\(/);
    expect(detail).toMatch(/if \(city && city\.trim\(\)\.length > 0\) return "city";/);
    expect(detail).toMatch(/if \(country && country\.trim\(\)\.length > 0\) return "country";/);
    expect(detail).toMatch(/locationLabel && \([\s\S]{0,900}<PlacePrecision kind=\{kind\}/);
  });
});
