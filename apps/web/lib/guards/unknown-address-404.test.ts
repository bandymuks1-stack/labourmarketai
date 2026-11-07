import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isUnknownAddress, KNOWN_FIRST_SEGMENTS } from "@/lib/routing/known-first-segments";

/**
 * AN ADDRESS NOTHING CAN ANSWER GETS A REAL 404 PAGE (UX-9), and a page that exists is
 * never mistaken for one: forgetting a new directory here would 404 a live page.
 */
const WEB = resolve(__dirname, "../..");
const LOCALE_DIR = join(WEB, "app", "[locale]");

const dirs = (dir: string) => readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());

/** Every first segment under [locale]: route groups are transparent, the catch-all is not a name. */
function firstSegments(): string[] {
  const out: string[] = [];
  for (const d of dirs(LOCALE_DIR)) {
    if (d === "[...rest]") continue;
    if (d.startsWith("(")) out.push(...dirs(join(LOCALE_DIR, d)).filter((c) => !c.startsWith("[") && !c.startsWith("_")));
    else out.push(d);
  }
  return out;
}

describe("the list of first segments", () => {
  it("names every directory, so no live page can answer 404", () => {
    for (const s of firstSegments()) expect(KNOWN_FIRST_SEGMENTS.has(s), s).toBe(true);
  });

  it("names nothing that is gone, other than the two image routes", () => {
    const real = new Set([...firstSegments(), "opengraph-image", "twitter-image"]);
    for (const s of KNOWN_FIRST_SEGMENTS) expect(real.has(s), s).toBe(true);
  });

  it("the two image routes still exist as files", () => {
    for (const f of ["opengraph-image.tsx", "twitter-image.tsx"]) {
      expect(statSync(join(LOCALE_DIR, f)).isFile()).toBe(true);
    }
  });
});

describe("isUnknownAddress", () => {
  it.each([
    ["", false],
    ["/", false],
    ["/jobs", false],
    ["/jobs/a/b", false],
    ["/auth/login", false],
    ["/dashboard/x", false],
    ["/this-page-does-not-exist", true],
    ["/jobs-x", true],
    ["/nera-tokio/gilu", true],
  ])("%s", (rest, unknown) => {
    expect(isUnknownAddress(rest)).toBe(unknown);
  });
});

describe("how it is wired", () => {
  const middleware = readFileSync(join(WEB, "middleware.ts"), "utf8");
  const page = readFileSync(join(LOCALE_DIR, "[...rest]", "page.tsx"), "utf8");

  it("the middleware keeps the 404 status", () => {
    expect(middleware).toMatch(/NextResponse\.rewrite\(target, \{ status: 404 \}\)/);
  });

  it("the router's own fetch is not a 404: that reloads the whole page", () => {
    expect(middleware).toMatch(/request\.headers\.get\("sec-fetch-dest"\) === "empty"\s*\?\s*NextResponse\.rewrite\(target\)/);
  });

  it("the catch-all renders the one not-found view for that address, never indexed", () => {
    expect(page).toContain('import NotFound from "../not-found"');
    expect(page).toMatch(/robots: \{ index: false/);
    expect(page).toMatch(/rest\[0\] !== UNKNOWN_ADDRESS_SEGMENT\) notFound\(\);/);
  });

  it("no sitemap lists it", () => {
    expect(readFileSync(join(WEB, "app", "sitemap.ts"), "utf8")).not.toContain("unknown-address");
    expect(KNOWN_FIRST_SEGMENTS.has("unknown-address")).toBe(false);
  });
});
